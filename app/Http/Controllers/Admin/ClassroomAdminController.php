<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ClassroomAdminRequest;
use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\ClassroomMember;
use App\Models\GameHistory;
use App\Models\User;
use App\Services\Ai\ClassroomAiText;
use App\Services\Classrooms\ClassroomAnnouncer;
use App\Services\Classrooms\ClassroomReport;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin overview of every teacher classroom: what is scheduled, running
 * or finished, who is inside right now and how the class performed.
 */
class ClassroomAdminController extends Controller
{
    public function __construct(
        private ClassroomReport $report,
        private ClassroomAnnouncer $announcer,
    ) {}

    public function index(ClassroomAdminRequest $request): Response
    {
        $filters = $request->filters();
        $now = now();

        return Inertia::render('admin/classrooms/index', [
            'filters' => $filters,
            'summary' => $this->summary($now),
            'teachers' => $this->teacherOptions(),
            'classrooms' => $this->paginate($filters, $now),
        ]);
    }

    public function show(Classroom $classroom): Response
    {
        $classroom->load(['teacher.playerProfile', 'games.questions:id,subject']);
        $status = $classroom->status();

        return Inertia::render('admin/classrooms/show', [
            'classroom' => [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'description' => $classroom->description,
                'pin' => $classroom->pin,
                'status' => $status,
                'starts_at' => $classroom->starts_at?->toIso8601String(),
                'ends_at' => $classroom->ends_at?->toIso8601String(),
                'closed_at' => $classroom->closed_at?->toIso8601String(),
                'created_at' => $classroom->created_at?->toIso8601String(),
                'max_members' => $classroom->max_members,
                'ai_status' => $classroom->ai_status,
                'ai_summary' => ClassroomAiText::decode($classroom->ai_summary, ClassroomAiText::SUMMARY_SECTIONS, 'overview'),
                'report_generated_at' => $classroom->report_generated_at?->toIso8601String(),
                'teacher' => $classroom->teacher ? [
                    'id' => $classroom->teacher->id,
                    'name' => $classroom->teacher->name,
                    'nickname' => $classroom->teacher->playerProfile?->nickname,
                    'email' => $classroom->teacher->email,
                    'avatar_url' => $classroom->teacher->avatar_url,
                ] : null,
            ],
            'games' => $classroom->games->map(fn (ClassroomGame $game): array => [
                'id' => $game->id,
                'game_key' => $game->game_key,
                'max_plays' => $game->max_plays,
                'difficulty' => $game->difficulty,
                'difficulty_options' => [1, 2, 3],
                'subjects' => $game->playSubjects(),
                'questions_count' => $game->questions->count(),
            ])->values()->all(),
            'members' => fn (): array => $this->members($classroom),
            'announcements' => $this->announcer->recent($classroom),
            'report' => Inertia::defer(fn (): array => $status === Classroom::STATUS_ENDED
                ? ($classroom->report ?? $this->report->forClassroom($classroom))
                : $this->report->forClassroom($classroom), 'report'),
            'onlineSeconds' => Classroom::ONLINE_SECONDS,
        ]);
    }

    /**
     * @return array{total: int, scheduled: int, active: int, ended: int, members: int, online: int}
     */
    private function summary(Carbon $now): array
    {
        return [
            'total' => Classroom::query()->count(),
            'scheduled' => Classroom::query()->where('starts_at', '>', $now)->count(),
            'active' => Classroom::query()->activeAt($now)->count(),
            'ended' => Classroom::query()->where('ends_at', '<=', $now)->count(),
            'members' => ClassroomMember::query()->whereNull('left_at')->count(),
            'online' => ClassroomMember::query()
                ->whereNull('left_at')
                ->where('last_seen_at', '>', $now->copy()->subSeconds(Classroom::ONLINE_SECONDS))
                ->whereHas('classroom', fn (Builder $query) => $query->activeAt($now))
                ->count(),
        ];
    }

    /**
     * Teachers that own at least one classroom, for the filter.
     *
     * @return list<array{id: int, name: string}>
     */
    private function teacherOptions(): array
    {
        return User::query()
            ->whereIn('id', Classroom::query()->select('teacher_id'))
            ->with('playerProfile:id,user_id,nickname')
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (User $teacher): array => [
                'id' => $teacher->id,
                'name' => $teacher->playerProfile?->nickname ?: $teacher->name,
            ])
            ->values()
            ->all();
    }

    /**
     * @param  array{status: ?string, search: ?string, teacher_id: ?int}  $filters
     * @return LengthAwarePaginator<int, array<string, mixed>>
     */
    private function paginate(array $filters, Carbon $now): LengthAwarePaginator
    {
        $onlineSince = $now->copy()->subSeconds(Classroom::ONLINE_SECONDS);

        $classrooms = Classroom::query()
            ->with(['teacher:id,name,email,avatar_url', 'teacher.playerProfile:id,user_id,nickname', 'games:id,classroom_id,game_key,sort_order'])
            ->withCount([
                'members' => fn (Builder $query) => $query->whereNull('left_at'),
                'members as online_count' => fn (Builder $query) => $query
                    ->whereNull('left_at')
                    ->where('last_seen_at', '>', $onlineSince),
                'gameHistories as plays_count',
            ])
            ->when($filters['status'] === Classroom::STATUS_SCHEDULED, fn (Builder $query) => $query->where('starts_at', '>', $now))
            ->when($filters['status'] === Classroom::STATUS_ACTIVE, fn (Builder $query) => $query->activeAt($now))
            ->when($filters['status'] === Classroom::STATUS_ENDED, fn (Builder $query) => $query->where('ends_at', '<=', $now))
            ->when($filters['teacher_id'], fn (Builder $query, int $teacherId) => $query->where('teacher_id', $teacherId))
            ->when($filters['search'], function (Builder $query, string $search): void {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn (Builder $query) => $query
                    ->where('name', 'like', $like)
                    ->orWhere('pin', 'like', $like)
                    ->orWhereHas('teacher', fn (Builder $teacher) => $teacher
                        ->where('name', 'like', $like)
                        ->orWhere('email', 'like', $like)
                        ->orWhereHas('playerProfile', fn (Builder $profile) => $profile->where('nickname', 'like', $like))));
            })
            ->orderByRaw('CASE WHEN starts_at <= ? AND ends_at > ? THEN 0 WHEN starts_at > ? THEN 1 ELSE 2 END', [$now, $now, $now])
            ->orderByRaw('CASE WHEN starts_at > ? THEN starts_at END ASC', [$now])
            ->orderByDesc('ends_at')
            ->orderByDesc('id')
            ->paginate(20)
            ->withQueryString();

        return $classrooms->through(fn (Classroom $classroom): array => [
            'id' => $classroom->id,
            'name' => $classroom->name,
            'pin' => $classroom->pin,
            'status' => $classroom->status($now),
            'starts_at' => $classroom->starts_at?->toIso8601String(),
            'ends_at' => $classroom->ends_at?->toIso8601String(),
            'max_members' => $classroom->max_members,
            'members_count' => (int) $classroom->members_count,
            'online_count' => $classroom->status($now) === Classroom::STATUS_ACTIVE ? (int) $classroom->online_count : 0,
            'plays' => (int) $classroom->plays_count,
            'games' => $classroom->games->pluck('game_key')->values()->all(),
            'ai_status' => $classroom->ai_status,
            'teacher' => $classroom->teacher ? [
                'id' => $classroom->teacher->id,
                'name' => $classroom->teacher->playerProfile?->nickname ?: $classroom->teacher->name,
                'email' => $classroom->teacher->email,
                'avatar_url' => $classroom->teacher->avatar_url,
            ] : null,
        ]);
    }

    /**
     * Every member (removed ones too) with presence and results in this classroom.
     *
     * @return list<array<string, mixed>>
     */
    private function members(Classroom $classroom): array
    {
        $active = $classroom->status() === Classroom::STATUS_ACTIVE;

        /** @var Collection<int, GameHistory> $stats */
        $stats = GameHistory::query()
            ->where('classroom_id', $classroom->id)
            ->selectRaw('user_id, COUNT(*) as plays, COALESCE(SUM(correct), 0) as correct, COALESCE(SUM(wrong), 0) as wrong, COALESCE(SUM(points), 0) as points, MAX(played_at) as last_played_at')
            ->groupBy('user_id')
            ->get()
            ->keyBy('user_id');

        return $classroom->members()
            ->with(['user:id,name,email,avatar_url', 'user.playerProfile:id,user_id,nickname,grade,school_name'])
            ->orderByRaw('CASE WHEN left_at IS NULL THEN 0 ELSE 1 END')
            ->orderByDesc('last_seen_at')
            ->orderBy('id')
            ->get()
            ->map(function (ClassroomMember $member) use ($stats, $active): array {
                $row = $stats->get($member->user_id);
                $correct = (int) ($row?->getAttribute('correct') ?? 0);
                $wrong = (int) ($row?->getAttribute('wrong') ?? 0);
                $answered = $correct + $wrong;
                $online = $active && $member->isOnline();

                return [
                    'id' => $member->id,
                    'user_id' => $member->user_id,
                    'name' => $member->user?->playerProfile?->nickname ?: ($member->user?->name ?? ''),
                    'account_name' => $member->user?->name,
                    'avatar_url' => $member->user?->avatar_url,
                    'grade' => $member->user?->playerProfile?->grade,
                    'school_name' => $member->user?->playerProfile?->school_name,
                    'joined_at' => $member->joined_at?->toIso8601String(),
                    'left_at' => $member->left_at?->toIso8601String(),
                    'last_seen_at' => $member->last_seen_at?->toIso8601String(),
                    'online' => $online,
                    'current_game' => $online ? $member->current_game : null,
                    'plays' => (int) ($row?->getAttribute('plays') ?? 0),
                    'answered' => $answered,
                    'correct' => $correct,
                    'wrong' => $wrong,
                    'accuracy' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
                    'points' => (int) ($row?->getAttribute('points') ?? 0),
                    'last_played_at' => $row?->getAttribute('last_played_at') ? Carbon::parse($row->getAttribute('last_played_at'))->toIso8601String() : null,
                    'report_shared_at' => $member->report_shared_at?->toIso8601String(),
                    'ai_feedback' => ClassroomAiText::decode($member->ai_feedback, ClassroomAiText::STUDENT_SECTIONS, 'strengths'),
                ];
            })
            ->values()
            ->all();
    }
}
