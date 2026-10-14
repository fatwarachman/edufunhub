<?php

namespace App\Http\Requests\Api;

use App\Services\GameServiceSigner;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Proximity chat line the Go classroom world reports back. Authorized only by
 * the game service signature over the raw body; the text is stripped of
 * control characters, trimmed and cut to 120 characters before validation.
 */
class StoreClassroomChatRequest extends FormRequest
{
    public const MAX_TEXT = 120;

    public function authorize(): bool
    {
        return app(GameServiceSigner::class)->verifyRequest(
            (string) $this->header('X-Game-Timestamp'),
            (string) $this->header('X-Game-Signature'),
            $this->getContent(),
        );
    }

    protected function prepareForValidation(): void
    {
        $text = $this->input('text');

        if (is_string($text)) {
            $this->merge(['text' => self::clean($text)]);
        }
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'event_id' => ['required', 'string', 'max:80'],
            'classroom' => ['required', 'integer', 'min:1'],
            'from' => ['required', 'integer', 'min:1'],
            'to' => ['required', 'integer', 'min:1', 'different:from'],
            'text' => ['required', 'string', 'max:'.self::MAX_TEXT],
        ];
    }

    /** Removes control/format characters (incl. newlines), trims and caps the length. */
    public static function clean(string $text): string
    {
        $text = (string) preg_replace('/[\p{Cc}\p{Cf}]+/u', '', mb_scrub($text, 'UTF-8'));

        return mb_substr(trim($text), 0, self::MAX_TEXT);
    }
}
