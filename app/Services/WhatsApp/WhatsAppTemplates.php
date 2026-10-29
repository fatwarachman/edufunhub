<?php

namespace App\Services\WhatsApp;

use App\Models\Setting;
use Illuminate\Support\Str;

/**
 * Admin-editable WhatsApp message templates. Each editable event (see
 * config/whatsapp.php `templates`) has a default text per language in
 * lang/{id,en}/whatsapp.php; a custom text saved here overrides it.
 * Placeholders use the Laravel `:key` syntax.
 */
class WhatsAppTemplates
{
    public const LOCALES = ['id', 'en'];

    private const SETTING_KEY = 'whatsapp.templates';

    /**
     * Editable events with their allowed placeholders.
     *
     * @return array<string, list<string>>
     */
    public function placeholders(): array
    {
        return collect((array) config('whatsapp.templates'))
            ->map(fn (mixed $keys): array => array_values(array_map('strval', (array) $keys)))
            ->all();
    }

    public function isEditable(string $event): bool
    {
        return array_key_exists($event, $this->placeholders());
    }

    /** Raw template (custom or default) for one event and language. */
    public function template(string $event, string $locale): string
    {
        $locale = $this->locale($locale);

        return $this->custom()[$event][$locale] ?? $this->default($event, $locale);
    }

    public function default(string $event, string $locale): string
    {
        return (string) __("whatsapp.events.{$event}", [], $this->locale($locale));
    }

    /**
     * Fill the placeholders of an event template.
     *
     * @param  array<string, scalar|null>  $params
     */
    public function render(string $event, string $locale, array $params = []): string
    {
        $replace = collect($params)
            ->map(fn (mixed $value): string => (string) $value)
            ->sortKeysUsing(fn (string $a, string $b): int => strlen($b) <=> strlen($a))
            ->mapWithKeys(fn (string $value, string $key): array => [':'.$key => $value])
            ->all();

        return trim(strtr($this->template($event, $locale), $replace));
    }

    /**
     * Admin view: every editable event with its texts per language.
     *
     * @return array<string, array{placeholders: list<string>, templates: array<string, array{text: string, default: string, custom: bool}>}>
     */
    public function forAdmin(): array
    {
        $custom = $this->custom();

        return collect($this->placeholders())
            ->map(fn (array $placeholders, string $event): array => [
                'placeholders' => $placeholders,
                'templates' => collect(self::LOCALES)->mapWithKeys(fn (string $locale): array => [$locale => [
                    'text' => $custom[$event][$locale] ?? $this->default($event, $locale),
                    'default' => $this->default($event, $locale),
                    'custom' => isset($custom[$event][$locale]),
                ]])->all(),
            ])
            ->all();
    }

    /**
     * Save the texts of one event. A text equal to the default (or empty)
     * removes the override, so later default changes still apply.
     *
     * @param  array<string, string|null>  $texts
     */
    public function save(string $event, array $texts): void
    {
        $custom = $this->custom();

        foreach (self::LOCALES as $locale) {
            $text = $this->clean((string) ($texts[$locale] ?? ''));
            if ($text === '' || $text === $this->clean($this->default($event, $locale))) {
                unset($custom[$event][$locale]);
            } else {
                $custom[$event][$locale] = $text;
            }
        }

        if (($custom[$event] ?? []) === []) {
            unset($custom[$event]);
        }

        $this->store($custom);
    }

    public function reset(string $event): void
    {
        $custom = $this->custom();
        unset($custom[$event]);
        $this->store($custom);
    }

    /**
     * Placeholders used in a text that the event does not provide.
     *
     * @return list<string>
     */
    public function unknownPlaceholders(string $event, string $text): array
    {
        preg_match_all('/:([a-zA-Z_][a-zA-Z0-9_]*)/', $text, $matches);
        $allowed = $this->placeholders()[$event] ?? [];

        return array_values(array_unique(array_diff($matches[1], $allowed)));
    }

    /** @return array<string, array<string, string>> */
    private function custom(): array
    {
        $saved = json_decode((string) Setting::get(self::SETTING_KEY, ''), true);
        if (! is_array($saved)) {
            return [];
        }

        $editable = $this->placeholders();

        return collect($saved)
            ->only(array_keys($editable))
            ->map(fn (mixed $texts): array => collect(is_array($texts) ? $texts : [])
                ->only(self::LOCALES)
                ->filter(fn (mixed $text): bool => is_string($text) && trim($text) !== '')
                ->all())
            ->filter()
            ->all();
    }

    /** @param  array<string, array<string, string>>  $custom */
    private function store(array $custom): void
    {
        Setting::set(self::SETTING_KEY, json_encode($custom, JSON_UNESCAPED_UNICODE), WhatsAppSettings::GROUP);
    }

    private function clean(string $text): string
    {
        return trim(Str::of($text)->replace("\r\n", "\n")->toString());
    }

    private function locale(string $locale): string
    {
        return $locale === 'en' ? 'en' : 'id';
    }
}
