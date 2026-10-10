<?php

namespace App\Jobs;

use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\GowaClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use RuntimeException;
use Throwable;

/**
 * Delivers one logged WhatsApp message through GOWA. Retries a few times
 * (container restart, short disconnect); the log row always ends as sent or
 * failed with a readable reason.
 */
class SendWhatsAppMessage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 60;

    public function __construct(public WhatsAppMessage $message)
    {
        $this->onConnection(config('whatsapp.queue_connection'));
        $this->onQueue((string) config('whatsapp.queue'));
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [30, 120];
    }

    public function handle(GowaClient $client): void
    {
        $message = $this->message->fresh();
        if ($message === null || $message->status !== WhatsAppMessage::QUEUED) {
            return;
        }

        try {
            $message->markSent($client->sendText($message->phone, $message->body));
        } catch (RuntimeException $exception) {
            $message->forceFill(['error' => $exception->getMessage()])->save();
            if ($this->attempts() >= $this->tries || ! $this->canRetry()) {
                $message->markFailed($exception->getMessage());

                return;
            }

            throw $exception;
        }
    }

    /**
     * In-process drivers (sync, background) cannot retry later; rethrowing
     * there would only surface the error in the request that triggered it.
     */
    private function canRetry(): bool
    {
        return $this->job !== null && ! in_array($this->job->getConnectionName(), ['sync', 'background', 'deferred'], true);
    }

    public function failed(?Throwable $exception): void
    {
        $message = $this->message->fresh();
        if ($message?->status === WhatsAppMessage::QUEUED) {
            $message->markFailed($exception instanceof RuntimeException ? $exception->getMessage() : __('whatsapp.errors.send_failed'));
        }
    }
}
