<?php

namespace App\Services\Ai;

use App\Models\AdCampaign;
use App\Models\AdDailyStat;
use App\Models\ChangelogEntry;
use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\Feedback;
use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\PointLedger;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\Role;
use App\Models\ScreenTimeDaily;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\TeacherRequest;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Models\UserBadge;
use App\Services\PlayerProgressReport;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Request-local, read-only projections. Never serialize complete models. */
class AdminAssistantData
{
    public const OPERATIONS = ['overview', 'catalog', 'players', 'player', 'results', 'matches', 'points', 'questions', 'question_difficulty', 'subjects', 'game_ranking', 'player_progress', 'ai_analyses', 'classrooms', 'teachers', 'screen_time', 'ads', 'leaderboard', 'score_leaderboard', 'changelog'];

    /** Rankings that compare players need a few answers before an accuracy means something. */
    public const MIN_ANSWERS = 3;

    /** @var array<string, array{label: string, url: string}> */
    private array $retrievedSources = [];

    private int $queries = 0;

    public function __construct(private User $actor) {}

    public function authorize(): void
    {
        abort_unless($this->actor->is_superadmin && User::query()->whereKey($this->actor->id)->where('is_superadmin', true)->whereNull('disabled_at')->exists(), 403);
    }

    /** @return list<array{label: string, url: string}> */
    public function sources(): array
    {
        return array_values($this->retrievedSources);
    }

    /** @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function query(array $input): array
    {
        $this->authorize();
        if (++$this->queries > 12) {
            throw ValidationException::withMessages(['operation' => __('ai_assistant.query_limit')]);
        }

        $gameKeys = collect(config('game-catalog.categories', []))->flatMap(fn (array $category): array => $category['games'])->pluck('key')->all();
        $validated = Validator::make(['query' => $input], [
            'query' => ['required', 'array:operation,search,user_id,game,subject,from,to'],
            'query.operation' => ['required', Rule::in(self::OPERATIONS)],
            'query.search' => ['sometimes', 'string', 'min:2', 'max:100'],
            'query.user_id' => ['sometimes', 'integer', 'min:1'],
            'query.game' => ['sometimes', Rule::in($gameKeys)],
            'query.subject' => ['sometimes', 'string', Rule::in(Subject::keys())],
            'query.from' => ['sometimes', 'date_format:Y-m-d'],
            'query.to' => ['sometimes', 'date_format:Y-m-d'],
        ])->validate()['query'];
        $operation = $validated['operation'];
        $allowed = match ($operation) {
            'catalog', 'teachers', 'changelog' => [],
            'players' => ['search'],
            'ai_analyses' => ['search', 'user_id'],
            'player_progress' => ['search', 'user_id'],
            'player' => ['user_id', 'from', 'to'],
            'results', 'matches' => ['game', 'user_id', 'from', 'to'],
            'points', 'screen_time' => ['user_id', 'from', 'to'],
            'ads', 'score_leaderboard' => ['game', 'from', 'to'],
            'questions', 'leaderboard', 'overview', 'game_ranking', 'classrooms' => ['from', 'to'],
            'question_difficulty' => ['game', 'subject', 'user_id', 'from', 'to'],
            'subjects' => ['subject', 'user_id', 'from', 'to'],
        };
        if (array_diff(array_keys($validated), ['operation', ...$allowed]) !== [] || ($operation === 'player' && ! isset($validated['user_id']))) {
            throw ValidationException::withMessages(['query' => __('ai_assistant.invalid_filter')]);
        }
        $from = CarbonImmutable::parse($validated['from'] ?? now()->subDays(29)->toDateString())->startOfDay();
        $to = CarbonImmutable::parse($validated['to'] ?? now()->toDateString())->endOfDay();
        if ($from->gt($to) || $from->diffInDays($to) > 366) {
            throw ValidationException::withMessages(['from' => __('ai_assistant.invalid_range')]);
        }
        $range = ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'timezone' => config('app.timezone')];
        $userId = isset($validated['user_id']) ? (int) $validated['user_id'] : null;
        $game = $validated['game'] ?? null;
        $ranged = isset($validated['from']) || isset($validated['to']) ? [$from, $to] : null;
        $data = match ($operation) {
            'overview' => $this->overview($from, $to),
            'question_difficulty' => $this->questionDifficulty($ranged, $game, $validated['subject'] ?? null, $userId),
            'subjects' => $this->subjects($ranged, $validated['subject'] ?? null, $userId),
            'game_ranking' => $this->gameRanking($ranged),
            'player_progress' => $this->playerProgress($validated['search'] ?? null, $userId),
            'ai_analyses' => $this->aiAnalyses($validated['search'] ?? null, $userId),
            'classrooms' => $this->classrooms($ranged),
            'teachers' => $this->teachers(),
            'score_leaderboard' => $this->scoreLeaderboard($ranged, $game),
            'changelog' => $this->changelog(),
            'catalog' => ['games' => collect(config('game-catalog.categories', []))->flatMap(fn (array $category): array => $category['games'])->map(fn (array $row): array => array_intersect_key($row, array_flip(['key', 'min_grade', 'max_grade', 'min_players', 'max_players', 'awards_points', 'multiplayer', 'released_at'])))->values()->all()],
            'players' => $this->players($validated['search'] ?? null),
            'player' => $this->player($userId, $from, $to),
            'results' => $this->results($from, $to, $userId, $game),
            'matches' => $this->matches($from, $to, $userId, $game),
            'points' => $this->points($from, $to, $userId),
            'questions' => $this->questions($from, $to),
            'screen_time' => $this->screenTime($from, $to, $userId),
            'ads' => $this->ads($from, $to, $game),
            'leaderboard' => $this->leaderboard(isset($validated['from']) || isset($validated['to']) ? [$from, $to] : null),
        };
        $route = match ($operation) {
            'overview' => 'admin.dashboard',
            'question_difficulty' => 'admin.questions.index',
            'subjects' => 'admin.subject-analysis.index',
            'game_ranking' => 'admin.hot-games.index',
            'player_progress', 'ai_analyses' => 'admin.player-progress.index',
            'classrooms', 'teachers' => 'admin.users.index',
            'score_leaderboard' => 'admin.leaderboard.index',
            'changelog' => 'admin.changelog.index',
            'catalog', 'results' => 'admin.games.index',
            'players' => 'admin.users.index',
            'player' => 'admin.users.show',
            'matches' => 'admin.matches.index',
            'points', 'leaderboard' => 'admin.leaderboard.index',
            'questions' => 'admin.questions.index',
            'screen_time' => 'admin.screen-time.index',
            'ads' => 'admin.ads.index',
        };
        $source = ['label' => __('ai_assistant.sources.'.$operation), 'url' => route($route, $operation === 'player' ? ['user' => $userId] : [], false)];
        $this->retrievedSources[$source['url']] = $source;

        return ['data' => $data, 'range' => $ranged === null && in_array($operation, self::ALL_TIME_DEFAULT, true) ? ['scope' => 'all_time', 'timezone' => config('app.timezone')] : $range, 'queried_at' => now()->toIso8601String(), 'source' => $source];
    }

    /** Operations that cover all time unless from/to is given. */
    private const ALL_TIME_DEFAULT = ['leaderboard', 'question_difficulty', 'subjects', 'game_ranking', 'classrooms', 'score_leaderboard', 'player_progress', 'ai_analyses', 'catalog', 'players', 'teachers', 'changelog'];

    /**
     * One-call snapshot of the whole app: accounts, activity in range, content and AI.
     *
     * @return array<string, mixed>
     */
    private function overview(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $players = User::query()->where('is_superadmin', false);
        $histories = GameHistory::query()->whereBetween('played_at', [$from, $to]);
        $stats = (clone $histories)->selectRaw('COUNT(*) AS plays, COUNT(DISTINCT user_id) AS players, COALESCE(SUM(correct), 0) AS correct, COALESCE(SUM(wrong), 0) AS wrong, COALESCE(SUM(duration_seconds), 0) AS seconds')->toBase()->first();
        $answered = (int) $stats->correct + (int) $stats->wrong;
        $topGame = (clone $histories)->select('game_key')->selectRaw('COUNT(*) AS plays')->groupBy('game_key')->orderByDesc('plays')->first();

        return [
            'accounts' => [
                'total' => (clone $players)->count(),
                'active' => (clone $players)->whereNull('disabled_at')->count(),
                'disabled' => (clone $players)->whereNotNull('disabled_at')->count(),
                'teachers' => (clone $players)->whereHas('roles', fn (Builder $query) => $query->where('slug', Role::TEACHER))->count(),
                'superadmins' => User::query()->where('is_superadmin', true)->count(),
                'registered_in_range' => (clone $players)->whereBetween('created_at', [$from, $to])->count(),
                'seen_last_15_minutes' => (clone $players)->where('last_seen_at', '>=', now()->subMinutes(User::ONLINE_MINUTES))->count(),
                'ever_played' => (clone $players)->whereHas('gameHistories')->count(),
            ],
            'activity_in_range' => [
                'plays' => (int) $stats->plays,
                'active_players' => (int) $stats->players,
                'answered' => $answered,
                'correct' => (int) $stats->correct,
                'wrong' => (int) $stats->wrong,
                'accuracy' => $this->percent((int) $stats->correct, $answered),
                'playing_seconds' => (int) $stats->seconds,
                'most_played_game' => $topGame ? ['game_key' => $topGame->game_key, 'plays' => (int) $topGame->getAttribute('plays')] : null,
                'points_earned' => (int) PointLedger::query()->whereBetween('created_at', [$from, $to])->where('points', '>', 0)->sum('points'),
                'badges_earned' => UserBadge::query()->whereBetween('earned_at', [$from, $to])->count(),
            ],
            'content' => [
                'questions_total' => Question::query()->count(),
                'questions_active' => Question::query()->active()->count(),
                'subjects_active' => count(Subject::activeKeys()),
                'topics' => SubjectTopic::query()->count(),
                'games_in_catalog' => collect(config('game-catalog.categories', []))->sum(fn (array $category): int => count($category['games'])),
            ],
            'classrooms' => [
                'total' => Classroom::query()->count(),
                'active_now' => Classroom::query()->activeAt()->count(),
                'members' => ClassroomMember::query()->count(),
            ],
            'ai_analyses' => [
                'players_analyzed' => (clone $players)->whereHas('abilityAssessments', fn (Builder $query) => $query->where('status', UserAbilityAssessment::DONE))->count(),
                'done' => UserAbilityAssessment::query()->where('status', UserAbilityAssessment::DONE)->count(),
                'failed' => UserAbilityAssessment::query()->where('status', UserAbilityAssessment::FAILED)->count(),
                'running' => UserAbilityAssessment::query()->running()->count(),
            ],
            'operations' => [
                'teacher_requests_pending' => TeacherRequest::query()->where('status', TeacherRequest::PENDING)->count(),
                'feedback_new' => Feedback::query()->where('status', 'new')->count(),
                'ad_campaigns_active' => AdCampaign::query()->where('status', 'active')->count(),
            ],
        ];
    }

    /**
     * Bank questions ranked by wrong answers, with prompt text and the most chosen wrong option.
     *
     * @param  array{0: CarbonImmutable, 1: CarbonImmutable}|null  $range
     * @return array<string, mixed>
     */
    private function questionDifficulty(?array $range, ?string $game, ?string $subject, ?int $userId): array
    {
        $base = fn (): Builder => QuestionAnswer::query()
            ->when($range, fn (Builder $query) => $query->whereBetween('question_answers.created_at', $range))
            ->when($game, fn (Builder $query) => $query->where('question_answers.game_key', $game))
            ->when($subject, fn (Builder $query) => $query->whereHas('question', fn (Builder $question) => $question->where('subject', $subject)))
            ->when($userId, fn (Builder $query) => $query->whereHas('gameHistory', fn (Builder $history) => $history->where('user_id', $userId)));
        $rank = fn (string $order) => $base()
            ->select('question_id')
            ->selectRaw('COUNT(*) AS answered, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct_count, SUM(CASE WHEN correct = 1 THEN 0 ELSE 1 END) AS wrong_count')
            ->groupBy('question_id')
            ->when($order === 'wrong', fn (Builder $query) => $query->orderByDesc('wrong_count')->orderByDesc('answered'))
            ->when($order === 'rate', fn (Builder $query) => $query->havingRaw('COUNT(*) >= ?', [self::MIN_ANSWERS])->orderByRaw('SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) ASC')->orderByDesc('answered'))
            ->when($order === 'easy', fn (Builder $query) => $query->havingRaw('COUNT(*) >= ?', [self::MIN_ANSWERS])->orderByRaw('SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) DESC')->orderByDesc('answered'))
            ->orderBy('question_id')
            ->limit(10)
            ->get();
        $mostWrong = $rank('wrong');
        $lowestRate = $rank('rate');
        $easiest = $rank('easy');
        $ids = $mostWrong->pluck('question_id')->merge($lowestRate->pluck('question_id'))->merge($easiest->pluck('question_id'))->unique()->values();
        $questions = Question::query()->with('topic:id,name_id')->whereKey($ids)->get(['id', 'type', 'subject', 'topic_id', 'level', 'grades', 'prompt_id', 'options', 'answer'])->keyBy('id');
        $choices = $base()->whereIn('question_id', $ids)->where('correct', false)->whereNotNull('choice')
            ->select('question_id', 'choice')->selectRaw('COUNT(*) AS picks')->groupBy('question_id', 'choice')->get()->groupBy('question_id');
        $present = function (QuestionAnswer $row) use ($questions, $choices): array {
            $question = $questions->get($row->question_id);
            $answered = (int) $row->getAttribute('answered');
            $correct = (int) $row->getAttribute('correct_count');
            $topWrong = $choices->get($row->question_id)?->sortByDesc('picks')->first();

            return [
                'question_id' => (int) $row->question_id,
                'url' => route('admin.questions.show', ['question' => $row->question_id], false),
                'prompt' => $question ? mb_substr(strip_tags((string) $question->prompt_id), 0, 220) : null,
                'subject' => $question ? $this->subjectName($question->subject) : null,
                'topic' => $question?->topic?->name_id,
                'level' => $question?->level,
                'grades' => $question?->grades,
                'correct_answer' => $question ? $this->optionText($question, (int) $question->answer) : null,
                'answered' => $answered,
                'correct' => $correct,
                'wrong' => (int) $row->getAttribute('wrong_count'),
                'success_rate' => $this->percent($correct, $answered),
                'most_chosen_wrong_option' => $question && $topWrong ? ['text' => $this->optionText($question, (int) $topWrong->choice), 'picks' => (int) $topWrong->getAttribute('picks')] : null,
            ];
        };
        $totals = $base()->selectRaw('COUNT(*) AS answered, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct, COUNT(DISTINCT question_id) AS questions')->toBase()->first();

        return [
            'totals' => ['answered' => (int) $totals->answered, 'correct' => (int) $totals->correct, 'wrong' => (int) $totals->answered - (int) $totals->correct, 'distinct_questions' => (int) $totals->questions, 'success_rate' => $this->percent((int) $totals->correct, (int) $totals->answered)],
            'most_wrong' => $mostWrong->map($present)->all(),
            'lowest_success_rate' => $lowestRate->map($present)->all(),
            'highest_success_rate' => $easiest->map($present)->all(),
            'min_answers_for_rate' => self::MIN_ANSWERS,
            'limit' => 10,
            'note' => 'Counts are per recorded answer (question_answers). The same player may answer a question several times.',
        ];
    }

    /**
     * Accuracy per subject (and per topic for one subject).
     *
     * @param  array{0: CarbonImmutable, 1: CarbonImmutable}|null  $range
     * @return array<string, mixed>
     */
    private function subjects(?array $range, ?string $subject, ?int $userId): array
    {
        $base = fn (): Builder => QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->when($range, fn (Builder $query) => $query->whereBetween('question_answers.created_at', $range))
            ->when($subject, fn (Builder $query) => $query->where('questions.subject', $subject))
            ->when($userId, fn (Builder $query) => $query->whereHas('gameHistory', fn (Builder $history) => $history->where('user_id', $userId)));
        $aggregate = 'COUNT(*) AS answered, SUM(CASE WHEN question_answers.correct = 1 THEN 1 ELSE 0 END) AS correct';
        $rows = $base()->select('questions.subject')->selectRaw($aggregate)->groupBy('questions.subject')->orderByDesc('answered')->limit(40)->toBase()->get();
        $map = fn (object $row, ?string $label): array => [
            'label' => $label,
            'answered' => (int) $row->answered,
            'correct' => (int) $row->correct,
            'wrong' => (int) $row->answered - (int) $row->correct,
            'success_rate' => $this->percent((int) $row->correct, (int) $row->answered),
        ];
        $topics = $subject === null ? [] : $base()->leftJoin('subject_topics', 'subject_topics.id', '=', 'questions.topic_id')
            ->select('subject_topics.name_id')->selectRaw($aggregate)->groupBy('subject_topics.name_id')->orderByDesc('answered')->limit(40)->toBase()->get()
            ->map(fn (object $row): array => $map($row, $row->name_id ?? 'Tanpa topik'))->all();

        return [
            'subjects' => $rows->map(fn (object $row): array => ['key' => $row->subject] + $map($row, $this->subjectName($row->subject)))->all(),
            'topics' => $topics,
            'bank_questions_per_subject' => Question::query()->select('subject')->selectRaw('COUNT(*) AS count')->groupBy('subject')->orderByDesc('count')->limit(40)->toBase()->get()->map(fn (object $row): array => ['subject' => $this->subjectName($row->subject), 'count' => (int) $row->count])->all(),
        ];
    }

    /**
     * Games ranked by plays with players, accuracy, points and time.
     *
     * @param  array{0: CarbonImmutable, 1: CarbonImmutable}|null  $range
     * @return array<string, mixed>
     */
    private function gameRanking(?array $range): array
    {
        $rows = GameHistory::query()
            ->when($range, fn (Builder $query) => $query->whereBetween('played_at', $range))
            ->select('game_key')
            ->selectRaw('COUNT(*) AS plays, COUNT(DISTINCT user_id) AS players, COALESCE(SUM(points), 0) AS points, MAX(points) AS best_score, COALESCE(SUM(correct), 0) AS correct, COALESCE(SUM(wrong), 0) AS wrong, COALESCE(SUM(duration_seconds), 0) AS seconds, MAX(played_at) AS last_played_at')
            ->groupBy('game_key')
            ->orderByDesc('plays')
            ->toBase()
            ->get();

        return [
            'games' => $rows->map(fn (object $row): array => [
                'game_key' => $row->game_key,
                'plays' => (int) $row->plays,
                'players' => (int) $row->players,
                'total_score' => (int) $row->points,
                'best_score' => (int) $row->best_score,
                'answered' => (int) $row->correct + (int) $row->wrong,
                'accuracy' => $this->percent((int) $row->correct, (int) $row->correct + (int) $row->wrong),
                'playing_seconds' => (int) $row->seconds,
                'last_played_at' => $row->last_played_at ? Carbon::parse($row->last_played_at)->toIso8601String() : null,
            ])->all(),
            'never_played' => collect(config('game-catalog.categories', []))->flatMap(fn (array $category): array => $category['games'])->pluck('key')->diff($rows->pluck('game_key'))->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function playerProgress(?string $search, ?int $userId): array
    {
        $report = app(PlayerProgressReport::class);
        $filters = ['search' => $search, 'user_id' => $userId];

        return [
            'summary' => $report->summary(),
            'most_active' => $report->rows($filters + ['sort' => 'plays'], 10),
            'most_answered' => $report->rows($filters + ['sort' => 'answered'], 10),
            'recently_active' => $report->rows($filters + ['sort' => 'last_played'], 10),
            'limit' => 10,
            'note' => 'summary covers every non-superadmin account; lists are top 10 by each order.',
        ];
    }

    /** @return array<string, mixed> */
    private function aiAnalyses(?string $search, ?int $userId): array
    {
        $report = app(PlayerProgressReport::class);
        $filters = ['search' => $search, 'user_id' => $userId];
        $latest = UserAbilityAssessment::query()->with('user:id,name')->where('status', UserAbilityAssessment::DONE)
            ->when($userId, fn (Builder $query) => $query->where('user_id', $userId))
            ->latest('id')->limit(5)->get(['id', 'user_id', 'trigger', 'result', 'created_at']);

        return [
            'summary' => $report->summary(),
            'analyzed' => $report->rows($filters + ['ai' => 'analyzed', 'sort' => 'last_played'], 15),
            'played_but_not_analyzed' => $report->rows($filters + ['ai' => 'not_analyzed', 'activity' => 'played', 'sort' => 'answered'], 15),
            'latest_results' => $latest->map(fn (UserAbilityAssessment $assessment): array => [
                'user_id' => $assessment->user_id,
                'name' => $assessment->user?->name,
                'trigger' => $assessment->trigger,
                'analyzed_at' => $assessment->created_at?->toIso8601String(),
                'summary' => mb_substr((string) ($assessment->result['summary'] ?? ''), 0, 600),
                'strengths' => array_slice((array) ($assessment->result['strengths'] ?? []), 0, 4),
                'weaknesses' => array_slice((array) ($assessment->result['weaknesses'] ?? []), 0, 4),
                'subject_scores' => (array) ($assessment->result['subject_scores'] ?? []),
            ])->all(),
            'limit' => 15,
        ];
    }

    /**
     * Classrooms with teacher, status, members and plays.
     *
     * @param  array{0: CarbonImmutable, 1: CarbonImmutable}|null  $range
     * @return array<string, mixed>
     */
    private function classrooms(?array $range): array
    {
        $query = Classroom::query()->with('teacher:id,name')->withCount(['members', 'games', 'gameHistories'])
            ->when($range, fn (Builder $query) => $query->where('starts_at', '<=', $range[1])->where('ends_at', '>=', $range[0]));

        return [
            'total' => (clone $query)->count(),
            'active_now' => Classroom::query()->activeAt()->count(),
            'classrooms' => (clone $query)->latest('starts_at')->limit(20)->get()->map(fn (Classroom $classroom): array => [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'teacher' => $classroom->teacher?->name,
                'status' => $classroom->status(),
                'starts_at' => $classroom->starts_at?->toIso8601String(),
                'ends_at' => $classroom->ends_at?->toIso8601String(),
                'members' => (int) $classroom->members_count,
                'games' => (int) $classroom->games_count,
                'plays' => (int) $classroom->game_histories_count,
                'ai_status' => $classroom->ai_status,
            ])->all(),
            'limit' => 20,
        ];
    }

    /** @return array<string, mixed> */
    private function teachers(): array
    {
        $teachers = User::query()->select(['id', 'name', 'created_at'])
            ->whereHas('roles', fn (Builder $query) => $query->where('slug', Role::TEACHER))
            ->withCount(['authoredQuestions as questions', 'teacherSubjects as subjects'])
            ->withCount(['authoredQuestions as active_questions' => fn (Builder $query) => $query->where('is_active', true)])
            ->orderByDesc('questions')->limit(30)->get();
        $classrooms = Classroom::query()->select('teacher_id')->selectRaw('COUNT(*) AS total')->whereIn('teacher_id', $teachers->pluck('id'))->groupBy('teacher_id')->pluck('total', 'teacher_id');

        return [
            'total' => User::query()->whereHas('roles', fn (Builder $query) => $query->where('slug', Role::TEACHER))->count(),
            'pending_requests' => TeacherRequest::query()->where('status', TeacherRequest::PENDING)->count(),
            'teachers' => $teachers->map(fn (User $teacher): array => [
                'id' => $teacher->id,
                'name' => $teacher->name,
                'questions' => (int) $teacher->getAttribute('questions'),
                'active_questions' => (int) $teacher->getAttribute('active_questions'),
                'subjects' => (int) $teacher->getAttribute('subjects'),
                'classrooms' => (int) ($classrooms[$teacher->id] ?? 0),
            ])->all(),
            'limit' => 30,
        ];
    }

    /**
     * Top accounts by game score (sum of game_histories.points), not account points.
     *
     * @param  array{0: CarbonImmutable, 1: CarbonImmutable}|null  $range
     * @return array<string, mixed>
     */
    private function scoreLeaderboard(?array $range, ?string $game): array
    {
        $rows = GameHistory::query()
            ->whereHas('user', fn (Builder $user) => $user->whereNull('disabled_at')->where('is_superadmin', false))
            ->when($range, fn (Builder $query) => $query->whereBetween('played_at', $range))
            ->when($game, fn (Builder $query) => $query->where('game_key', $game))
            ->select('user_id')
            ->selectRaw('SUM(points) AS score, MAX(points) AS best_score, COUNT(*) AS plays, COALESCE(SUM(correct), 0) AS correct_total, COALESCE(SUM(wrong), 0) AS wrong_total')
            ->groupBy('user_id')->orderByDesc('score')->orderBy('user_id')->limit(10)->get();
        $users = User::query()->select(['id', 'name', 'created_at'])->with('playerProfile:id,user_id,nickname,grade,school_name,school_city')->whereKey($rows->pluck('user_id'))->get()->keyBy('id');

        return [
            'players' => $rows->values()->map(fn (GameHistory $row, int $index): array => [
                'rank' => $index + 1,
                'player' => $users->has($row->user_id) ? $this->presentPlayer($users[$row->user_id]) : ['id' => (int) $row->user_id],
                'total_score' => (int) $row->getAttribute('score'),
                'best_score' => (int) $row->getAttribute('best_score'),
                'plays' => (int) $row->getAttribute('plays'),
                'accuracy' => $this->percent((int) $row->getAttribute('correct_total'), (int) $row->getAttribute('correct_total') + (int) $row->getAttribute('wrong_total')),
            ])->all(),
            'limit' => 10,
        ];
    }

    /** @return array<string, mixed> */
    private function changelog(): array
    {
        return ['releases' => ChangelogEntry::query()->published()->latest('published_at')->latest('id')->limit(15)->get(['version', 'title', 'type', 'published_at'])
            ->map(fn (ChangelogEntry $entry): array => ['version' => $entry->version, 'title' => $entry->title, 'type' => $entry->type, 'published_at' => $entry->published_at?->toDateString()])->all(), 'limit' => 15];
    }

    private function subjectName(?string $key): ?string
    {
        if ($key === null) {
            return null;
        }
        foreach (Subject::catalog() as $subject) {
            if ($subject['key'] === $key) {
                return $subject['name_id'];
            }
        }

        return $key;
    }

    private function optionText(Question $question, int $index): ?string
    {
        if ($question->type === Question::TYPE_TRUE_FALSE) {
            return $index === 1 ? 'Benar' : 'Salah';
        }
        $option = $question->options[$index] ?? null;

        return is_array($option) ? mb_substr(strip_tags((string) ($option['id'] ?? '')), 0, 120) : null;
    }

    private function percent(int $part, int $total): ?float
    {
        return $total > 0 ? round($part / $total * 100, 1) : null;
    }

    /**
     * Top accounts by signed point-ledger balance; all-time unless a range is given.
     *
     * @param  array{0: CarbonImmutable, 1: CarbonImmutable}|null  $range
     * @return array<string, mixed>
     */
    private function leaderboard(?array $range): array
    {
        $rows = PointLedger::query()
            ->select('user_id')
            ->selectRaw('SUM(points) AS net_points, SUM(CASE WHEN points > 0 THEN points ELSE 0 END) AS earned')
            ->whereHas('user', fn (Builder $user) => $user->whereNull('disabled_at'))
            ->when($range, fn (Builder $query) => $query->whereBetween('created_at', $range))
            ->groupBy('user_id')
            ->orderByDesc('net_points')
            ->orderBy('user_id')
            ->limit(10)
            ->get();
        $users = User::query()->select(['id', 'name', 'created_at'])
            ->with('playerProfile:id,user_id,nickname,grade,school_name,school_city')
            ->whereKey($rows->pluck('user_id'))
            ->get()
            ->keyBy('id');

        return [
            'scope' => $range ? 'range' : 'all_time',
            'players' => $rows->values()->map(fn (PointLedger $row, int $index): array => [
                'rank' => $index + 1,
                'player' => $users->has($row->user_id) ? $this->presentPlayer($users[$row->user_id]) : ['id' => (int) $row->user_id],
                'net_points' => (int) $row->getAttribute('net_points'),
                'earned' => (int) $row->getAttribute('earned'),
            ])->all(),
            'limit' => 10,
        ];
    }

    /** @return array<string, mixed> */
    private function players(?string $search): array
    {
        $query = User::query()->select(['id', 'name', 'created_at'])
            ->with('playerProfile:id,user_id,nickname,grade,school_name,school_city');
        if ($search !== null) {
            $term = '%'.addcslashes($search, '%_\\').'%';
            $query->where(fn (Builder $query) => $query->where('name', 'like', $term)->orWhereHas('playerProfile', fn (Builder $profile) => $profile->where('nickname', 'like', $term)->orWhere('school_name', 'like', $term)));
        }
        $rows = $query->orderBy('id')->limit(21)->get();

        return ['players' => $rows->take(20)->map(fn (User $user): array => $this->presentPlayer($user))->all(), 'has_more' => $rows->count() > 20, 'limit' => 20];
    }

    /** @return array<string, mixed> */
    private function presentPlayer(User $user): array
    {
        return ['id' => $user->id, 'name' => mb_substr($user->name, 0, 255), 'created_at' => $user->created_at?->toIso8601String(), 'profile' => $user->playerProfile?->only(['nickname', 'grade', 'school_name', 'school_city'])];
    }

    /** @return array<string, mixed> */
    private function player(int $id, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $user = User::query()->select(['id', 'name', 'created_at'])->with('playerProfile:id,user_id,nickname,grade,school_name,school_city')->find($id);
        if ($user === null) {
            return ['player' => null];
        }

        return ['player' => $this->presentPlayer($user), 'results' => $this->results($from, $to, $id), 'points_in_range' => $this->points($from, $to, $id), 'net_points_all_time' => (int) PointLedger::query()->where('user_id', $id)->sum('points'), 'screen_time' => $this->screenTime($from, $to, $id), 'progress_all_time' => app(PlayerProgressReport::class)->rows(['user_id' => $id], 1)[0] ?? null];
    }

    /** @return array<string, mixed> */
    private function results(CarbonImmutable $from, CarbonImmutable $to, ?int $userId = null, ?string $game = null): array
    {
        $query = GameHistory::query()->whereBetween('played_at', [$from, $to])->when($userId, fn (Builder $query) => $query->where('user_id', $userId))->when($game, fn (Builder $query) => $query->where('game_key', $game));
        $stats = (clone $query)->selectRaw('COUNT(*) AS count, COALESCE(SUM(points), 0) AS points, COALESCE(SUM(correct), 0) AS correct, COALESCE(SUM(wrong), 0) AS wrong, COALESCE(SUM(duration_seconds), 0) AS duration_seconds, COUNT(correct) AS results_with_answers')->first();
        $summary = array_map('intval', $stats->getAttributes());
        $summary['recent'] = (clone $query)->latest('played_at')->latest('id')->limit(20)->get(['id', 'user_id', 'game_key', 'points', 'correct', 'wrong', 'duration_seconds', 'played_at'])->map(fn (GameHistory $row): array => $row->only(['id', 'user_id', 'game_key', 'points', 'correct', 'wrong', 'duration_seconds', 'played_at']))->all();
        $summary['recent_limit'] = 20;

        return $summary;
    }

    /** @return array<string, mixed> */
    private function matches(CarbonImmutable $from, CarbonImmutable $to, ?int $userId, ?string $game): array
    {
        $query = GameMatch::query()->whereBetween('ended_at', [$from, $to])->when($game, fn (Builder $query) => $query->where('game_key', $game))->when($userId, fn (Builder $query) => $query->whereHas('players', fn (Builder $players) => $players->where('user_id', $userId)));

        return ['count' => (clone $query)->count(), 'finished' => (clone $query)->where('finished', true)->count(), 'recent' => (clone $query)->latest('ended_at')->latest('id')->limit(20)->get(['id', 'game_key', 'mode', 'grade', 'level', 'players_count', 'finished', 'ended_at'])->map(fn (GameMatch $row): array => $row->only(['id', 'game_key', 'mode', 'grade', 'level', 'players_count', 'finished', 'ended_at']))->all(), 'recent_limit' => 20];
    }

    /** @return array<string, int> */
    private function points(CarbonImmutable $from, CarbonImmutable $to, ?int $userId): array
    {
        $query = PointLedger::query()->whereBetween('created_at', [$from, $to])->when($userId, fn (Builder $query) => $query->where('user_id', $userId));

        return ['entries' => (clone $query)->count(), 'net_points' => (int) (clone $query)->sum('points'), 'earned' => (int) (clone $query)->where('points', '>', 0)->sum('points'), 'spent' => -(int) (clone $query)->where('points', '<', 0)->sum('points')];
    }

    /** @return array<string, mixed> */
    private function questions(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $answers = QuestionAnswer::query()->whereBetween('created_at', [$from, $to]);

        return ['bank_total_current' => Question::query()->count(), 'bank_active_current' => Question::query()->active()->count(), 'created_in_range' => Question::query()->whereBetween('created_at', [$from, $to])->count(), 'answers_in_range' => (clone $answers)->count(), 'correct_in_range' => (clone $answers)->where('correct', true)->count(), 'subjects_current' => Question::query()->select('subject')->selectRaw('COUNT(*) AS count')->groupBy('subject')->orderByDesc('count')->limit(30)->get()->map(fn (Question $row): array => ['subject' => $row->subject, 'count' => (int) $row->getAttribute('count')])->all()];
    }

    /** @return array<string, mixed> */
    private function screenTime(CarbonImmutable $from, CarbonImmutable $to, ?int $userId): array
    {
        $query = ScreenTimeDaily::query()->whereBetween('date', [$from->toDateString(), $to->toDateString()])->when($userId, fn (Builder $query) => $query->where('user_id', $userId));

        return ['timezone' => (string) config('screen-time.timezone', 'UTC'), 'seconds' => (int) (clone $query)->sum('seconds'), 'by_area' => (clone $query)->select('area')->selectRaw('SUM(seconds) AS seconds')->groupBy('area')->orderByDesc('seconds')->limit(30)->get()->map(fn (ScreenTimeDaily $row): array => $row->only(['area', 'seconds']))->all()];
    }

    /** @return array<string, int> */
    private function ads(CarbonImmutable $from, CarbonImmutable $to, ?string $game): array
    {
        $query = AdDailyStat::query()->whereDate('day', '>=', $from->toDateString())->whereDate('day', '<=', $to->toDateString())->when($game, fn (Builder $query) => $query->where('game_key', $game));

        return ['impressions' => (int) (clone $query)->sum('impressions'), 'clicks' => (int) (clone $query)->sum('clicks'), 'plays' => (int) (clone $query)->sum('plays')];
    }
}
