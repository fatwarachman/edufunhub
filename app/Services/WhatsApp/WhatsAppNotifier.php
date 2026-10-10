<?php

namespace App\Services\WhatsApp;

use App\Jobs\SendWhatsAppMessage;
use App\Models\User;
use App\Models\WhatsAppMessage;
use Illuminate\Support\Str;

/**
 * Single entry point for automatic WhatsApp notifications. Callers name an
 * event from config/whatsapp.php plus template parameters (or a ready-made
 * body); this class checks the admin switches, the player's number and
 * opt-in and the hourly cap, logs the message and delivers it.
 *
 * Adding a notification: config/whatsapp.php `events.<key>` + template in
 * lang/{id,en}/whatsapp.php `events.<key>` + one notify() call.
 */
class WhatsAppNotifier
{
    public function __construct(private WhatsAppSettings $settings) {}

    /**
     * Render the event template in the player's language and queue it.
     *
     * @param  array<string, scalar|null>  $params
     */
    public function notify(User $user, string $event, array $params = []): ?WhatsAppMessage
    {
        if (! $this->isKnownEvent($event) || ! $this->reachable($user)) {
            return null;
        }

        $locale = $user->locale === 'en' ? 'en' : 'id';
        $body = trim(__("whatsapp.events.{$event}", [
            'name' => $user->playerProfile?->nickname ?: $user->name,
            'app' => config('app.name'),
            'url' => url('/'),
            ...array_map(fn (mixed $value): string => Str::limit((string) $value, 900), $params),
        ], $locale));

        $skipReason = $this->skipReason($event);
        if ($skipReason !== null) {
            $this->recordSkipped($user, $event, $body, $skipReason);

            return null;
        }

        return $this->deliver($user, $event, $body);
    }

    /**
     * Send a body built by the caller (long reports). `$now` delivers inside
     * the current process, for callers that already run in a queue worker.
     */
    public function notifyText(User $user, string $event, string $body, bool $now = false): ?WhatsAppMessage
    {
        if (! $this->isKnownEvent($event) || ! $this->reachable($user) || trim($body) === '') {
            return null;
        }

        $skipReason = $this->skipReason($event);
        if ($skipReason !== null) {
            $this->recordSkipped($user, $event, trim($body), $skipReason);

            return null;
        }

        return $this->deliver($user, $event, trim($body), $now);
    }

    /**
     * Greeting for a player who saved a WhatsApp number for the first time.
     * Sent once per account.
     */
    public function welcome(User $user): ?WhatsAppMessage
    {
        if ($user->whatsapp_welcomed_at !== null) {
            return null;
        }

        $message = $this->notify($user, 'welcome');
        if ($message !== null) {
            $user->forceFill(['whatsapp_welcomed_at' => now()])->saveQuietly();
        }

        return $message;
    }

    private function isKnownEvent(string $event): bool
    {
        return array_key_exists($event, $this->settings->events());
    }

    /** The player has a number, allows WhatsApp and is under the hourly cap. */
    private function reachable(User $user): bool
    {
        return $user->canReceiveWhatsApp() && ! $this->overHourlyCap($user);
    }

    /** Why an admin switch blocks this event, or null when it may be sent. */
    private function skipReason(string $event): ?string
    {
        if (! $this->settings->enabled()) {
            return __('whatsapp.skipped.master_off');
        }

        return $this->settings->eventEnabled($event) ? null : __('whatsapp.skipped.event_off');
    }

    private function recordSkipped(User $user, string $event, string $body, string $reason): void
    {
        WhatsAppMessage::query()->create([
            'user_id' => $user->id,
            'event' => $event,
            'phone' => (string) $user->whatsapp_number,
            'body' => $body,
            'status' => WhatsAppMessage::SKIPPED,
            'error' => $reason,
        ]);
    }

    private function deliver(User $user, string $event, string $body, bool $now = false): WhatsAppMessage
    {
        $message = WhatsAppMessage::query()->create([
            'user_id' => $user->id,
            'event' => $event,
            'phone' => (string) $user->whatsapp_number,
            'body' => $body,
        ]);

        if ($now) {
            SendWhatsAppMessage::dispatchSync($message);
        } else {
            SendWhatsAppMessage::dispatch($message)->afterCommit();
        }

        return $message->refresh();
    }

    private function overHourlyCap(User $user): bool
    {
        return WhatsAppMessage::query()
            ->where('user_id', $user->id)
            ->where('status', '!=', WhatsAppMessage::SKIPPED)
            ->where('created_at', '>=', now()->subHour())
            ->count() >= (int) config('whatsapp.per_user_hourly');
    }
}
