<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateCompensationRatesRequest;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\QuestionCompensationRate;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin: compensation teachers earn per correct answer, by player grade.
 */
class CompensationController extends Controller
{
    public function index(): Response
    {
        $earned = QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->join('users', 'users.id', '=', 'questions.created_by')
            ->whereIn('questions.source', Question::TEACHER_SOURCES)
            ->where('question_answers.compensation', '>', 0)
            ->selectRaw('users.id as teacher_id, users.name as name, users.email as email, COUNT(*) as correct_answers, SUM(question_answers.compensation) as total')
            ->groupBy('users.id', 'users.name', 'users.email')
            ->orderByDesc('total')
            ->limit(20)
            ->get();

        $lastUpdate = QuestionCompensationRate::query()->with('editor:id,name')->latest('updated_at')->first();

        return Inertia::render('admin/compensation/index', [
            'rates' => collect(QuestionCompensationRate::amounts())
                ->map(fn (int $amount, int $grade): array => ['grade' => $grade, 'amount' => $amount])
                ->values(),
            'teachers' => $earned->map(fn ($row): array => [
                'id' => (int) $row->teacher_id,
                'name' => $row->name,
                'email' => $row->email,
                'correct_answers' => (int) $row->correct_answers,
                'total' => (int) $row->total,
            ]),
            'totalPaid' => (int) QuestionAnswer::query()->sum('compensation'),
            'lastUpdated' => $lastUpdate ? [
                'at' => $lastUpdate->updated_at?->toIso8601String(),
                'by' => $lastUpdate->editor?->name,
            ] : null,
        ]);
    }

    public function update(UpdateCompensationRatesRequest $request): RedirectResponse
    {
        $before = QuestionCompensationRate::amounts();

        foreach ($request->validated('rates') as $rate) {
            QuestionCompensationRate::query()->updateOrCreate(
                ['grade' => (int) $rate['grade']],
                ['amount' => (int) $rate['amount'], 'updated_by' => $request->user()->id],
            );
        }

        activity()->causedBy($request->user())
            ->withProperties(['old' => $before, 'attributes' => QuestionCompensationRate::amounts()])
            ->log('Updated question compensation rates');

        return back()->with('success', __('Compensation rates updated.'));
    }
}
