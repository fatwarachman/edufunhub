<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Teacher\ClassroomQuestionOptionsRequest;
use App\Http\Requests\Teacher\ClassroomRequest;
use App\Jobs\AnalyzeClassroom;
use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\Question;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Services\Ai\AiSettings;
use App\Services\Classrooms\ClassroomLive;
use App\Services\Classrooms\ClassroomReport;
use App\Services\PlayerNotifications;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ClassroomController extends Controller
{
    public function __construct(
        private ClassroomLive $live,
        private ClassroomReport $report,
        private AiSettings $ai,
    ) {}

    public function index(Request $request): Response
    {
        $teacher = $request->user();
        $status = $request->query('status');

        $classrooms = Classroom::query()
            ->where('teacher_id', $teacher->id)
            ->withCount(['members', 'games'])
            ->when($status === 'scheduled', fn (Builder $q) => $q->where('starts_at', '>', now()))
            ->when($status === 'active', fn (Builder $q) => $q->where('starts_at', '<=', now())->where('ends_at', '>', now()))
            ->when($status === 'ended', fn (Builder $q) => $q->where('ends_at', '<=', now()))
            ->latest('id')
            ->paginate(15)
            ->withQueryString();

        $classrooms->getCollection()->transform(function (Classroom $classroom): array {
            $live = $this->live->forClassroom($classroom);

            return [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'pin' => $classroom->pin,
                'status' => $classroom->status(),
                'starts_at' => $classroom->starts_at?->toIso8601String(),
                'ends_at' => $classroom->ends_at?->toIso8601String(),
                'games' => $classroom->gameKeys(),
                'members_count' => $classroom->members_count,
                'online_count' => $live['online_count'],
            ];
        });

        return Inertia::render('teacher/classrooms/index', [
            'classrooms' => $classrooms,
            'filters' => ['status' => $status],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('teacher/classrooms/form', [
            'classroom' => null,
            ...$this->options(),
        ]);
    }

    public function store(ClassroomRequest $request): RedirectResponse
    {
        $classroom = Classroom::query()->create([
            'teacher_id' => $request->user()->id,
            'name' => $request->validated('name'),
            'description' => $request->validated('description'),
            'pin' => Classroom::freshPin(),
            'starts_at' => $request->validated('starts_at'),
            'ends_at' => now()->parse($request->validated('starts_at'))->addMinutes((int) $request->validated('duration_minutes')),
            'max_members' => $request->validated('max_members', 100),
        ]);

        foreach ($request->games() as $game) {
            $classroomGame = $classroom->games()->create([
                'game_key' => $game['game_key'],
                'sort_order' => $game['sort_order'],
            ]);

            if ($game['question_ids'] !== []) {
                $pivotData = [];
                foreach ($game['question_ids'] as $i => $questionId) {
                    $pivotData[$questionId] = ['sort_order' => $i];
                }
                $classroomGame->questions()->sync($pivotData);
            }
        }

        activity()->causedBy($request->user())->performedOn($classroom)->log('Teacher created classroom');

        return redirect()->route('teacher.classrooms.show', $classroom)->with('success', __('classrooms.created'));
    }

    public function show(Classroom $classroom, Request $request): Response
    {
        Gate::authorize('view', $classroom);

        $classroom->loadMissing('games.questions');

        $props = [
            'classroom' => [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'description' => $classroom->description,
                'pin' => $classroom->pin,
                'join_path' => route('classrooms.show', ['pin' => $classroom->pin], false),
                'status' => $classroom->status(),
                'starts_at' => $classroom->starts_at?->toIso8601String(),
                'ends_at' => $classroom->ends_at?->toIso8601String(),
                'max_members' => $classroom->max_members,
                'games' => $classroom->games->map(fn (ClassroomGame $g): array => [
                    'game_key' => $g->game_key,
                    'questions' => $g->questions->map(fn (Question $q): array => [
                        'id' => $q->id,
                        'prompt_id' => $q->prompt_id,
                        'prompt_en' => $q->prompt_en,
                        'type' => $q->type,
                    ]),
                ]),
                'ai_status' => $classroom->ai_status,
                'ai_summary' => $classroom->ai_summary,
                'ai_available' => $this->ai->configured(),
                'report_generated_at' => $classroom->report_generated_at?->toIso8601String(),
            ],
        ];

        if ($classroom->status() === Classroom::STATUS_ENDED) {
            $props['report'] = $classroom->report ?? $this->report->forClassroom($classroom);
        } else {
            $props['live'] = $this->live->forClassroom($classroom);
            $props['report'] = $this->report->forClassroom($classroom);
        }

        return Inertia::render('teacher/classrooms/show', $props);
    }

    public function live(Classroom $classroom, Request $request): JsonResponse
    {
        Gate::authorize('view', $classroom);

        return response()->json($this->live->forClassroom($classroom));
    }

    public function edit(Classroom $classroom): Response
    {
        Gate::authorize('update', $classroom);

        $classroom->loadMissing('games.questions');

        return Inertia::render('teacher/classrooms/form', [
            'classroom' => [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'description' => $classroom->description,
                'starts_at' => $classroom->starts_at?->toIso8601String(),
                'duration_minutes' => $classroom->ends_at && $classroom->starts_at
                    ? $classroom->starts_at->diffInMinutes($classroom->ends_at)
                    : 60,
                'max_members' => $classroom->max_members,
                'games' => $classroom->games->map(fn (ClassroomGame $g): array => [
                    'game_key' => $g->game_key,
                    'question_ids' => $g->questions->pluck('id')->all(),
                ])->all(),
            ],
            ...$this->options(),
        ]);
    }

    public function update(ClassroomRequest $request, Classroom $classroom): RedirectResponse
    {
        Gate::authorize('update', $classroom);

        $classroom->update([
            'name' => $request->validated('name'),
            'description' => $request->validated('description'),
            'starts_at' => $request->validated('starts_at'),
            'ends_at' => now()->parse($request->validated('starts_at'))->addMinutes((int) $request->validated('duration_minutes')),
            'max_members' => $request->validated('max_members', $classroom->max_members),
        ]);

        $classroom->games()->delete();
        foreach ($request->games() as $game) {
            $classroomGame = $classroom->games()->create([
                'game_key' => $game['game_key'],
                'sort_order' => $game['sort_order'],
            ]);

            if ($game['question_ids'] !== []) {
                $pivotData = [];
                foreach ($game['question_ids'] as $i => $questionId) {
                    $pivotData[$questionId] = ['sort_order' => $i];
                }
                $classroomGame->questions()->sync($pivotData);
            }
        }

        activity()->causedBy($request->user())->performedOn($classroom)->log('Teacher updated classroom');

        return redirect()->route('teacher.classrooms.show', $classroom)->with('success', __('classrooms.updated'));
    }

    public function destroy(Classroom $classroom, Request $request): RedirectResponse
    {
        Gate::authorize('delete', $classroom);

        activity()->causedBy($request->user())->performedOn($classroom)->log('Teacher deleted classroom');
        $classroom->delete();

        return redirect()->route('teacher.classrooms.index')->with('success', __('classrooms.deleted'));
    }

    public function end(Classroom $classroom, Request $request): RedirectResponse
    {
        Gate::authorize('end', $classroom);

        $classroom->update(['ends_at' => now()]);

        return redirect()->route('teacher.classrooms.show', $classroom)->with('success', __('classrooms.ended'));
    }

    public function removeMember(Request $request, Classroom $classroom): RedirectResponse
    {
        Gate::authorize('update', $classroom);

        $member = $classroom->members()->findOrFail((int) $request->input('member_id'));
        $member->update(['left_at' => now()]);

        return back()->with('success', __('classrooms.member_removed'));
    }

    public function analyze(Classroom $classroom, Request $request, AiSettings $ai): RedirectResponse
    {
        Gate::authorize('analyze', $classroom);

        if (! $ai->configured()) {
            return back()->withErrors(['ai' => __('ai.not_configured')]);
        }

        if (in_array($classroom->ai_status, ['queued', 'running'], true)) {
            return back()->withErrors(['ai' => __('classrooms.analysis_running')]);
        }

        $classroom->update(['ai_status' => 'queued']);
        AnalyzeClassroom::dispatch($classroom);

        return back()->with('success', __('classrooms.analysis_started'));
    }

    public function questionOptions(ClassroomQuestionOptionsRequest $request): JsonResponse
    {
        $teacher = $request->user();
        $game = $request->validated('game');

        $query = Question::query()
            ->where(function (Builder $q) use ($teacher): void {
                $q->where('created_by', $teacher->id)
                    ->orWhere(fn (Builder $q): Builder => $q->where('is_active', true)
                        ->where(fn (Builder $sub): Builder => $sub
                            ->where('source', '!=', 'teacher')
                            ->orWhere('is_active', true)
                        )
                    );
            })
            ->when($request->validated('mine'), fn (Builder $q) => $q->where('created_by', $teacher->id))
            ->when($game && in_array($game, Question::CHOICE_ONLY_GAMES, true), fn (Builder $q) => $q->where('type', Question::TYPE_CHOICE))
            ->when($request->validated('subject'), fn (Builder $q, string $subject) => $q->where('subject', $subject))
            ->when($request->validated('topic'), fn (Builder $q, int $topic) => $q->where('topic_id', $topic))
            ->when($request->validated('level'), fn (Builder $q, int $level) => $q->where('level', $level))
            ->when($request->validated('grade'), fn (Builder $q, int $grade) => $q->whereJsonContains('grades', $grade))
            ->when($request->validated('search'), fn (Builder $q, string $search) => $q->where(fn (Builder $q) => $q
                ->where('prompt_id', 'like', '%'.addcslashes($search, '%_\\').'%')
                ->orWhere('prompt_en', 'like', '%'.addcslashes($search, '%_\\').'%')
            ))
            ->with('topic:id,name_id,name_en')
            ->latest('id');

        $questions = $query->paginate(20)->withQueryString();

        $picks = $questions->through(fn (Question $q): array => [
            'id' => $q->id,
            'prompt_id' => $q->prompt_id,
            'prompt_en' => $q->prompt_en,
            'type' => $q->type,
            'subject' => $q->subject,
            'topic_id' => $q->topic_id,
            'topic' => $q->topic?->only(['id', 'name_id', 'name_en']),
            'level' => Question::normalizeLevel($q->level),
            'grades' => $q->grades ?? [],
            'source' => $q->source,
            'is_mine' => $q->created_by === $teacher->id,
        ]);

        return response()->json($picks);
    }

    public function share(Request $request, Classroom $classroom, PlayerNotifications $notifications): RedirectResponse
    {
        Gate::authorize('share', $classroom);

        $member = $classroom->members()->findOrFail((int) $request->input('member_id'));
        $report = $this->report->forStudent($member);

        $member->update([
            'report' => $report,
            'report_shared_at' => now(),
        ]);

        $notifications->notify(
            $member->user,
            'classroom',
            'player_notifications.classroom_report',
            ['classroom' => $classroom->name],
            '/portal/classrooms/report/'.$member->id,
        );

        return back()->with('success', __('classrooms.report_shared'));
    }

    public function shareAll(Request $request, Classroom $classroom, PlayerNotifications $notifications): RedirectResponse
    {
        Gate::authorize('share', $classroom);

        $members = $classroom->members()
            ->whereNull('left_at')
            ->whereHas('user.gameHistories', fn (Builder $q) => $q->where('classroom_id', $classroom->id))
            ->get();

        $count = 0;
        foreach ($members as $member) {
            $report = $this->report->forStudent($member);
            $member->update([
                'report' => $report,
                'report_shared_at' => now(),
            ]);

            $notifications->notify(
                $member->user,
                'classroom',
                'player_notifications.classroom_report',
                ['classroom' => $classroom->name],
                '/portal/classrooms/report/'.$member->id,
            );
            $count++;
        }

        return back()->with('success', __('classrooms.reports_shared', ['count' => $count]));
    }

    /** @return array<string, mixed> */
    private function options(): array
    {
        return [
            'games' => Question::GAMES,
            'choiceOnlyGames' => Question::CHOICE_ONLY_GAMES,
            'subjects' => Subject::activeKeys(),
            'topics' => SubjectTopic::forPicker(),
            'grades' => Question::GRADES,
            'levels' => array_keys(Question::LEVELS),
            'limits' => [
                'maxMembers' => Classroom::MAX_MEMBERS,
                'minDuration' => Classroom::MIN_DURATION,
                'maxDuration' => Classroom::MAX_DURATION,
                'maxGames' => Classroom::MAX_GAMES,
                'maxQuestionsPerGame' => Classroom::MAX_QUESTIONS_PER_GAME,
            ],
        ];
    }
}
