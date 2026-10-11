<?php

namespace App\Services\WhatsApp;

use App\Models\Subject;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Services\AbilityComparison;
use App\Services\PlayerAbility;
use Illuminate\Support\Str;

/**
 * Full WhatsApp text of a finished ability analysis, in the player's
 * language: summary, score per subject, strengths, room to grow, numbered
 * study tips, learning style, the score change per subject against the
 * latest earlier analysis (same day or not), the progress narrative and the
 * link to the analysis page.
 * Mirrors the share text of the player card (resources/js/lib/ability-share.ts).
 */
class AbilityReportMessage
{
    /** Keep well below WhatsApp's 65k limit and readable on a phone. */
    public const MAX_LENGTH = 4000;

    public function __construct(private PlayerAbility $abilities, private AbilityComparison $comparison) {}

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

        $lines = [$line('greeting', ['name' => $user->playerProfile?->nickname ?: $user->name])];
        if ($assessment->trigger === UserAbilityAssessment::TRIGGER_AUTO && $assessment->trigger_answered) {
            $lines[] = $line('milestone', ['count' => $assessment->trigger_answered]);
        }
        array_push($lines,
            '',
            $section('📊', 'title'),
            '📅 '.$line('date', ['date' => ($assessment->updated_at ?? now())->locale($locale)->translatedFormat('j F Y')]),
            '',
            $section('📝', 'summary'),
            $text('summary'),
        );

        $names = collect(Subject::catalog())->mapWithKeys(fn (array $subject): array => [
            $subject['key'] => $locale === 'en' ? ($subject['name_en'] ?: $subject['name_id']) : $subject['name_id'],
        ]);
        $subjectName = fn (string $subject): string => $names[$subject] ?? Str::headline($subject);

        $scores = array_filter((array) ($result['subject_scores'] ?? []), 'is_numeric');
        arsort($scores);
        if ($scores !== []) {
            array_push($lines, '', $section('🎯', 'scores'));
            foreach ($scores as $subject => $score) {
                $score = (int) $score;
                $dot = $score >= 80 ? '🟢' : ($score >= 60 ? '🟡' : '🔴');
                $lines[] = "{$dot} ".$subjectName((string) $subject).": *{$score}*";
            }
        }

        array_push($lines, ...$this->changes($assessment, $locale, $line, $section, $subjectName));

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

    /**
     * Score change per subject against the latest earlier finished analysis
     * (same day or not); empty for the first analysis.
     *
     * @param  callable(string, array<string, mixed>=): string  $line
     * @param  callable(string, string): string  $section
     * @param  callable(string): string  $subjectName
     * @return list<string>
     */
    private function changes(UserAbilityAssessment $assessment, string $locale, callable $line, callable $section, callable $subjectName): array
    {
        if ($assessment->status !== UserAbilityAssessment::DONE) {
            return [];
        }

        $comparison = $this->comparison->withPrevious($assessment);
        if ($comparison === null) {
            return ['', $section('📈', 'changes'), $line('first')];
        }

        $previousAt = $comparison['previous']['date'] ? now()->parse($comparison['previous']['date'])->setTimezone((string) config('screen-time.timezone', 'UTC')) : null;
        $lines = ['', $section('📈', 'changes')];
        if ($previousAt !== null) {
            $lines[] = $line('compared', ['date' => $previousAt->locale($locale)->translatedFormat('j F Y, H:i')]);
        }

        if ($comparison['average_delta'] !== null) {
            $lines[] = $line('average_'.$comparison['direction'], [
                'from' => self::number((float) $comparison['previous']['average'], $locale),
                'to' => self::number((float) $comparison['current']['average'], $locale),
                'delta' => self::number(abs((float) $comparison['average_delta']), $locale),
            ]);
        }

        foreach ($comparison['subjects'] as $row) {
            $name = $subjectName($row['subject']);
            $lines[] = match ($row['direction']) {
                'up' => "⬆️ {$name}: {$row['previous']} → *{$row['current']}* (+{$row['delta']})",
                'down' => "⬇️ {$name}: {$row['previous']} → *{$row['current']}* ({$row['delta']})",
                'same' => "➖ {$name}: *{$row['current']}* ({$line('same')})",
                'new' => "🆕 {$name}: *{$row['current']}*",
                default => "▫️ {$name}: {$row['previous']} → —",
            };
        }

        return $lines;
    }

    private static function number(float $value, string $locale): string
    {
        $text = number_format($value, 1, $locale === 'en' ? '.' : ',', $locale === 'en' ? ',' : '.');

        return str_ends_with($text, $locale === 'en' ? '.0' : ',0') ? substr($text, 0, -2) : $text;
    }
}
