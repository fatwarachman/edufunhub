<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreAbilityAssessmentRequest;
use App\Jobs\GenerateAbilityAssessment;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Services\AbilityComparison;
use App\Services\Ai\AbilityProfileBuilder;
use App\Services\Ai\AiSettings;
use App\Services\PlayerAbility;
use Illuminate\Http\RedirectResponse;

/**
 * Starts an AI ability analysis of one player (manual, super admin only).
 * The input is prepared now and stored, the model call runs in a job.
 */
class AbilityAssessmentController extends Controller
{
    /** Assessments listed on the user page (latest first). */
    public const HISTORY = AbilityComparison::HISTORY;

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
     * Deferred prop of the user page: the analysis history (every run keeps
     * its own row), the comparison of the latest finished analysis with the
     * one before it and, before the first one, a preview of the model input.
     * The input snapshot is only sent for the latest and the latest finished
     * analysis to keep the payload small.
     *
     * @return array<string, mixed>
     */
    public static function forUserPage(User $user, ?User $viewer, AiSettings $settings, AbilityProfileBuilder $builder): array
    {
        UserAbilityAssessment::failStale($user->id);

        $rows = UserAbilityAssessment::query()
            ->with('requester:id,name')
            ->where('user_id', $user->id)
            ->latest('created_at')
            ->latest('id')
            ->limit(self::HISTORY)
            ->get();

        $finished = $rows->where('status', UserAbilityAssessment::DONE)->values();
        $withInput = array_filter([$rows->first()?->id, $finished->first()?->id]);
        $comparison = app(AbilityComparison::class);

        $assessments = $rows
            ->map(fn (UserAbilityAssessment $assessment): array => [
                'id' => $assessment->id,
                'status' => $assessment->status,
                'model' => $assessment->model,
                'requested_by' => $assessment->requester?->name,
                'created_at' => $assessment->created_at?->toIso8601String(),
                'updated_at' => $assessment->updated_at?->toIso8601String(),
                'error' => $assessment->error,
                'result' => $assessment->result,
                'average' => $assessment->status === UserAbilityAssessment::DONE ? AbilityComparison::average(AbilityComparison::scores($assessment->result)) : null,
                'input' => in_array($assessment->id, $withInput, true) ? $assessment->input_snapshot : null,
            ]);

        return [
            'configured' => $settings->configured(),
            'can_run' => (bool) $viewer?->is_superadmin,
            'model' => $settings->model(),
            'running' => $assessments->contains('status', UserAbilityAssessment::PENDING),
            'items' => $assessments->values()->all(),
            'total' => UserAbilityAssessment::query()->where('user_id', $user->id)->count(),
            'comparison' => $finished->count() >= 2 ? $comparison->compare($finished[0], $finished[1]) : null,
            'preview' => $assessments->isEmpty() ? $builder->build($user) : null,
            'share' => self::share($user),
        ];
    }

    /**
     * Player-facing view of the latest finished analysis (same text and short
     * link the player shares), so admins can send it on WhatsApp.
     *
     * @return array<string, mixed>|null
     */
    private static function share(User $user): ?array
    {
        $abilities = app(PlayerAbility::class);
        $presented = $abilities->present($abilities->latestFor($user));

        if ($presented === null) {
            return null;
        }

        return [
            ...$presented,
            'owner_name' => $user->playerProfile?->nickname ?: $user->name,
        ];
    }
}
