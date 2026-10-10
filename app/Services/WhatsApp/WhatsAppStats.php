<?php

namespace App\Services\WhatsApp;

use App\Models\User;
use App\Models\WhatsAppMessage;
use Carbon\CarbonImmutable;

/**
 * Numbers for the WhatsApp admin cards: last 7 days per status with a daily
 * series for the sparklines, the change against the 7 days before, the
 * queue right now and how many players can receive messages.
 */
class WhatsAppStats
{
    public const DAYS = 7;

    /**
     * @return array{
     *     recipients: int,
     *     opted_out: int,
     *     queued: int,
     *     oldest_queued_at: ?string,
     *     sent: int,
     *     failed: int,
     *     sent_delta: ?int,
     *     failed_delta: ?int,
     *     success_rate: ?float,
     *     skipped: int,
     *     daily: list<array{date: string, sent: int, failed: int}>
     * }
     */
    public function summary(): array
    {
        $today = CarbonImmutable::today();
        $start = $today->subDays(self::DAYS - 1);
        $previousStart = $start->subDays(self::DAYS);

        $rows = WhatsAppMessage::query()
            ->where('created_at', '>=', $previousStart)
            ->whereIn('status', [WhatsAppMessage::SENT, WhatsAppMessage::FAILED])
            ->selectRaw('DATE(created_at) as day, status, COUNT(*) as total')
            ->groupBy('day', 'status')
            ->get();

        $count = fn (string $status, CarbonImmutable $from, CarbonImmutable $to): int => (int) $rows
            ->filter(fn ($row): bool => $row->status === $status && $row->day >= $from->toDateString() && $row->day <= $to->toDateString())
            ->sum('total');

        $sent = $count(WhatsAppMessage::SENT, $start, $today);
        $failed = $count(WhatsAppMessage::FAILED, $start, $today);
        $previousEnd = $start->subDay();

        $daily = collect(range(0, self::DAYS - 1))->map(function (int $offset) use ($start, $count): array {
            $day = $start->addDays($offset);

            return [
                'date' => $day->toDateString(),
                'sent' => $count(WhatsAppMessage::SENT, $day, $day),
                'failed' => $count(WhatsAppMessage::FAILED, $day, $day),
            ];
        })->all();

        $withNumber = User::query()->whereNotNull('whatsapp_number')->whereNull('disabled_at');
        $oldestQueued = WhatsAppMessage::query()->where('status', WhatsAppMessage::QUEUED)->min('created_at');

        return [
            'recipients' => (clone $withNumber)->where('whatsapp_notifications', true)->count(),
            'opted_out' => (clone $withNumber)->where('whatsapp_notifications', false)->count(),
            'queued' => WhatsAppMessage::query()->where('status', WhatsAppMessage::QUEUED)->count(),
            'oldest_queued_at' => $oldestQueued !== null ? CarbonImmutable::parse($oldestQueued)->toIso8601String() : null,
            'sent' => $sent,
            'failed' => $failed,
            'sent_delta' => $this->delta($sent, $count(WhatsAppMessage::SENT, $previousStart, $previousEnd)),
            'failed_delta' => $this->delta($failed, $count(WhatsAppMessage::FAILED, $previousStart, $previousEnd)),
            'success_rate' => $sent + $failed > 0 ? round($sent / ($sent + $failed) * 100, 1) : null,
            'skipped' => WhatsAppMessage::query()->where('status', WhatsAppMessage::SKIPPED)->where('created_at', '>=', $start)->count(),
            'daily' => $daily,
        ];
    }

    /** Percentage change, or null when there is nothing to compare with. */
    private function delta(int $current, int $previous): ?int
    {
        return $previous === 0 ? null : (int) round(($current - $previous) / $previous * 100);
    }
}
