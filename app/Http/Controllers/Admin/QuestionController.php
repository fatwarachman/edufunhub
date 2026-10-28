<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkQuestionRequest;
use App\Http\Requests\Admin\QuestionRequest;
use App\Http\Requests\Admin\QuestionSearchRequest;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Subject;
use App\Models\User;
use App\Services\ActivityLogPresenter;
use App\Services\PointRules;
use App\Services\QuestionAnalytics;
use App\Services\QuestionVisual;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class QuestionController extends Controller
{
    /** Creator filters for the question list (`teacher` covers teacher-written and imported questions). */
    public const CREATOR_FILTERS = ['ai', 'teacher', 'admin', 'system'];

    /** Relative "created within" filters, in hours. */
    public const CREATED_WITHIN = ['1h' => 1, '24h' => 24, '7d' => 168, '30d' => 720];

    /** Page sizes an admin may pick for the question list. */
    public const PER_PAGE = [20, 50, 100];

    /** Default page size when reviewing one AI batch. */
    public const BATCH_PER_PAGE = 50;

    /** Recent AI batches offered in the batch filter. */
    private const RECENT_BATCHES = 30;

    /**
     * Subject overview first; choosing a subject (or searching) opens the question list.
     */
    public function index(Request $request): Response
    {
        $filters = $this->normalizeFilters($request->only(['search', 'game', 'band', 'level', 'subject', 'type', 'status', 'sort', 'source', 'bonus', 'author', 'generation', 'created', 'created_from', 'created_to', 'per_page']));
        $subject = $filters['subject'] ?? null;
        $showList = in_array($subject, [...Subject::keys(), 'all'], true)
            || collect(['search', 'source', 'bonus', 'generation', 'created', 'created_from', 'created_to'])->contains(fn (string $key): bool => filled($filters[$key] ?? null));
        $bySource = Question::query()->selectRaw('source, COUNT(*) as total, SUM(CASE WHEN is_active THEN 0 ELSE 1 END) as inactive')->groupBy('source')->get()->toBase()->keyBy('source');

        return Inertia::render('admin/questions/index', [
            'mode' => $showList ? 'list' : 'subjects',
            'liveGenerations' => fn (): array => QuestionGeneration::liveProgress(),
            'subjectStats' => $this->subjectStats(),
            'questions' => $showList ? $this->questionList($filters) : null,
            'sourceCounts' => $showList ? $this->sourceCounts($filters) : null,
            'teachers' => $showList && ($filters['source'] ?? null) === 'teacher' ? $this->teacherAuthors() : [],
            'batches' => $showList ? $this->recentBatches() : [],
            'batch' => $showList && isset($filters['generation']) ? $this->batchSummary((int) $filters['generation']) : null,
            'perPageOptions' => self::PER_PAGE,
            'timezone' => $this->timezone(),
            'filters' => (object) $filters,
            'summary' => [
                'total' => (int) $bySource->sum('total'),
                'active' => Question::query()->active()->count(),
                'ai' => (int) ($bySource->get(Question::SOURCE_AI)->total ?? 0),
                'ai_pending' => (int) ($bySource->get(Question::SOURCE_AI)->inactive ?? 0),
                'teacher' => (int) $bySource->only(Question::TEACHER_SOURCES)->sum('total'),
                'bonus' => Question::query()->where('points', '>', 0)->count(),
                'byGame' => collect(Question::GAMES)->mapWithKeys(fn (string $game): array => [
                    $game => Question::query()->active()->whereJsonContains('games', $game)->count(),
                ]),
            ],
            ...$this->options(),
        ]);
    }

    /**
     * Live search suggestions: the best matching questions (any subject) plus the total match count.
     */
    public function search(QuestionSearchRequest $request): JsonResponse
    {
        $term = $request->term();
        $escaped = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $term);
        $like = '%'.$escaped.'%';
        $query = Question::query()->where(fn (Builder $q) => $q
            ->whereRaw("prompt_id LIKE ? ESCAPE '!'", [$like])
            ->orWhereRaw("prompt_en LIKE ? ESCAPE '!'", [$like])
            ->orWhereRaw("`key` LIKE ? ESCAPE '!'", [$like]));

        $results = (clone $query)
            ->orderByRaw("CASE WHEN `key` = ? THEN 0 WHEN prompt_id LIKE ? ESCAPE '!' THEN 1 ELSE 2 END", [$term, $escaped.'%'])
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->limit(8)
            ->get(['id', 'key', 'subject', 'band', 'level', 'type', 'prompt_id', 'is_active', 'source']);

        return response()->json([
            'term' => $term,
            'total' => $query->count(),
            'results' => $results,
        ]);
    }

    /**
     * Keep only known filter values. The legacy `source=bonus` link maps to the separate `bonus` filter.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, string>
     */
    private function normalizeFilters(array $filters): array
    {
        $filters = array_filter($filters, fn (mixed $value): bool => is_string($value) && $value !== '');

        if (($filters['source'] ?? null) === 'bonus') {
            $filters['bonus'] = '1';
            unset($filters['source']);
        }

        if (isset($filters['source']) && ! in_array($filters['source'], self::CREATOR_FILTERS, true)) {
            unset($filters['source']);
        }

        if (isset($filters['bonus']) && $filters['bonus'] !== '1') {
            unset($filters['bonus']);
        }

        if (isset($filters['author']) && (($filters['source'] ?? null) !== 'teacher' || ! ctype_digit($filters['author']))) {
            unset($filters['author']);
        }

        if (isset($filters['generation']) && ! ctype_digit($filters['generation'])) {
            unset($filters['generation']);
        }

        if (isset($filters['created']) && ! array_key_exists($filters['created'], self::CREATED_WITHIN)) {
            unset($filters['created']);
        }

        foreach (['created_from', 'created_to'] as $key) {
            if (isset($filters[$key]) && $this->localDay($filters[$key]) === null) {
                unset($filters[$key]);
            }
        }

        if (isset($filters['per_page']) && ! in_array((int) $filters['per_page'], self::PER_PAGE, true)) {
            unset($filters['per_page']);
        }

        if (isset($filters['sort']) && ! in_array($filters['sort'], ['hardest', 'most_answered', 'newest', 'oldest'], true)) {
            unset($filters['sort']);
        }

        return $filters;
    }

    /**
     * Restrict a query to one creator type.
     */
    private function applyCreator(Builder $query, ?string $creator): void
    {
        match ($creator) {
            'ai' => $query->where('source', Question::SOURCE_AI),
            'teacher' => $query->whereIn('source', Question::TEACHER_SOURCES),
            'admin' => $query->where('source', 'admin'),
            'system' => $query->where('source', 'system'),
            default => null,
        };
    }

    /**
     * Question counts per creator type for the current filters (ignoring the creator filter itself), in one grouped query.
     *
     * @param  array<string, string>  $filters
     * @return array{all: int, ai: int, teacher: int, admin: int, system: int}
     */
    private function sourceCounts(array $filters): array
    {
        $rows = $this->filteredQuery([...$filters, 'source' => null, 'author' => null])
            ->selectRaw('source, COUNT(*) as total')
            ->groupBy('source')
            ->pluck('total', 'source');

        return [
            'all' => (int) $rows->sum(),
            'ai' => (int) ($rows[Question::SOURCE_AI] ?? 0),
            'teacher' => (int) $rows->only(Question::TEACHER_SOURCES)->sum(),
            'admin' => (int) ($rows['admin'] ?? 0),
            'system' => (int) ($rows['system'] ?? 0),
        ];
    }

    /**
     * Teachers who wrote or imported at least one question (id and name only).
     *
     * @return list<array{id: int, name: string}>
     */
    private function teacherAuthors(): array
    {
        return User::query()
            ->whereIn('id', Question::query()->whereIn('source', Question::TEACHER_SOURCES)->whereNotNull('created_by')->select('created_by'))
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (User $user): array => ['id' => $user->id, 'name' => $user->name])
            ->all();
    }

    /**
     * Per-subject totals with a breakdown by grade band.
     *
     * @return list<array{subject: string, total: int, active: int, answered: int, success_rate: ?float, bands: array<int, int>}>
     */
    private function subjectStats(): array
    {
        $rows = Question::query()
            ->selectRaw('subject, band, COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active, SUM(times_answered) as answered, SUM(times_correct) as correct')
            ->groupBy('subject', 'band')
            ->get()
            ->groupBy('subject');

        return collect(Subject::keys())->map(function (string $subject) use ($rows): array {
            $group = $rows->get($subject, collect());
            $answered = (int) $group->sum('answered');

            return [
                'subject' => $subject,
                'total' => (int) $group->sum('total'),
                'active' => (int) $group->sum('active'),
                'answered' => $answered,
                'success_rate' => $answered > 0 ? round($group->sum('correct') / $answered * 100, 1) : null,
                'bands' => collect(Question::BANDS)->keys()->mapWithKeys(fn (int $band): array => [
                    $band => (int) ($group->firstWhere('band', $band)->total ?? 0),
                ])->all(),
            ];
        })->all();
    }

    /**
     * The list query with every filter applied except sorting.
     *
     * @param  array<string, string|null>  $filters
     */
    private function filteredQuery(array $filters): Builder
    {
        return Question::query()
            ->when($filters['search'] ?? null, fn (Builder $q, string $search) => $q->where(fn (Builder $q) => $q
                ->where('prompt_id', 'like', '%'.addcslashes($search, '%_\\').'%')
                ->orWhere('prompt_en', 'like', '%'.addcslashes($search, '%_\\').'%')
                ->orWhere('key', $search)))
            ->when(in_array($filters['game'] ?? null, Question::GAMES, true), fn (Builder $q) => $q->whereJsonContains('games', $filters['game']))
            ->when(isset($filters['band']) && $filters['band'] !== '' && array_key_exists((int) $filters['band'], Question::BANDS), fn (Builder $q) => $q->where('band', (int) $filters['band']))
            ->when(isset($filters['level']) && array_key_exists((int) $filters['level'], Question::LEVELS), fn (Builder $q) => $q->where('level', (int) $filters['level']))
            ->when(in_array($filters['subject'] ?? null, Subject::keys(), true), fn (Builder $q) => $q->where('subject', $filters['subject']))
            ->when(in_array($filters['type'] ?? null, Question::TYPES, true), fn (Builder $q) => $q->where('type', $filters['type']))
            ->tap(fn (Builder $q) => $this->applyCreator($q, $filters['source'] ?? null))
            ->when($filters['author'] ?? null, fn (Builder $q, string $author) => $q->where('created_by', (int) $author))
            ->when(($filters['bonus'] ?? null) === '1', fn (Builder $q) => $q->where('points', '>', 0))
            ->when(($filters['status'] ?? null) === 'active', fn (Builder $q) => $q->where('is_active', true))
            ->when(($filters['status'] ?? null) === 'inactive', fn (Builder $q) => $q->where('is_active', false))
            ->when(($filters['status'] ?? null) === 'played', fn (Builder $q) => $q->where('times_answered', '>', 0))
            ->when(($filters['status'] ?? null) === 'unplayed', fn (Builder $q) => $q->where('times_answered', 0))
            ->when($filters['generation'] ?? null, fn (Builder $q, string $generation) => $q->where('generation_id', (int) $generation))
            ->when(self::CREATED_WITHIN[$filters['created'] ?? ''] ?? null, fn (Builder $q, int $hours) => $q->where('created_at', '>=', now()->subHours($hours)))
            ->when($this->localDay($filters['created_from'] ?? null), fn (Builder $q, CarbonImmutable $day) => $q->where('created_at', '>=', $day->startOfDay()->utc()))
            ->when($this->localDay($filters['created_to'] ?? null), fn (Builder $q, CarbonImmutable $day) => $q->where('created_at', '<', $day->addDay()->startOfDay()->utc()));
    }

    /** Admin-facing timezone for created-at dates (same as the screen-time reports). */
    private function timezone(): string
    {
        return (string) config('screen-time.timezone', 'UTC');
    }

    /** A `Y-m-d` date in the admin timezone, or null when it is not a valid date. */
    private function localDay(?string $value): ?CarbonImmutable
    {
        if ($value === null || preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
            return null;
        }

        $day = CarbonImmutable::createFromFormat('!Y-m-d', $value, $this->timezone());

        return $day !== false && $day->format('Y-m-d') === $value ? $day : null;
    }

    /**
     * Latest AI batches that produced questions, for the batch filter.
     *
     * @return list<array{id: int, created_at: ?string, created_count: int, subjects: list<string>, requested_by: ?string}>
     */
    private function recentBatches(): array
    {
        return QuestionGeneration::query()
            ->with('requester:id,name')
            ->where('created_count', '>', 0)
            ->latest('id')
            ->limit(self::RECENT_BATCHES)
            ->get()
            ->map(fn (QuestionGeneration $generation): array => $this->batchPayload($generation))
            ->all();
    }

    /**
     * One AI batch shown above its questions; null when it does not exist.
     *
     * @return array{id: int, created_at: ?string, created_count: int, subjects: list<string>, requested_by: ?string, status: string, model: string, grades: list<int>, level: int, english_only: bool, blueprint: ?string, inactive: int}|null
     */
    private function batchSummary(int $id): ?array
    {
        $generation = QuestionGeneration::query()->with(['requester:id,name', 'blueprint:id,title', 'blueprints:id,title'])->find($id);
        if ($generation === null) {
            return null;
        }

        return [
            ...$this->batchPayload($generation),
            'status' => $generation->status,
            'model' => $generation->model,
            'grades' => array_values(array_map('intval', $generation->grades ?? [])),
            'level' => Question::normalizeLevel($generation->level),
            'english_only' => (bool) $generation->english_only,
            'blueprint' => $generation->blueprintList()->pluck('title')->implode(', ') ?: null,
            'inactive' => $generation->questions()->where('is_active', false)->count(),
        ];
    }

    /** @return array{id: int, created_at: ?string, created_count: int, subjects: list<string>, requested_by: ?string} */
    private function batchPayload(QuestionGeneration $generation): array
    {
        return [
            'id' => $generation->id,
            'created_at' => $generation->created_at?->toIso8601String(),
            'created_count' => $generation->created_count,
            'subjects' => array_values($generation->subjects ?? []),
            'requested_by' => $generation->requester?->name,
        ];
    }

    /**
     * @param  array<string, string>  $filters
     */
    private function questionList(array $filters): LengthAwarePaginator
    {
        $query = $this->filteredQuery($filters)
            ->with('author:id,name')
            ->when(($filters['sort'] ?? null) === 'hardest', fn (Builder $q) => $q->where('times_answered', '>', 0)->orderByRaw('times_correct * 1.0 / times_answered asc'))
            ->when(($filters['sort'] ?? null) === 'most_answered', fn (Builder $q) => $q->orderByDesc('times_answered'))
            ->when(($filters['sort'] ?? null) === 'newest', fn (Builder $q) => $q->orderByDesc('created_at')->orderByDesc('id'))
            ->when(($filters['sort'] ?? null) === 'oldest', fn (Builder $q) => $q->orderBy('created_at')->orderBy('id'))
            ->orderBy('band')
            ->orderBy('level')
            ->orderBy('id');

        $perPage = isset($filters['per_page'])
            ? (int) $filters['per_page']
            : (isset($filters['generation']) ? self::BATCH_PER_PAGE : self::PER_PAGE[0]);

        return $query
            ->paginate($perPage)
            ->onEachSide(1)
            ->withQueryString()
            ->through(fn (Question $question): array => [
                ...$question->only(['id', 'key', 'type', 'band', 'grades', 'level', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'games', 'is_active', 'source', 'points', 'times_answered', 'times_correct', 'generation_id']),
                'created_at' => $question->created_at?->toIso8601String(),
                'author' => $question->author?->name,
                'visual_kind' => $question->visual['kind'] ?? null,
                'success_rate' => $question->successRate(),
            ]);
    }

    public function create(Request $request): Response
    {
        $subject = in_array($request->query('subject'), Subject::activeKeys(), true) ? $request->query('subject') : null;

        return Inertia::render('admin/questions/form', ['question' => null, 'defaultSubject' => $subject, ...$this->options()]);
    }

    public function store(QuestionRequest $request): RedirectResponse
    {
        $question = Question::query()->create([
            ...$request->validated(),
            'key' => 'q-'.Str::lower(Str::random(10)),
            'source' => 'admin',
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        activity()->causedBy($request->user())->performedOn($question)->log('Created question');

        return redirect()->route('admin.questions.index', ['subject' => $question->subject])->with('success', __('Question created.'));
    }

    /**
     * Detailed statistics for one question: games, outcomes, players and author.
     */
    public function show(Question $question, QuestionAnalytics $analytics): Response
    {
        $question->load(['author:id,name,email', 'editor:id,name']);

        return Inertia::render('admin/questions/show', [
            'question' => [
                ...$question->only(['id', 'key', 'type', 'band', 'level', 'subject', 'prompt_id', 'prompt_en', 'options', 'visual', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'source', 'points', 'times_answered', 'times_correct']),
                'created_at' => $question->created_at?->toIso8601String(),
                'updated_at' => $question->updated_at?->toIso8601String(),
                'author' => $question->author ? [
                    'id' => $question->author->id,
                    'name' => $question->author->name,
                    'email' => $question->author->email,
                    'roles' => $question->author->roles()->pluck('name')->all(),
                ] : null,
                'editor' => $question->editor?->only(['id', 'name']),
            ],
            'stats' => $analytics->detail($question),
            'bands' => collect(Question::BANDS)->map(fn (array $range, int $band): array => ['value' => $band, 'min' => $range[0], 'max' => $range[1]])->values(),
        ]);
    }

    public function edit(Question $question): Response
    {
        return Inertia::render('admin/questions/form', [
            'question' => [
                ...$question->only(['id', 'key', 'type', 'band', 'level', 'subject', 'prompt_id', 'prompt_en', 'options', 'visual', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'points', 'times_answered', 'times_correct']),
                'success_rate' => $question->successRate(),
            ],
            ...$this->options(),
        ]);
    }

    public function update(QuestionRequest $request, Question $question): RedirectResponse
    {
        $data = $request->validated();
        if ($question->grades !== null && (int) $data['band'] !== $question->band) {
            $data['grades'] = null;
        }

        $question->update([...$data, 'updated_by' => $request->user()->id]);

        activity()->causedBy($request->user())->performedOn($question)->withProperties(ActivityLogPresenter::changes($question))->log('Updated question');

        return redirect()->route('admin.questions.index', ['subject' => $question->subject])->with('success', __('Question updated.'));
    }

    public function toggle(Request $request, Question $question): RedirectResponse
    {
        $question->update(['is_active' => ! $question->is_active]);

        activity()->causedBy($request->user())->performedOn($question)->withProperties(ActivityLogPresenter::changes($question))->log($question->is_active ? 'Activated question' : 'Deactivated question');

        return back()->with('success', $question->is_active ? __('Question activated.') : __('Question deactivated.'));
    }

    /**
     * Activate, deactivate or delete many questions at once.
     */
    public function bulk(BulkQuestionRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $questions = Question::query()->whereKey($data['ids']);
        $count = (clone $questions)->count();

        match ($data['action']) {
            'activate' => $questions->update(['is_active' => true, 'updated_by' => $request->user()->id]),
            'deactivate' => $questions->update(['is_active' => false, 'updated_by' => $request->user()->id]),
            'delete' => $questions->get()->each->delete(),
        };

        activity()->causedBy($request->user())
            ->withProperties(['action' => $data['action'], 'ids' => $data['ids']])
            ->log('Bulk '.$data['action'].' questions');

        return back()->with('success', __('questions.bulk.'.$data['action'], ['count' => $count]));
    }

    public function destroy(Request $request, Question $question): RedirectResponse
    {
        activity()->causedBy($request->user())->performedOn($question)->withProperties(ActivityLogPresenter::snapshotOf($question))->log('Deleted question');
        $question->delete();

        return redirect()->route('admin.questions.index', ['subject' => $question->subject])->with('success', __('Question deleted.'));
    }

    /** @return array<string, mixed> */
    private function options(): array
    {
        return [
            'games' => Question::GAMES,
            'choiceOnlyGames' => Question::CHOICE_ONLY_GAMES,
            'subjects' => Subject::activeKeys(),
            'types' => Question::TYPES,
            'perCorrect' => PointRules::current()['per_correct'],
            'maxPoints' => Question::MAX_POINTS,
            'levels' => collect(Question::LEVELS)->map(fn (int $multiplier, int $level): array => ['value' => $level, 'multiplier' => $multiplier])->values(),
            'bands' => collect(Question::BANDS)->map(fn (array $range, int $band): array => ['value' => $band, 'min' => $range[0], 'max' => $range[1]])->values(),
            'visualKinds' => QuestionVisual::KINDS,
            'topologies' => QuestionVisual::TOPOLOGIES,
        ];
    }
}
