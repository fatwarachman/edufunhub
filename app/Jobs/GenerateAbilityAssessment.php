<?php

namespace App\Jobs;

use App\Models\UserAbilityAssessment;
use App\Services\AbilityComparison;
use App\Services\Ai\AbilityAnalyzer;
use App\Services\WhatsApp\AbilityReportMessage;
use App\Services\WhatsApp\WhatsAppNotifier;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Laravel\Ai\Exceptions\AiException;
use RuntimeException;
use Throwable;

/**
 * Runs one AI ability analysis and stores the result (or a readable error)
 * on its own row: earlier analyses are never changed, so they stay available
 * for comparison.
 */
class GenerateAbilityAssessment implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 300;

    public function __construct(public UserAbilityAssessment $assessment)
    {
        $this->onConnection(config('ai.ability_assessment.connection'));
        $this->onQueue('low');
    }

    public function handle(AbilityAnalyzer $analyzer, AbilityComparison $comparison): void
    {
        $assessment = $this->assessment->fresh();
        if ($assessment === null || $assessment->status !== UserAbilityAssessment::PENDING) {
            return;
        }

        try {
            $assessment->markDone($comparison->fillProgress($assessment, $analyzer->analyze($assessment)));
        } catch (Throwable $exception) {
            report($exception);
            $assessment->markFailed(self::readable($exception));

            return;
        }

        $this->notifyPlayer($assessment);
    }

    /**
     * Send the full analysis to the player's WhatsApp right away. The job
     * already runs in a worker, so delivery happens in this process.
     */
    private function notifyPlayer(UserAbilityAssessment $assessment): void
    {
        $user = $assessment->user()->with('playerProfile')->first();
        if ($user === null || ! $user->canReceiveWhatsApp()) {
            return;
        }

        try {
            app(WhatsAppNotifier::class)->notifyText(
                $user,
                'ability_analysis',
                app(AbilityReportMessage::class)->build($user, $assessment),
                now: true,
            );
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    /** The worker gave up (timeout, crash): never leave the analysis pending. */
    public function failed(?Throwable $exception): void
    {
        $this->assessment->fresh()?->markFailed($exception ? self::readable($exception) : __('ai.assessment_failed'));
    }

    /** Message safe to show admins: no stack traces, URLs or response bodies. */
    public static function readable(Throwable $exception): string
    {
        return match (true) {
            $exception instanceof ConnectionException => __('ai.unreachable'),
            $exception instanceof RequestException => __('ai.http_error', ['status' => $exception->response->status()]),
            $exception instanceof RuntimeException, $exception instanceof AiException => $exception->getMessage(),
            default => __('ai.assessment_failed'),
        };
    }
}
