<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Teacher\ImportTeacherQuestionsRequest;
use App\Http\Requests\Teacher\TeacherQuestionRequest;
use App\Models\Question;
use App\Models\QuestionCompensationRate;
use App\Models\Subject;
use App\Services\ActivityLogPresenter;
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
    public function __construct(public TeacherQuestionStats $stats) {}

    public function index(Request $request): Response
    {
        $teacher = $request->user();
        $filters = [
            'search' => mb_substr(trim((string) $request->query('search')), 0, 100) ?: null,
            'grade' => is_numeric($request->query('grade')) && in_array((int) $request->query('grade'), Question::GRADES, true) ? (int) $request->query('grade') : null,
            'subject' => in_array($request->query('subject'), Subject::keys(), true) ? (string) $request->query('subject') : null,
        ];

        $questions = Question::query()
            ->authoredByTeacher($teacher)
            ->when($filters['search'], fn (Builder $q, string $search) => $q->where(fn (Builder $q) => $q
                ->where('prompt_id', 'like', '%'.addcslashes($search, '%_\\').'%')
                ->orWhere('prompt_en', 'like', '%'.addcslashes($search, '%_\\').'%')))
            ->when($filters['grade'] !== null, fn (Builder $q) => $q->whereJsonContains('grades', $filters['grade']))
            ->when($filters['subject'], fn (Builder $q, string $subject) => $q->where('subject', $subject))
            ->latest('id')
            ->paginate(15)
            ->withQueryString();

        $perQuestion = $this->stats->perQuestion($teacher, $questions->getCollection()->pluck('id')->all());

        return Inertia::render('teacher/index', [
            'overview' => $this->stats->overview($teacher),
            'rates' => QuestionCompensationRate::amounts(),
            'filters' => (object) array_filter($filters, fn ($value): bool => $value !== null),
            'questions' => $questions->through(fn (Question $question): array => [
                ...$question->only(['id', 'type', 'subject', 'prompt_id', 'prompt_en', 'games', 'is_active', 'source']),
                'grades' => $question->grades ?? [],
                'created_at' => $question->created_at?->toIso8601String(),
                'stats' => $perQuestion->get($question->id) ?? ['answered' => 0, 'correct' => 0, 'wrong' => 0, 'success_rate' => null, 'players' => 0, 'compensation' => 0, 'games' => [], 'grades' => []],
            ]),
            ...$this->options(),
        ]);
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

        return redirect()->route('teacher.questions.index')->with('success', __('questions.created'));
    }

    public function edit(Question $question): Response
    {
        Gate::authorize('update', $question);

        return Inertia::render('teacher/form', [
            'question' => [
                ...$question->only(['id', 'type', 'subject', 'prompt_id', 'prompt_en', 'options', 'answer', 'hint_id', 'hint_en', 'games', 'is_active']),
                'grades' => $question->grades ?? [],
            ],
            ...$this->options(),
        ]);
    }

    public function update(TeacherQuestionRequest $request, Question $question): RedirectResponse
    {
        $question->update([...$request->questionAttributes(), 'updated_by' => $request->user()->id]);

        activity()->causedBy($request->user())->performedOn($question)->withProperties(ActivityLogPresenter::changes($question))->log('Teacher updated question');

        return redirect()->route('teacher.questions.index')->with('success', __('questions.updated'));
    }

    public function destroy(Request $request, Question $question): RedirectResponse
    {
        Gate::authorize('delete', $question);

        activity()->causedBy($request->user())->performedOn($question)->withProperties(ActivityLogPresenter::snapshotOf($question))->log('Teacher deleted question');
        $question->delete();

        return redirect()->route('teacher.questions.index')->with('success', __('questions.deleted'));
    }

    public function importForm(): Response
    {
        return Inertia::render('teacher/import', [
            'columns' => TeacherQuestionImporter::COLUMNS,
            'maxRows' => TeacherQuestionImporter::MAX_ROWS,
            ...$this->options(),
        ]);
    }

    public function import(ImportTeacherQuestionsRequest $request, TeacherQuestionImporter $importer): RedirectResponse
    {
        $result = $importer->import($request->file('file')->getRealPath(), $request->user());

        if ($result['errors'] !== []) {
            return back()->with('importErrors', $result['errors'])->withErrors(['file' => __('questions.import.failed')]);
        }

        activity()->causedBy($request->user())->withProperties(['count' => $result['imported']])->log('Teacher imported questions');

        return redirect()->route('teacher.questions.index')->with('success', trans_choice('questions.import.success', $result['imported'], ['count' => $result['imported']]));
    }

    public function template(TeacherQuestionImporter $importer): StreamedResponse
    {
        $csv = $importer->template();

        return response()->streamDownload(fn () => print ($csv), 'template-soal-edufunhub.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /** @return array<string, mixed> */
    private function options(): array
    {
        return [
            'games' => Question::GAMES,
            'choiceOnlyGames' => Question::CHOICE_ONLY_GAMES,
            'subjects' => Subject::activeKeys(),
            'grades' => Question::GRADES,
        ];
    }
}
