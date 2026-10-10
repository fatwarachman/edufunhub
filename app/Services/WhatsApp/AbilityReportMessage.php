<?php

namespace App\Services\WhatsApp;

use App\Models\Subject;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Services\PlayerAbility;
use Illuminate\Support\Str;

/**
 * Full WhatsApp text of a finished ability analysis, in the player's
 * language: summary, score per subject, strengths, room to grow, numbered
 * study tips, learning style, progress and the link to the analysis page.
 * Mirrors the share text of the player card (resources/js/lib/ability-share.ts).
 */
class AbilityReportMessage
{
    /** Keep well below WhatsApp's 65k limit and readable on a phone. */
    public const MAX_LENGTH = 4000;

    public function __construct(private PlayerAbility $abilities) {}

    public function build(User $user, UserAbilityAssessment $assessment): string
    {
        $locale = $user->locale === 'en' ? 'en' : 'id';
        $result = (array) $assessment->result;
        $line = fn (string $key, array $replace = []): string => __("whatsapp.ability.{$key}", $replace, $locale);
        $section = fn (string $emoji, string $key): string => "{$emoji} *{$line($key)}*";
        $list = fn (string $key): array => array_values(array_filter(
            array_map(fn (mixed $item): string => is_string($item) ? rtrim(trim($item), '.;,') : '', (array) ($result[$key] ?? [])),
            fn (string $item): bool => $item !== '',
        ));
        $text = fn (string $key): string => trim((string) ($result[$key] ?? ''));

        $lines = [
            $line('greeting', ['name' => $user->playerProfile?->nickname ?: $user->name]),
            '',
            $section('📊', 'title'),
            '📅 '.$line('date', ['date' => ($assessment->updated_at ?? now())->locale($locale)->translatedFormat('j F Y')]),
            '',
            $section('📝', 'summary'),
            $text('summary'),
        ];

        $scores = array_filter((array) ($result['subject_scores'] ?? []), 'is_numeric');
        arsort($scores);
        if ($scores !== []) {
            $names = collect(Subject::catalog())->mapWithKeys(fn (array $subject): array => [
                $subject['key'] => $locale === 'en' ? ($subject['name_en'] ?: $subject['name_id']) : $subject['name_id'],
            ]);
            array_push($lines, '', $section('🎯', 'scores'));
            foreach ($scores as $subject => $score) {
                $score = (int) $score;
                $dot = $score >= 80 ? '🟢' : ($score >= 60 ? '🟡' : '🔴');
                $lines[] = "{$dot} ".($names[$subject] ?? Str::headline((string) $subject)).": *{$score}*";
            }
        }

        foreach ([['💪', 'strengths', 'strengths', '✅'], ['🌱', 'growth', 'weaknesses', '📌']] as [$emoji, $label, $key, $bullet]) {
            if (($items = $list($key)) !== []) {
                array_push($lines, '', $section($emoji, $label), ...array_map(fn (string $item): string => "{$bullet} {$item}", $items));
            }
        }

        if (($tips = $list('recommendations')) !== []) {
            array_push($lines, '', $section('💡', 'tips'));
            foreach ($tips as $index => $tip) {
                $lines[] = ($index + 1).'. '.$tip;
            }
        }

        foreach ([['🧠', 'style', 'learning_style'], ['📈', 'progress', 'progress_vs_previous']] as [$emoji, $label, $key]) {
            if (($value = $text($key)) !== '') {
                array_push($lines, '', $section($emoji, $label), $value);
            }
        }

        $footer = ['', '🔗 '.$line('footer', ['url' => url($this->abilities->shareUrl($assessment))])];
        $body = implode("\n", $lines);
        $room = self::MAX_LENGTH - mb_strlen(implode("\n", $footer)) - 1;

        return Str::limit($body, $room)."\n".implode("\n", $footer);
    }
}
