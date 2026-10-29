<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Teacher\ImportTeacherQuestionsRequest;
use App\Http\Requests\Teacher\TeacherQuestionGamesRequest;
use App\Http\Requests\Teacher\TeacherQuestionRequest;
use App\Models\Question;
use App\Models\QuestionCompensationRate;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\User;
use App\Services\ActivityLogPresenter;
use App\Services\QuestionAnalytics;
use App\Services\TeacherQuestionImporter;
use App\Services\TeacherQuestionStats;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Teacher portal: statistics, question authoring and CSV import.
 */
class TeacherQuestionController extends Controller
{
    /** Latest questions previewed on the teacher home page. */
    public const RECENT_LIMIT = 5;

    /** Page sizes of the teacher question list; the first is the default. */
    public const LIST_PER_PAGE = [30, 50, 100, 200];

    public function __construct(public TeacherQuestionStats $stats) {}

    public function index(Request $request): Response
    {
        $teacher = $request->user();

        return Inertia::render('teacher/index', [
            'overview' => $this->stats->overview($teacher),
            'rates' => QuestionCompensationRate::amounts(),
            'recent' => Question::query()
                ->authoredByTeacher($teacher)
                ->latest('id')
                ->limit(self::RECENT_LIMIT)
                ->get(['id', 'type', 'subject', 'prompt_id', 'prompt_en', 'is_active', 'created_at'])
                ->map(fn (Question $question): array => [
                    ...$question->only(['id', 'type', 'subject', 'prompt_id', 'prompt_en', 'is_active']),
                    'created_at' => $question->created_at?->toIso8601String(),
                ])
                ->all(),
        ]);
    }

    /**
     * Every question the teacher wrote, with filters, usage stats and the
     * games each question is shown in (picked here, not in the form). The
     * search runs over all of the teacher's questions, not only one page.
     */
    public function list(Request $request): Response
    {
        $teacher = $request->user();
        $filters = $this->listFilters($request, $teacher);
        $perPage = $filters['per_page'] ?? self::LIST_PER_PAGE[0];

        $questions = $this->listQuery($teacher, $filters)
            ->with('topic:id,name_id,name_en')
            ->paginate($perPage)
            ->onEachSide(1)
            ->withQueryString();

        $perQuestion = $this->stats->perQuestion($teacher, $questions->getCollection()->pluck('id')->all());

        return Inertia::render('teacher/questions', [
            'filters' => (object) array_filter($filters, fn ($value): bool => $value !== null),
            'perPageOptions' => self::LIST_PER_PAGE,
            'totalQuestions' => Question::query()->authoredByTeacher($teacher)->count(),
            'questions' => $questions->through(fn (Question $question): array => [
                ...$question->only(['id', 'type', 'subject', 'prompt_id', 'prompt_en', 'options', 'visual', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'source', 'topic_id']),
                'level' => Question::normalizeLevel($question->level),
                'topic' => $question->topic?->only(['id', 'name_id', 'name_en']),
                'grades' => $question->grades ?? [],
                'has_picture' => $this->hasPicture($question),
                'created_at' => $question->created_at?->toIso8601String(),
                'updated_at' => $question->updated_at?->toIso8601String(),
                'stats' => $perQuestion->get($question->id) ?? ['answered' => 0, 'correct' => 0, 'wrong' => 0, 'success_rate' => null, 'players' => 0, 'compensation' => 0, 'games' => [], 'grades' => []],
            ]),
            ...$this->options(),
        ]);
    }

    /**
     * Whitelisted list filters; unknown or invalid values are dropped.
     *
     * @return array{search: ?string, grade: ?int, subject: ?string, topic: ?int, level: ?int, type: ?string, status: ?string, game: ?string, picture: ?string, sort: ?string, per_page: ?int}
     */
    private function listFilters(Request $request, User $teacher): array
    {
        $query = fn (string $key): string => trim((string) $request->query($key));
        $pick = fn (string $key, array $allowed): ?string => in_array($query($key), $allowed, true) ? $query($key) : null;

        return [
            'search' => mb_substr($query('search'), 0, 100) ?: null,
            'grade' => is_numeric($query('grade')) && in_array((int) $query('grade'), Question::GRADES, true) ? (int) $query('grade') : null,
            'subject' => $pick('subject', $this->assignedSubjects($teacher)),
            'topic' => ctype_digit($query('topic')) && (int) $query('topic') > 0 ? (int) $query('topic') : null,
            'level' => ctype_digit($query('level')) && array_key_exists((int) $query('level'), Question::LEVELS) ? (int) $query('level') : null,
            'type' => $pick('type', Question::TYPES),
            'status' => $pick('status', ['active', 'inactive']),
            'game' => $pick('game', Question::GAMES),
            'picture' => $pick('picture', ['with', 'without']),
            'sort' => $pick('sort', ['newest', 'oldest', 'prompt']),
            'per_page' => in_array((int) $query('per_page'), self::LIST_PER_PAGE, true) ? (int) $query('per_page') : null,
        ];
    }

    /**
     * The teacher's questions narrowed by the list filters. The search matches
     * the question, answer options, explanation or "#id".
     *
     * @param  array<string, mixed>  $filters
     * @return Builder<Question>
     */
    private function listQuery(User $teacher, array $filters): Builder
    {
        $like = fn (string $term): string => '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $term).'%';

        return Question::query()
            ->authoredByTeacher($teacher)
            ->when($filters['search'], function (Builder $q, string $search) use ($like): void {
                if (preg_match('/^#?(\d+)$/', $search, $match) === 1) {
                    $q->where(fn (Builder $q) => $q->whereKey((int) $match[1])
                        ->orWhereRaw("prompt_id LIKE ? ESCAPE '!'", [$like($search)]));

                    return;
                }
                $q->where(fn (Builder $q) => $q
                    ->whereRaw("prompt_id LIKE ? ESCAPE '!'", [$like($search)])
                    ->orWhereRaw("prompt_en LIKE ? ESCAPE '!'", [$like($search)])
                    ->orWhereRaw("hint_id LIKE ? ESCAPE '!'", [$like($search)])
                    ->orWhereRaw("hint_en LIKE ? ESCAPE '!'", [$like($search)])
                    ->orWhereRaw("LOWER(CAST(options AS CHAR)) LIKE ? ESCAPE '!'", [$like(mb_strtolower($search))])
                    ->orWhereRaw("LOWER(CAST(options AS CHAR)) LIKE ? ESCAPE '!'", [$like(mb_strtolower(trim((string) json_encode($search), '"')))]));
            })
            ->when($filters['grade'] !== null, fn (Builder $q) => $q->whereJsonContains('grades', $filters['grade']))
            ->when($filters['subject'], fn (Builder $q, string $subject) => $q->where('subject', $subject))
            ->when($filters['topic'], fn (Builder $q, int $topic) => $q->where('topic_id', $topic))
            ->when($filters['level'], fn (Builder $q, int $level) => $q->where('level', $level))
            ->when($filters['type'], fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['status'], fn (Builder $q, string $status) => $q->where('is_active', $status === 'active'))
            ->when($filters['game'], fn (Builder $q, string $game) => $q->whereJsonContains('games', $game))
            ->when($filters['picture'], fn (Builder $q, string $picture) => $picture === 'with'
                ? $q->where(fn (Builder $q) => $q->whereNotNull('visual')->orWhere('options', 'like', '%"media"%'))
                : $q->whereNull('visual')->where(fn (Builder $q) => $q->whereNull('options')->orWhere('options', 'not like', '%"media"%')))
            ->when(
                $filters['sort'] === 'oldest',
                fn (Builder $q) => $q->oldest('id'),
                fn (Builder $q) => $filters['sort'] === 'prompt' ? $q->orderBy('prompt_id')->orderBy('id') : $q->latest('id'),
            );
    }

    private function hasPicture(Question $question): bool
    {
        return $question->visual !== null || collect($question->options ?? [])->contains(fn (mixed $option): bool => is_array($option) && isset($option['media']['src']));
    }

    /**
     * Picks the games a question is shown in, from the question list.
     */
    public function updateGames(TeacherQuestionGamesRequest $request, Question $question): RedirectResponse
    {
        $question->update(['games' => $request->validated('games'), 'updated_by' => $request->user()->id]);

        activity()->causedBy($request->user())->performedOn($question)->withProperties(ActivityLogPresenter::changes($question))->log('Teacher updated question games');

        return back()->with('success', __('questions.games_updated'));
    }

    public function create(): Response
    {
        return Inertia::render('teacher/form', ['question' => null, ...$this->options()]);
    }

    public function store(TeacherQuestionRequest $request): RedirectResponse
    {
        $question = Question::query()->create([
            ...$request->questionAttributes(),
            'key' => 'q-'.Str::lower(Str::random(10)),
            'source' => 'teacher',
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        activity()->causedBy($request->user())->performedOn($question)->log('Teacher created question');

        return redirect()->route('teacher.questions.create')->with('success', __('questions.created'));
    }

    /**
     * Item analysis of one of the teacher's questions, identical to the admin
     * analysis of AI questions but without personal data of players.
     */
    public function show(Question $question, QuestionAnalytics $analytics): Response
    {
        Gate::authorize('update', $question);

        $question->loadMissing('topic:id,name_id,name_en');

        return Inertia::render('teacher/show', [
            'question' => [
                ...$question->only(['id', 'type', 'band', 'subject', 'prompt_id', 'prompt_en', 'options', 'visual', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'source', 'topic_id']),
                'level' => Question::normalizeLevel($question->level),
                'topic' => $question->topic?->only(['id', 'name_id', 'name_en']),
                'grades' => $question->grades ?? [],
                'created_at' => $question->created_at?->toIso8601String(),
            ],
            'stats' => $analytics->detail($question, forTeacher: true),
            'bands' => collect(Question::BANDS)->map(fn (array $range, int $band): array => ['value' => $band, 'min' => $range[0], 'max' => $range[1]])->values(),
        ]);
    }

    public function edit(Question $question): Response
    {
        Gate::authorize('update', $question);

        $question->loadMissing('topic:id,name_id,name_en');

        return Inertia::render('teacher/form', [
            'question' => [
                ...$question->only(['id', 'type', 'subject', 'prompt_id', 'prompt_en', 'options', 'visual', 'answer', 'hint_id', 'hint_en', 'games', 'is_active', 'topic_id']),
                'level' => Question::normalizeLevel($question->level),
                'topic' => $question->topic?->only(['id', 'name_id', 'name_en']),
                'grades' => $question->grades ?? [],
            ],
            ...$this->options(),
        ]);
    }

    public function update(TeacherQuestionRequest $request, Question $question): RedirectResponse
    {
        $question->update([...$request->questionAttributes(), 'updated_by' => $request->user()->id]);

        activity()->causedBy($request->user())->performedOn($question)->withProperties(ActivityLogPresenter::changes($question))->log('Teacher updated question');

        return redirect()->route('teacher.questions.list')->with('success', __('questions.updated'));
    }

    public function destroy(Request $request, Question $question): RedirectResponse
    {
        Gate::authorize('delete', $question);

        activity()->causedBy($request->user())->performedOn($question)->withProperties(ActivityLogPresenter::snapshotOf($question))->log('Teacher deleted question');
        $question->delete();

        return back()->with('success', __('questions.deleted'));
    }

    public function importForm(): Response
    {
        return Inertia::render('teacher/import', [
            'columns' => TeacherQuestionImporter::COLUMNS,
            'maxRows' => TeacherQuestionImporter::MAX_ROWS,
            'subjects' => $this->assignedSubjects(request()->user()),
        ]);
    }

    public function import(ImportTeacherQuestionsRequest $request, TeacherQuestionImporter $importer): RedirectResponse
    {
        $result = $importer->import($request->file('file')->getRealPath(), $request->user());

        if ($result['errors'] !== []) {
            return back()->with('importErrors', $result['errors'])->withErrors(['file' => __('questions.import.failed')]);
        }

        activity()->causedBy($request->user())->withProperties(['count' => $result['imported']])->log('Teacher imported questions');

        return redirect()->route('teacher.questions.list')->with('success', trans_choice('questions.import.success', $result['imported'], ['count' => $result['imported']]));
    }

    public function template(Request $request, TeacherQuestionImporter $importer): StreamedResponse
    {
        $csv = $importer->template($this->assignedSubjects($request->user()));

        return response()->streamDownload(fn () => print ($csv), 'template-soal-edufunhub.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /** @return list<string> */
    private function assignedSubjects(User $teacher): array
    {
        $assigned = $teacher->assignedTeacherSubjects();

        return $assigned === null ? Subject::activeKeys() : array_values(array_intersect($assigned, Subject::activeKeys()));
    }

    /** @return array<string, mixed> */
    private function options(): array
    {
        return [
            'games' => Question::GAMES,
            'choiceOnlyGames' => Question::CHOICE_ONLY_GAMES,
            'subjects' => $this->assignedSubjects(request()->user()),
            'grades' => Question::GRADES,
            'topics' => SubjectTopic::forPicker(),
            'levels' => array_keys(Question::LEVELS),
        ];
    }
}
