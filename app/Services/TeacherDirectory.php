<?php

namespace App\Services;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\GameHistory;
use App\Models\PointLedger;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\Role;
use App\Models\Subject;
use App\Models\TeacherRequest;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Super admin directory of teachers (users with the "guru" role): what they
 * authored, the classrooms they opened, who joined them, the compensation
 * their questions earned and their account points. Every per-teacher number
 * is a correlated subquery or eager aggregate so a page costs a fixed number
 * of queries.
 */
class TeacherDirectory
{
    public const PER_PAGE = 20;

    public const DEFAULT_SORT = 'questions';

    /** @var list<string> */
    public const SORTS = ['questions', 'classrooms', 'participants', 'compensation', 'points', 'name', 'joined'];

    /** @var array<string, string> */
    private const SORT_COLUMNS = [
        'questions' => 'questions_total',
        'classrooms' => 'classrooms_total',
        'participants' => 'participants_total',
        'compensation' => 'compensation_earned',
        'points' => 'account_points',
        'name' => 'users.name',
        'joined' => 'users.created_at',
    ];

    public function __construct(private TeacherQuestionStats $questionStats, private UserAnalytics $analytics) {}

    /**
     * @param  array{search?: ?string, subject?: ?string, sort?: ?string, direction?: ?string}  $filters
     * @return LengthAwarePaginator<int, array<string, mixed>>
     */
    public function paginate(array $filters, int $perPage = self::PER_PAGE): LengthAwarePaginator
    {
        $paginator = $this->query($filters)->paginate($perPage)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn (User $teacher): array => $this->presentRow($teacher)));

        return $paginator;
    }

    /**
     * Totals over every teacher (not affected by filters).
     *
     * @return array{teachers: int, active_teachers: int, questions: int, active_questions: int, classrooms: int, active_classrooms: int, participants: int, compensation: int, pending_requests: int}
     */
    public function summary(): array
    {
        $teacherIds = $this->teachers()->select('users.id');
        $now = now();

        return [
            'teachers' => $this->teachers()->count(),
            'active_teachers' => $this->teachers()->where('users.last_seen_at', '>=', $now->copy()->subDays(30))->count(),
            'questions' => Question::query()->whereIn('created_by', $teacherIds)->whereIn('source', Question::TEACHER_SOURCES)->count(),
            'active_questions' => Question::query()->whereIn('created_by', $teacherIds)->whereIn('source', Question::TEACHER_SOURCES)->active()->count(),
            'classrooms' => Classroom::query()->whereIn('teacher_id', $teacherIds)->count(),
            'active_classrooms' => Classroom::query()->whereIn('teacher_id', $teacherIds)->activeAt($now)->count(),
            'participants' => ClassroomMember::query()
                ->join('classrooms', 'classrooms.id', '=', 'classroom_members.classroom_id')
                ->whereIn('classrooms.teacher_id', $teacherIds)
                ->distinct()
                ->count('classroom_members.user_id'),
            'compensation' => (int) QuestionAnswer::query()
                ->join('questions', 'questions.id', '=', 'question_answers.question_id')
                ->whereIn('questions.created_by', $teacherIds)
                ->whereIn('questions.source', Question::TEACHER_SOURCES)
                ->sum('question_answers.compensation'),
            'pending_requests' => TeacherRequest::query()->where('status', TeacherRequest::PENDING)->count(),
        ];
    }

    /**
     * Full profile for the teacher detail page.
     *
     * @return array<string, mixed>
     */
    public function detail(User $teacher): array
    {
        $teacher->load([
            'roles:id,name,slug',
            'playerProfile:id,user_id,nickname,school_name,school_city,school_level',
            'teacherSubjects:id,user_id,subject_key',
            'teacherRequests' => fn ($query) => $query->with('reviewer:id,name')->latest('id'),
        ]);

        return [
            'teacher' => $this->presentProfile($teacher),
            'questions' => $this->questionDetail($teacher),
            'classrooms' => $this->classroomDetail($teacher),
            'points' => $this->pointDetail($teacher),
            'requests' => $teacher->teacherRequests->map(fn (TeacherRequest $request): array => [
                'id' => $request->id,
                'subject_key' => $request->subject_key,
                'status' => $request->status,
                'message' => $request->message,
                'reviewer' => $request->reviewer?->name,
                'reviewed_at' => $request->reviewed_at?->toIso8601String(),
                'created_at' => $request->created_at?->toIso8601String(),
            ])->values()->all(),
            'activity' => $this->analytics->activityFor($teacher, 20),
        ];
    }

    /** Whether the user holds the teacher role. */
    public function isTeacher(User $user): bool
    {
        return $this->teachers()->whereKey($user->id)->exists();
    }

    /**
     * Subjects for filters and labels, hidden ones included.
     *
     * @return list<array{key: string, name_id: string, name_en: ?string}>
     */
    public function subjects(): array
    {
        return array_map(fn (array $subject): array => [
            'key' => $subject['key'],
            'name_id' => $subject['name_id'],
            'name_en' => $subject['name_en'],
        ], Subject::catalog());
    }

    /** @return Builder<User> */
    private function teachers(): Builder
    {
        return User::query()->whereHas('roles', fn (Builder $query) => $query->where('slug', Role::TEACHER));
    }

    /**
     * @param  array{search?: ?string, subject?: ?string, sort?: ?string, direction?: ?string}  $filters
     * @return Builder<User>
     */
    private function query(array $filters): Builder
    {
        $now = now();
        $search = $filters['search'] ?? null;
        $subject = $filters['subject'] ?? null;
        $sort = self::SORT_COLUMNS[$filters['sort'] ?? self::DEFAULT_SORT] ?? self::SORT_COLUMNS[self::DEFAULT_SORT];
        $direction = ($filters['direction'] ?? null) === 'asc' ? 'asc' : 'desc';
        $teacherSource = fn (Builder $query) => $query->whereIn('source', Question::TEACHER_SOURCES);

        return $this->teachers()
            ->select(['users.id', 'users.name', 'users.email', 'users.avatar_url', 'users.created_at', 'users.last_seen_at', 'users.disabled_at'])
            ->with([
                'playerProfile:id,user_id,nickname,school_name,school_city',
                'teacherSubjects:id,user_id,subject_key',
            ])
            ->withCount([
                'authoredQuestions as questions_total' => $teacherSource,
                'authoredQuestions as questions_active' => fn (Builder $query) => $teacherSource($query)->where('is_active', true),
                'authoredQuestions as questions_manual' => fn (Builder $query) => $query->where('source', 'teacher'),
                'authoredQuestions as questions_imported' => fn (Builder $query) => $query->where('source', 'import'),
                'authoredQuestions as questions_ai' => fn (Builder $query) => $query->where('source', Question::SOURCE_AI),
                'teacherRequests as pending_requests' => fn (Builder $query) => $query->where('status', TeacherRequest::PENDING),
            ])
            ->withSum('pointLedgers as account_points', 'points')
            ->addSelect([
                'classrooms_total' => Classroom::query()->selectRaw('COUNT(*)')->whereColumn('classrooms.teacher_id', 'users.id'),
                'classrooms_active' => Classroom::query()->selectRaw('COUNT(*)')->whereColumn('classrooms.teacher_id', 'users.id')
                    ->where('classrooms.starts_at', '<=', $now)->where('classrooms.ends_at', '>', $now),
                'classrooms_scheduled' => Classroom::query()->selectRaw('COUNT(*)')->whereColumn('classrooms.teacher_id', 'users.id')
                    ->where('classrooms.starts_at', '>', $now),
                'participants_total' => ClassroomMember::query()
                    ->join('classrooms', 'classrooms.id', '=', 'classroom_members.classroom_id')
                    ->whereColumn('classrooms.teacher_id', 'users.id')
                    ->selectRaw('COUNT(DISTINCT classroom_members.user_id)'),
                'classroom_plays' => GameHistory::query()
                    ->join('classrooms', 'classrooms.id', '=', 'game_histories.classroom_id')
                    ->whereColumn('classrooms.teacher_id', 'users.id')
                    ->selectRaw('COUNT(*)'),
                'compensation_earned' => $this->answersSubquery()->selectRaw('COALESCE(SUM(question_answers.compensation), 0)'),
                'answers_total' => $this->answersSubquery()->selectRaw('COUNT(*)'),
                'answers_correct' => $this->answersSubquery()->selectRaw('COALESCE(SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END), 0)'),
            ])
            ->when($search, function (Builder $query, string $search): void {
                $term = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn (Builder $query) => $query
                    ->where('users.name', 'like', $term)
                    ->orWhere('users.email', 'like', $term)
                    ->orWhereHas('playerProfile', fn (Builder $profile) => $profile->where('nickname', 'like', $term)->orWhere('school_name', 'like', $term)));
            })
            ->when($subject, fn (Builder $query, string $subject) => $query->where(fn (Builder $query) => $query
                ->whereHas('teacherSubjects', fn (Builder $assigned) => $assigned->where(fn (Builder $keys) => $keys->where('subject_key', $subject)->orWhereNull('subject_key')))
                ->orWhereDoesntHave('teacherSubjects')))
            ->orderBy($sort, $direction)
            ->orderBy('users.id');
    }

    /** @return Builder<QuestionAnswer> */
    private function answersSubquery(): Builder
    {
        return QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->whereColumn('questions.created_by', 'users.id')
            ->whereIn('questions.source', Question::TEACHER_SOURCES);
    }

    /**
     * @return array{all: bool, keys: list<string>}
     */
    private function subjectsOf(User $teacher): array
    {
        $keys = $teacher->teacherSubjects->pluck('subject_key');

        return [
            'all' => $keys->isEmpty() || $keys->contains(null),
            'keys' => $keys->filter()->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function presentRow(User $teacher): array
    {
        $answers = (int) $teacher->getAttribute('answers_total');
        $correct = (int) $teacher->getAttribute('answers_correct');

        return [
            'id' => $teacher->id,
            'name' => $teacher->name,
            'nickname' => $teacher->playerProfile?->nickname,
            'email' => $teacher->email,
            'avatar_url' => $teacher->avatar_url,
            'school_name' => $teacher->playerProfile?->school_name,
            'school_city' => $teacher->playerProfile?->school_city,
            'disabled' => $teacher->disabled_at !== null,
            'joined_at' => $teacher->created_at?->toIso8601String(),
            'last_seen_at' => $teacher->last_seen_at?->toIso8601String(),
            'subjects' => $this->subjectsOf($teacher),
            'questions' => [
                'total' => (int) $teacher->getAttribute('questions_total'),
                'active' => (int) $teacher->getAttribute('questions_active'),
                'manual' => (int) $teacher->getAttribute('questions_manual'),
                'imported' => (int) $teacher->getAttribute('questions_imported'),
                'ai' => (int) $teacher->getAttribute('questions_ai'),
            ],
            'classrooms' => [
                'total' => (int) $teacher->getAttribute('classrooms_total'),
                'active' => (int) $teacher->getAttribute('classrooms_active'),
                'scheduled' => (int) $teacher->getAttribute('classrooms_scheduled'),
                'ended' => (int) $teacher->getAttribute('classrooms_total') - (int) $teacher->getAttribute('classrooms_active') - (int) $teacher->getAttribute('classrooms_scheduled'),
            ],
            'participants' => (int) $teacher->getAttribute('participants_total'),
            'classroom_plays' => (int) $teacher->getAttribute('classroom_plays'),
            'answers' => $answers,
            'success_rate' => $answers > 0 ? round($correct / $answers * 100, 1) : null,
            'account_points' => (int) $teacher->getAttribute('account_points'),
            'compensation' => (int) $teacher->getAttribute('compensation_earned'),
            'pending_requests' => (int) $teacher->getAttribute('pending_requests'),
        ];
    }

    /** @return array<string, mixed> */
    private function presentProfile(User $teacher): array
    {
        return [
            'id' => $teacher->id,
            'name' => $teacher->name,
            'nickname' => $teacher->playerProfile?->nickname,
            'email' => $teacher->email,
            'avatar_url' => $teacher->avatar_url,
            'school_name' => $teacher->playerProfile?->school_name,
            'school_city' => $teacher->playerProfile?->school_city,
            'school_level' => $teacher->playerProfile?->school_level,
            'is_superadmin' => (bool) $teacher->is_superadmin,
            'disabled' => $teacher->disabled_at !== null,
            'joined_at' => $teacher->created_at?->toIso8601String(),
            'last_seen_at' => $teacher->last_seen_at?->toIso8601String(),
            'roles' => $teacher->roles->map(fn (Role $role): array => ['id' => $role->id, 'name' => $role->name, 'slug' => $role->slug])->values()->all(),
            'subjects' => $this->subjectsOf($teacher),
        ];
    }

    /** @return array<string, mixed> */
    private function questionDetail(User $teacher): array
    {
        $overview = $this->questionStats->overview($teacher);

        $bySource = Question::query()
            ->where('created_by', $teacher->id)
            ->selectRaw('source, COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_total')
            ->groupBy('source')
            ->toBase()
            ->get()
            ->map(fn (object $row): array => ['source' => (string) $row->source, 'total' => (int) $row->total, 'active' => (int) $row->active_total])
            ->sortByDesc('total')
            ->values()
            ->all();

        $answersBySubject = QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->where('questions.created_by', $teacher->id)
            ->whereIn('questions.source', Question::TEACHER_SOURCES)
            ->selectRaw('questions.subject as subject_key, COUNT(*) as answered, SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END) as correct_count, COALESCE(SUM(question_answers.compensation), 0) as earned')
            ->groupBy('questions.subject')
            ->toBase()
            ->get()
            ->keyBy('subject_key');

        $bySubject = Question::query()
            ->authoredByTeacher($teacher)
            ->selectRaw('subject, COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_total')
            ->groupBy('subject')
            ->toBase()
            ->get()
            ->map(function (object $row) use ($answersBySubject): array {
                $answers = $answersBySubject->get($row->subject);
                $answered = (int) ($answers->answered ?? 0);
                $correct = (int) ($answers->correct_count ?? 0);

                return [
                    'subject' => (string) $row->subject,
                    'total' => (int) $row->total,
                    'active' => (int) $row->active_total,
                    'answered' => $answered,
                    'success_rate' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
                    'compensation' => (int) ($answers->earned ?? 0),
                ];
            })
            ->sortByDesc('total')
            ->values()
            ->all();

        $top = Question::query()
            ->authoredByTeacher($teacher)
            ->select(['id', 'key', 'subject', 'prompt_id', 'prompt_en', 'is_active', 'source', 'level'])
            ->withCount([
                'answers as answers_total',
                'answers as answers_correct' => fn (Builder $query) => $query->where('correct', true),
            ])
            ->withSum('answers as compensation_earned', 'compensation')
            ->whereHas('answers')
            ->orderByDesc('answers_total')
            ->orderBy('id')
            ->limit(5)
            ->get()
            ->map(function (Question $question): array {
                $answered = (int) $question->getAttribute('answers_total');
                $correct = (int) $question->getAttribute('answers_correct');

                return [
                    'id' => $question->id,
                    'key' => $question->key,
                    'subject' => $question->subject,
                    'prompt_id' => $question->prompt_id,
                    'prompt_en' => $question->prompt_en,
                    'is_active' => $question->is_active,
                    'source' => $question->source,
                    'answered' => $answered,
                    'success_rate' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
                    'compensation' => (int) $question->getAttribute('compensation_earned'),
                ];
            })
            ->all();

        return [
            'summary' => [
                ...$overview['summary'],
                'inactive_questions' => $overview['summary']['questions'] - $overview['summary']['active_questions'],
            ],
            'bySource' => $bySource,
            'bySubject' => $bySubject,
            'byLevel' => $overview['byLevel'],
            'byGame' => array_values(array_filter($overview['byGame'], fn (array $bucket): bool => $bucket['answered'] > 0)),
            'top' => $top,
        ];
    }

    /** @return array<string, mixed> */
    private function classroomDetail(User $teacher): array
    {
        $now = now();
        $classrooms = Classroom::query()
            ->where('teacher_id', $teacher->id)
            ->select(['id', 'teacher_id', 'name', 'pin', 'starts_at', 'ends_at', 'closed_at', 'max_members', 'created_at'])
            ->withCount(['members', 'gameHistories as plays', 'games'])
            ->latest('starts_at')
            ->latest('id')
            ->get();

        $rows = $classrooms->map(fn (Classroom $classroom): array => [
            'id' => $classroom->id,
            'name' => $classroom->name,
            'pin' => $classroom->pin,
            'status' => $classroom->status($now),
            'starts_at' => $classroom->starts_at?->toIso8601String(),
            'ends_at' => $classroom->ends_at?->toIso8601String(),
            'members' => (int) $classroom->members_count,
            'max_members' => (int) $classroom->max_members,
            'plays' => (int) $classroom->getAttribute('plays'),
            'games' => (int) $classroom->games_count,
        ]);

        return [
            'summary' => [
                'total' => $rows->count(),
                'scheduled' => $rows->where('status', Classroom::STATUS_SCHEDULED)->count(),
                'active' => $rows->where('status', Classroom::STATUS_ACTIVE)->count(),
                'ended' => $rows->where('status', Classroom::STATUS_ENDED)->count(),
                'memberships' => $rows->sum('members'),
                'participants' => ClassroomMember::query()
                    ->whereIn('classroom_id', $classrooms->pluck('id'))
                    ->distinct()
                    ->count('user_id'),
                'plays' => $rows->sum('plays'),
            ],
            'items' => $rows->take(50)->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function pointDetail(User $teacher): array
    {
        $totals = PointLedger::query()
            ->where('user_id', $teacher->id)
            ->selectRaw('COALESCE(SUM(points), 0) as balance, COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) as earned, COALESCE(SUM(CASE WHEN points < 0 THEN -points ELSE 0 END), 0) as spent, COUNT(*) as entries')
            ->toBase()
            ->first();

        return [
            'balance' => (int) ($totals->balance ?? 0),
            'earned' => (int) ($totals->earned ?? 0),
            'spent' => (int) ($totals->spent ?? 0),
            'entries' => (int) ($totals->entries ?? 0),
            'recent' => PointLedger::query()
                ->where('user_id', $teacher->id)
                ->latest('id')
                ->limit(10)
                ->get(['id', 'points', 'reason', 'created_at'])
                ->map(fn (PointLedger $entry): array => [
                    'id' => $entry->id,
                    'points' => $entry->points,
                    'reason' => $entry->reason,
                    'created_at' => $entry->created_at?->toIso8601String(),
                ])
                ->all(),
        ];
    }
}
