<?php

namespace App\Services;

use App\Models\Subject;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Deterministic comparison of two finished ability analyses of one player
 * (subject score deltas, strengths gained/lost, average change) and the
 * history of analyses over time. Pure PHP, no model call.
 */
class AbilityComparison
{
    /** Analyses listed in the history (newest first). */
    public const HISTORY = 20;

    /** A subject score change smaller than this counts as "same". */
    public const SAME_THRESHOLD = 0;

    /**
     * The finished analysis of the same player made right before the given one.
     */
    public function previousFor(UserAbilityAssessment $assessment): ?UserAbilityAssessment
    {
        $createdAt = $assessment->created_at;

        return UserAbilityAssessment::query()
            ->where('user_id', $assessment->user_id)
            ->where('status', UserAbilityAssessment::DONE)
            ->whereKeyNot($assessment->id)
            ->when($createdAt !== null, fn (Builder $query) => $query->where(fn (Builder $older) => $older
                ->where('created_at', '<', $createdAt)
                ->orWhere(fn (Builder $same) => $same->where('created_at', $createdAt)->where('id', '<', $assessment->id))))
            ->when($createdAt === null, fn (Builder $query) => $query->where('id', '<', $assessment->id))
            ->latest('created_at')
            ->latest('id')
            ->first();
    }

    /**
     * Finished analyses of the player, newest first.
     *
     * @return Collection<int, UserAbilityAssessment>
     */
    public function finished(User|int $user, int $limit = self::HISTORY): Collection
    {
        return UserAbilityAssessment::query()
            ->where('user_id', $user instanceof User ? $user->id : $user)
            ->where('status', UserAbilityAssessment::DONE)
            ->latest('created_at')
            ->latest('id')
            ->limit($limit)
            ->get(['id', 'user_id', 'status', 'result', 'created_at', 'updated_at']);
    }

    /**
     * Compare a finished analysis with an earlier one. Null when either side
     * is missing or not finished (first analysis: nothing to compare).
     *
     * @return array{previous: array{id: int, date: ?string, average: ?float}, current: array{id: int, date: ?string, average: ?float}, average_delta: ?float, direction: string, subjects: list<array{subject: string, previous: ?int, current: ?int, delta: ?int, direction: string}>, improved: int, declined: int, unchanged: int, strengths_gained: list<string>, strengths_lost: list<string>, weaknesses_new: list<string>, weaknesses_resolved: list<string>}|null
     */
    public function compare(?UserAbilityAssessment $current, ?UserAbilityAssessment $previous): ?array
    {
        if (! $this->isFinished($current) || ! $this->isFinished($previous)) {
            return null;
        }

        $currentScores = self::scores($current->result);
        $previousScores = self::scores($previous->result);
        $subjects = array_values(array_unique([...array_keys($currentScores), ...array_keys($previousScores)]));

        $rows = collect($subjects)->map(function (string $subject) use ($currentScores, $previousScores): array {
            $now = $currentScores[$subject] ?? null;
            $before = $previousScores[$subject] ?? null;
            $delta = $now !== null && $before !== null ? $now - $before : null;

            return [
                'subject' => $subject,
                'previous' => $before,
                'current' => $now,
                'delta' => $delta,
                'direction' => match (true) {
                    $before === null => 'new',
                    $now === null => 'gone',
                    default => self::direction($delta),
                },
            ];
        })->sortBy([
            fn (array $a, array $b): int => ($b['delta'] === null ? -1 : abs($b['delta'])) <=> ($a['delta'] === null ? -1 : abs($a['delta'])),
            fn (array $a, array $b): int => strcmp($a['subject'], $b['subject']),
        ])->values();

        $currentAverage = self::average($currentScores);
        $previousAverage = self::average($previousScores);
        $averageDelta = $currentAverage !== null && $previousAverage !== null ? round($currentAverage - $previousAverage, 1) : null;

        return [
            'previous' => ['id' => $previous->id, 'date' => $previous->created_at?->toIso8601String(), 'average' => $previousAverage],
            'current' => ['id' => $current->id, 'date' => $current->created_at?->toIso8601String(), 'average' => $currentAverage],
            'average_delta' => $averageDelta,
            'direction' => self::direction($averageDelta),
            'subjects' => $rows->all(),
            'improved' => $rows->where('direction', 'up')->count(),
            'declined' => $rows->where('direction', 'down')->count(),
            'unchanged' => $rows->where('direction', 'same')->count(),
            'strengths_gained' => self::diff($current->result, $previous->result, 'strengths'),
            'strengths_lost' => self::diff($previous->result, $current->result, 'strengths'),
            'weaknesses_new' => self::diff($current->result, $previous->result, 'weaknesses'),
            'weaknesses_resolved' => self::diff($previous->result, $current->result, 'weaknesses'),
        ];
    }

    /**
     * Comparison of the analysis with the finished one before it.
     *
     * @return array<string, mixed>|null
     */
    public function withPrevious(?UserAbilityAssessment $assessment): ?array
    {
        if (! $this->isFinished($assessment)) {
            return null;
        }

        return $this->compare($assessment, $this->previousFor($assessment));
    }

    /**
     * Keep the model's progress text; when it is empty and an earlier analysis
     * exists, write a short deterministic one (Indonesian, like the result).
     *
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    public function fillProgress(UserAbilityAssessment $assessment, array $result): array
    {
        if (trim((string) ($result['progress_vs_previous'] ?? '')) !== '') {
            return $result;
        }

        $previous = $this->previousFor($assessment);
        if ($previous === null) {
            return $result;
        }

        $draft = $assessment->replicate()->forceFill(['status' => UserAbilityAssessment::DONE, 'result' => $result]);
        $draft->id = $assessment->id;
        $draft->created_at = $assessment->created_at;
        $comparison = $this->compare($draft, $previous);

        if ($comparison !== null) {
            $result['progress_vs_previous'] = $this->describe($comparison, 'id');
        }

        return $result;
    }

    /**
     * Short plain-language description of a comparison.
     *
     * @param  array<string, mixed>  $comparison
     */
    public function describe(array $comparison, ?string $locale = null): string
    {
        $date = $comparison['previous']['date'] ? now()->parse($comparison['previous']['date'])->locale($locale ?? app()->getLocale())->translatedFormat('j M Y') : '';
        $parts = [];

        $delta = $comparison['average_delta'];
        if ($delta !== null) {
            $key = match ($comparison['direction']) {
                'up' => 'ability.progress.average_up',
                'down' => 'ability.progress.average_down',
                default => 'ability.progress.average_same',
            };
            $parts[] = __($key, [
                'date' => $date,
                'delta' => self::number(abs($delta), $locale),
                'from' => self::number((float) $comparison['previous']['average'], $locale),
                'to' => self::number((float) $comparison['current']['average'], $locale),
            ], $locale);
        }

        $named = fn (string $direction): string => collect($comparison['subjects'])
            ->where('direction', $direction)
            ->take(3)
            ->map(fn (array $row): string => self::subjectName($row['subject'], $locale).' ('.($row['delta'] > 0 ? '+' : '').$row['delta'].')')
            ->implode(', ');

        if (($up = $named('up')) !== '') {
            $parts[] = __('ability.progress.improved', ['subjects' => $up], $locale);
        }
        if (($down = $named('down')) !== '') {
            $parts[] = __('ability.progress.declined', ['subjects' => $down], $locale);
        }
        if ($parts === []) {
            $parts[] = __('ability.progress.no_change', ['date' => $date], $locale);
        }

        return implode(' ', $parts);
    }

    /**
     * @param  array<string, mixed>|null  $result
     * @return array<string, int>
     */
    public static function scores(?array $result): array
    {
        $scores = [];
        foreach ((array) ($result['subject_scores'] ?? []) as $subject => $score) {
            if (is_string($subject) && is_numeric($score)) {
                $scores[$subject] = max(0, min(100, (int) round((float) $score)));
            }
        }

        return $scores;
    }

    /** @param  array<string, int>  $scores */
    public static function average(array $scores): ?float
    {
        return $scores === [] ? null : round(array_sum($scores) / count($scores), 1);
    }

    private function isFinished(?UserAbilityAssessment $assessment): bool
    {
        return $assessment !== null && $assessment->status === UserAbilityAssessment::DONE && is_array($assessment->result);
    }

    private static function direction(int|float|null $delta): string
    {
        return match (true) {
            $delta === null => 'same',
            $delta > self::SAME_THRESHOLD => 'up',
            $delta < -self::SAME_THRESHOLD => 'down',
            default => 'same',
        };
    }

    /**
     * Items of `$key` in `$left` that are not in `$right` (case-insensitive).
     *
     * @param  array<string, mixed>|null  $left
     * @param  array<string, mixed>|null  $right
     * @return list<string>
     */
    private static function diff(?array $left, ?array $right, string $key): array
    {
        $normalize = fn (string $item): string => mb_strtolower(trim($item));
        $other = array_map($normalize, array_filter((array) ($right[$key] ?? []), 'is_string'));

        return array_values(array_filter(
            (array) ($left[$key] ?? []),
            fn (mixed $item): bool => is_string($item) && trim($item) !== '' && ! in_array($normalize($item), $other, true),
        ));
    }

    private static function subjectName(string $key, ?string $locale): string
    {
        foreach (Subject::catalog() as $subject) {
            if ($subject['key'] === $key) {
                return ($locale ?? app()->getLocale()) === 'en' && $subject['name_en'] ? $subject['name_en'] : $subject['name_id'];
            }
        }

        return $key;
    }

    private static function number(float $value, ?string $locale): string
    {
        $english = ($locale ?? app()->getLocale()) === 'en';
        $text = number_format($value, 1, $english ? '.' : ',', $english ? ',' : '.');

        return str_ends_with($text, $english ? '.0' : ',0') ? substr($text, 0, -2) : $text;
    }
}
