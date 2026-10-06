<?php

namespace App\Services;

use App\Models\ScreenTimeDaily;
use App\Models\ScreenTimeSession;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Writes active screen time: one atomic upsert-increment on the daily
 * per-area row, and an extend-or-open on the user's current session.
 */
class ScreenTimeRecorder
{
    public const DAY_SECONDS = 86400;

    /** @return int Seconds actually stored (0 once the day is full). */
    public function record(int $userId, string $area, int $seconds): int
    {
        $now = now();
        $date = $now->copy()->setTimezone((string) config('screen-time.timezone', 'UTC'))->toDateString();

        $used = (int) ScreenTimeDaily::query()->where('user_id', $userId)->whereDate('date', $date)->sum('seconds');
        $seconds = min(max(0, $seconds), 60, max(0, self::DAY_SECONDS - $used));
        if ($seconds === 0) {
            return 0;
        }

        ScreenTimeDaily::query()->upsert(
            [['user_id' => $userId, 'date' => $date, 'area' => $area, 'seconds' => $seconds]],
            ['user_id', 'date', 'area'],
            ['seconds' => DB::raw('seconds + '.$seconds)],
        );

        $this->extendSession($userId, $area, $seconds, $now);

        return $seconds;
    }

    private function extendSession(int $userId, string $area, int $seconds, Carbon $now): void
    {
        $threshold = $now->copy()->subSeconds((int) config('screen-time.session_gap_seconds', 120));

        $openId = ScreenTimeSession::query()
            ->where('user_id', $userId)
            ->where('started_at', '>=', $now->copy()->subDay())
            ->orderByDesc('started_at')
            ->orderByDesc('id')
            ->value('id');

        $extended = $openId !== null && ScreenTimeSession::query()
            ->whereKey($openId)
            ->where('area', $area)
            ->where('ended_at', '>=', $threshold)
            ->update(['ended_at' => $now, 'seconds' => DB::raw('seconds + '.$seconds)]) > 0;

        if (! $extended) {
            ScreenTimeSession::query()->create([
                'user_id' => $userId,
                'area' => $area,
                'started_at' => $now->copy()->subSeconds($seconds),
                'ended_at' => $now,
                'seconds' => $seconds,
            ]);
        }
    }
}
