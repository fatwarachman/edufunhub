<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\PointRulesRequest;
use App\Models\Question;
use App\Services\PointRules;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Point guide for every game: per correct answer, win, draw and participation.
 */
class PointRulesController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('admin/point-rules', [
            'rules' => PointRules::current(),
            'defaults' => PointRules::DEFAULTS,
            'bounds' => PointRules::BOUNDS,
            'bonusQuestions' => Question::query()->whereNotNull('points')->where('points', '>', 0)->count(),
            'maxQuestionPoints' => Question::MAX_POINTS,
        ]);
    }

    public function update(PointRulesRequest $request): RedirectResponse
    {
        PointRules::save($request->validated());
        activity()->causedBy($request->user())->withProperties($request->validated())->log('Updated point rules');

        return back()->with('success', __('ai.points_saved'));
    }
}
