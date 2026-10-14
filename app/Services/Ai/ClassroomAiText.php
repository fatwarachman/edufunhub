<?php

namespace App\Services\Ai;

use Illuminate\Support\Str;

/**
 * Classroom AI text stored as sections of short bullet points.
 *
 * The `ai_summary` / `ai_feedback` text columns hold JSON
 * `{"v":2,"sections":{"overview":["…"],…}}`. Analyses written before the
 * bullet format are plain text; they are split into sentences under one
 * fallback section, so old results still render as points.
 */
class ClassroomAiText
{
    public const SUMMARY_SECTIONS = ['overview', 'strengths', 'weaknesses', 'misconceptions', 'actions'];

    public const STUDENT_SECTIONS = ['strengths', 'improve', 'tips'];

    public const MAX_POINTS = 6;

    public const MAX_POINT_LENGTH = 300;

    /**
     * Clean model output into the given sections.
     *
     * @param  list<string>  $keys
     * @return array<string, list<string>>
     */
    public static function sections(mixed $raw, array $keys): array
    {
        $raw = is_array($raw) ? $raw : [];
        $sections = [];
        foreach ($keys as $key) {
            $points = collect(is_array($raw[$key] ?? null) ? $raw[$key] : [])
                ->map(fn (mixed $point): string => self::point($point))
                ->filter(fn (string $point): bool => $point !== '')
                ->unique()
                ->take(self::MAX_POINTS)
                ->values()
                ->all();
            $sections[$key] = $points;
        }

        return $sections;
    }

    /** @param array<string, list<string>> $sections */
    public static function isEmpty(array $sections): bool
    {
        return collect($sections)->flatten()->isEmpty();
    }

    /** @param array<string, list<string>> $sections */
    public static function encode(array $sections): string
    {
        return (string) json_encode(['v' => 2, 'sections' => $sections], JSON_UNESCAPED_UNICODE);
    }

    /**
     * Sections for display, or null when nothing is stored.
     *
     * @param  list<string>  $keys
     * @return array<string, list<string>>|null
     */
    public static function decode(?string $stored, array $keys, string $fallback): ?array
    {
        if ($stored === null || trim($stored) === '') {
            return null;
        }

        $data = json_decode($stored, true);
        if (is_array($data) && ($data['v'] ?? null) === 2 && is_array($data['sections'] ?? null)) {
            $sections = self::sections($data['sections'], $keys);

            return self::isEmpty($sections) ? null : $sections;
        }

        $sections = array_fill_keys($keys, []);
        $sections[$fallback] = collect(preg_split('/(?<=[.!?])\s+(?=[A-Z0-9])/u', trim($stored)) ?: [])
            ->map(fn (string $sentence): string => self::point($sentence))
            ->filter(fn (string $sentence): bool => $sentence !== '')
            ->values()
            ->all();

        return self::isEmpty($sections) ? null : $sections;
    }

    /** One plain-text point: no tags, control/bidi characters, list markers or extra spaces. */
    private static function point(mixed $text): string
    {
        $text = is_string($text) ? $text : '';
        $text = preg_replace('/[\x{0000}-\x{001F}\x{007F}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', ' ', $text) ?? '';
        $text = strip_tags($text);
        $text = preg_replace('/^\s*(?:[-*•·]+|\d{1,2}[.)])\s*/u', '', $text) ?? '';
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');

        return Str::limit($text, self::MAX_POINT_LENGTH, '…');
    }
}
