<?php

namespace App\Services\WhatsApp;

use App\Models\Setting;
use App\Models\WhatsAppMessage;

/**
 * Admin switches for WhatsApp notifications: a master switch plus one switch
 * per event from config/whatsapp.php. Stored in the `settings` table.
 */
class WhatsAppSettings
{
    public const GROUP = 'whatsapp';

    /** Master switch; off until the admin links a number and turns it on. */
    public function enabled(): bool
    {
        return (bool) Setting::get('whatsapp.enabled', false);
    }

    public function eventEnabled(string $event): bool
    {
        $events = $this->events();

        return array_key_exists($event, $events) && $events[$event]['enabled'];
    }

    /**
     * Every configured event with its current switch.
     *
     * @return array<string, array{label: string, description: string, enabled: bool}>
     */
    public function events(): array
    {
        $saved = json_decode((string) Setting::get('whatsapp.events', ''), true);
        $saved = is_array($saved) ? $saved : [];

        return collect((array) config('whatsapp.events'))
            ->map(fn (array $event, string $key): array => [
                'label' => (string) $event['label'],
                'description' => (string) $event['description'],
                'enabled' => (bool) ($saved[$key] ?? $event['default'] ?? true),
            ])
            ->all();
    }

    /**
     * English event labels for the admin, translated in id-admin.json.
     *
     * @return array<string, string>
     */
    public function eventLabels(): array
    {
        return [
            ...collect($this->events())->map(fn (array $event): string => $event['label'])->all(),
            WhatsAppMessage::TEST_EVENT => 'Test message',
        ];
    }

    /** @param  array<string, bool>  $events */
    public function save(bool $enabled, array $events): void
    {
        $known = array_keys((array) config('whatsapp.events'));
        $events = collect($events)->only($known)->map(fn (mixed $value): bool => (bool) $value)->all();

        Setting::set('whatsapp.enabled', $enabled ? '1' : '0', self::GROUP);
        Setting::set('whatsapp.events', json_encode($events), self::GROUP);
    }
}
