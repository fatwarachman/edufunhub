<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\BulkQuestionRequest;
use App\Http\Requests\Admin\QuestionRequest;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Subject;
use App\Models\User;
use App\Services\ActivityLogPresenter;
use App\Services\PointRules;
use App\Services\QuestionAnalytics;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class QuestionController extends Controller
{
    /** Creator filters for the question list (`teacher` covers teacher-written and imported questions). */
    public const CREATOR_FILTERS = ['ai', 'teacher', 'admin', 'system'];

    /**
     * Subject overview first; choosing a subject (or searching) opens the question list.
     */
    public function index(Request $request): Response
    {
        $filters = $this->normalizeFilters($request->only(['search', 'game', 'band', 'level', 'subject', 'type', 'status', 'sort', 'source', 'bonus', 'author']));
        $subject = $filters['subject'] ?? null;
        $showList = in_array($subject, [...Subject::keys(), 'all'], true) || filled($filters['search'] ?? null) || filled($filters['source'] ?? null) || filled($filters['bonus'] ?? null);
        $bySource = Question::query()->selectRaw('source, COUNT(*) as total, SUM(CASE WHEN is_active THEN 0 ELSE 1 END) as inactive')->groupBy('source')->get()->toBase()->keyBy('source');

        return Inertia::render('admin/questions/index', [
            'mode' => $showList ? 'list' : 'subjects',
            'liveGenerations' => fn (): array => QuestionGeneration::liveProgress(),
            'subjectStats' => $this->subjectStats(),
            'questions' => $showList ? $this->questionList($filters) : null,
            'sourceCounts' => $showList ? $this->sourceCounts($filters) : null,
            'teachers' => $showList && ($filters['source'] ?? null) === 'teacher' ? $this->teacherAuthors() : [],
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
            ->when(($filters['status'] ?? null) === 'unplayed', fn (Builder $q) => $q->where('times_answered', 0));
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
            ->orderBy('band')
            ->orderBy('level')
            ->orderBy('id');

        // AI-created questions are reviewed in one go: show all of them on one page.
        $perPage = ($filters['source'] ?? null) === 'ai' ? max(1, (clone $query)->count()) : 20;

        return $query
            ->paginate($perPage)
            ->withQueryString()
            ->through(fn (Question $question): array => [
                ...$question->only(['id', 'key', 'type', 'band', 'grades', 'level', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'games', 'is_active', 'source', 'points', 'times_answered', 'times_correct']),
                'author' => $question->author?->name,
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
                ...$question->only(['id', 'key', 'type', 'band', 'level', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'source', 'points', 'times_answered', 'times_correct']),
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
                ...$question->only(['id', 'key', 'type', 'band', 'level', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'points', 'times_answered', 'times_correct']),
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
        ];
    }
}
