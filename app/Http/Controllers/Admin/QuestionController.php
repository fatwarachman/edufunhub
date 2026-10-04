<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\QuestionRequest;
use App\Models\Question;
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
    /**
     * Subject overview first; choosing a subject (or searching) opens the question list.
     */
    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'game', 'band', 'subject', 'type', 'status', 'sort', 'source']);
        $subject = $filters['subject'] ?? null;
        $showList = in_array($subject, [...Question::SUBJECTS, 'all'], true) || filled($filters['search'] ?? null) || filled($filters['source'] ?? null);

        return Inertia::render('admin/questions/index', [
            'mode' => $showList ? 'list' : 'subjects',
            'subjectStats' => $this->subjectStats(),
            'questions' => $showList ? $this->questionList($filters) : null,
            'filters' => (object) $filters,
            'summary' => [
                'total' => Question::query()->count(),
                'active' => Question::query()->active()->count(),
                'ai' => Question::query()->where('source', Question::SOURCE_AI)->count(),
                'ai_pending' => Question::query()->where('source', Question::SOURCE_AI)->where('is_active', false)->count(),
                'bonus' => Question::query()->where('points', '>', 0)->count(),
                'byGame' => collect(Question::GAMES)->mapWithKeys(fn (string $game): array => [
                    $game => Question::query()->active()->whereJsonContains('games', $game)->count(),
                ]),
            ],
            ...$this->options(),
        ]);
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

        return collect(Question::SUBJECTS)->map(function (string $subject) use ($rows): array {
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
     * @param  array<string, mixed>  $filters
     */
    private function questionList(array $filters): LengthAwarePaginator
    {
        return Question::query()
            ->with('author:id,name')
            ->when($filters['search'] ?? null, fn (Builder $q, string $search) => $q->where(fn (Builder $q) => $q
                ->where('prompt_id', 'like', '%'.addcslashes($search, '%_\\').'%')
                ->orWhere('prompt_en', 'like', '%'.addcslashes($search, '%_\\').'%')
                ->orWhere('key', $search)))
            ->when(in_array($filters['game'] ?? null, Question::GAMES, true), fn (Builder $q) => $q->whereJsonContains('games', $filters['game']))
            ->when(isset($filters['band']) && $filters['band'] !== '' && array_key_exists((int) $filters['band'], Question::BANDS), fn (Builder $q) => $q->where('band', (int) $filters['band']))
            ->when(in_array($filters['subject'] ?? null, Question::SUBJECTS, true), fn (Builder $q) => $q->where('subject', $filters['subject']))
            ->when(in_array($filters['type'] ?? null, Question::TYPES, true), fn (Builder $q) => $q->where('type', $filters['type']))
            ->when(($filters['source'] ?? null) === 'ai', fn (Builder $q) => $q->where('source', Question::SOURCE_AI))
            ->when(($filters['source'] ?? null) === 'bonus', fn (Builder $q) => $q->where('points', '>', 0))
            ->when(($filters['status'] ?? null) === 'active', fn (Builder $q) => $q->where('is_active', true))
            ->when(($filters['status'] ?? null) === 'inactive', fn (Builder $q) => $q->where('is_active', false))
            ->when(($filters['sort'] ?? null) === 'hardest', fn (Builder $q) => $q->where('times_answered', '>', 0)->orderByRaw('times_correct * 1.0 / times_answered asc'))
            ->when(($filters['sort'] ?? null) === 'most_answered', fn (Builder $q) => $q->orderByDesc('times_answered'))
            ->orderBy('band')
            ->orderBy('id')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Question $question): array => [
                ...$question->only(['id', 'key', 'type', 'band', 'grades', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'games', 'is_active', 'source', 'points', 'times_answered', 'times_correct']),
                'author' => $question->author?->name,
                'success_rate' => $question->successRate(),
            ]);
    }

    public function create(Request $request): Response
    {
        $subject = in_array($request->query('subject'), Question::SUBJECTS, true) ? $request->query('subject') : null;

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
                ...$question->only(['id', 'key', 'type', 'band', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'source', 'points', 'times_answered', 'times_correct']),
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
                ...$question->only(['id', 'key', 'type', 'band', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'points', 'times_answered', 'times_correct']),
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

        activity()->causedBy($request->user())->performedOn($question)->log('Updated question');

        return redirect()->route('admin.questions.index', ['subject' => $question->subject])->with('success', __('Question updated.'));
    }

    public function toggle(Request $request, Question $question): RedirectResponse
    {
        $question->update(['is_active' => ! $question->is_active]);

        activity()->causedBy($request->user())->performedOn($question)->log($question->is_active ? 'Activated question' : 'Deactivated question');

        return back()->with('success', $question->is_active ? __('Question activated.') : __('Question deactivated.'));
    }

    public function destroy(Request $request, Question $question): RedirectResponse
    {
        activity()->causedBy($request->user())->performedOn($question)->log('Deleted question');
        $question->delete();

        return redirect()->route('admin.questions.index', ['subject' => $question->subject])->with('success', __('Question deleted.'));
    }

    /** @return array<string, mixed> */
    private function options(): array
    {
        return [
            'games' => Question::GAMES,
            'choiceOnlyGames' => Question::CHOICE_ONLY_GAMES,
            'subjects' => Question::SUBJECTS,
            'types' => Question::TYPES,
            'perCorrect' => PointRules::current()['per_correct'],
            'maxPoints' => Question::MAX_POINTS,
            'bands' => collect(Question::BANDS)->map(fn (array $range, int $band): array => ['value' => $band, 'min' => $range[0], 'max' => $range[1]])->values(),
        ];
    }
}
