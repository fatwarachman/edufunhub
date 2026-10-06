<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreAbilityAssessmentRequest;
use App\Jobs\GenerateAbilityAssessment;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Services\Ai\AbilityProfileBuilder;
use App\Services\Ai\AiSettings;
use Illuminate\Http\RedirectResponse;

/**
 * Starts an AI ability analysis of one player (manual, super admin only).
 * The input is prepared now and stored, the model call runs in a job.
 */
class AbilityAssessmentController extends Controller
{
    /** Assessments listed on the user page (latest first). */
    public const HISTORY = 6;

    public function store(StoreAbilityAssessmentRequest $request, User $user, AiSettings $settings, AbilityProfileBuilder $builder): RedirectResponse
    {
        if (! $settings->configured()) {
            return back()->withErrors(['assessment' => __('ai.not_configured')]);
        }

        UserAbilityAssessment::failStale($user->id);
        if (UserAbilityAssessment::query()->where('user_id', $user->id)->running()->exists()) {
            return back()->withErrors(['assessment' => __('ai.assessment_running')]);
        }

        $assessment = UserAbilityAssessment::query()->create([
            'user_id' => $user->id,
            'requested_by' => $request->user()->id,
            'status' => UserAbilityAssessment::PENDING,
            'model' => (string) $settings->model(),
            'input_snapshot' => $builder->build($user),
        ]);

        GenerateAbilityAssessment::dispatch($assessment);

        activity()->causedBy($request->user())->performedOn($user)
            ->withProperties(['assessment_id' => $assessment->id, 'model' => $assessment->model])
            ->log('Started AI ability analysis');

        return back()->with('success', __('ai.assessment_started'));
    }

    /**
     * Deferred prop of the user page: latest analyses and, before the first
     * one, a preview of the data the model would receive.
     *
     * @return array<string, mixed>
     */
    public static function forUserPage(User $user, ?User $viewer, AiSettings $settings, AbilityProfileBuilder $builder): array
    {
        UserAbilityAssessment::failStale($user->id);

        $assessments = UserAbilityAssessment::query()
            ->with('requester:id,name')
            ->where('user_id', $user->id)
            ->latest('created_at')
            ->latest('id')
            ->limit(self::HISTORY)
            ->get()
            ->map(fn (UserAbilityAssessment $assessment): array => [
                'id' => $assessment->id,
                'status' => $assessment->status,
                'model' => $assessment->model,
                'requested_by' => $assessment->requester?->name,
                'created_at' => $assessment->created_at?->toIso8601String(),
                'updated_at' => $assessment->updated_at?->toIso8601String(),
                'error' => $assessment->error,
                'result' => $assessment->result,
                'input' => $assessment->input_snapshot,
            ]);

        return [
            'configured' => $settings->configured(),
            'can_run' => (bool) $viewer?->is_superadmin,
            'model' => $settings->model(),
            'running' => $assessments->contains('status', UserAbilityAssessment::PENDING),
            'items' => $assessments->values()->all(),
            'preview' => $assessments->isEmpty() ? $builder->build($user) : null,
        ];
    }
}
