<?php

namespace App\Services;

use App\Models\SequenceAttempt;
use App\Models\SequenceSet;
use Illuminate\Support\Carbon;

/**
 * Order Rush learning analytics: which TKJ sequences students get wrong
 * most, and at which slot (e.g. pin 3 of T568B).
 */
class SequenceAnalytics
{
    /**
     * Per-set totals over the last $days days, hardest (lowest first-try
     * success) first.
     *
     * @return list<array{key: string, category: string, title: string, attempts: int, solved: int, wrong: int, players: int, error_rate: ?float, avg_ms: ?int, slot_errors: list<int>, worst_slot: ?int, labels: list<string>}>
     */
    public function summary(int $days = 30): array
    {
        $since = Carbon::now()->subDays($days);
        $sets = SequenceSet::query()->get()->keyBy('key');
        $rows = SequenceAttempt::query()
            ->where('played_at', '>=', $since)
            ->get(['set_key', 'category', 'user_id', 'attempts', 'solved', 'wrong', 'total_ms', 'slot_errors']);

        return $rows->groupBy('set_key')->map(function ($group, string $key) use ($sets): array {
            $set = $sets->get($key);
            $slots = [];
            foreach ($group as $row) {
                foreach ((array) $row->slot_errors as $index => $count) {
                    $slots[$index] = ($slots[$index] ?? 0) + (int) $count;
                }
            }
            ksort($slots);
            $slots = array_values($slots);
            $attempts = (int) $group->sum('attempts');
            $solved = (int) $group->sum('solved');
            $worst = $slots !== [] && max($slots) > 0 ? array_search(max($slots), $slots, true) : null;

            return [
                'key' => $key,
                'category' => (string) $group->first()->category,
                'title' => $set?->title_en ?: ($set?->title_id ?? $key),
                'attempts' => $attempts,
                'solved' => $solved,
                'wrong' => (int) $group->sum('wrong'),
                'players' => $group->pluck('user_id')->unique()->count(),
                'error_rate' => $attempts > 0 ? round((int) $group->sum('wrong') / $attempts * 100, 1) : null,
                'avg_ms' => $solved > 0 ? (int) round($group->sum('total_ms') / $solved) : null,
                'slot_errors' => $slots,
                'worst_slot' => $worst === false ? null : $worst,
                'labels' => $set ? array_map(fn (array $item): string => $item['label_en'] ?? $item['label_id'], $set->items) : [],
            ];
        })->sortByDesc(fn (array $row): float => $row['error_rate'] ?? -1)->values()->all();
    }
}
