<?php

namespace App\Services;

use App\Models\GameAccess;
use Illuminate\Database\Eloquent\Builder;

/**
 * Device, operating system and browser mix of game page opens.
 */
class DeviceAnalytics
{
    public const DAYS = 30;

    /**
     * @return array{
     *     days: int,
     *     total: int,
     *     users: int,
     *     guests: int,
     *     types: list<array{key: string, accesses: int, users: int}>,
     *     os: list<array{name: string, accesses: int, users: int, mobile: int, tablet: int, desktop: int}>,
     *     browsers: list<array{name: string, accesses: int}>,
     *     games: list<array{game: string, mobile: int, tablet: int, desktop: int}>
     * }
     */
    public function summary(int $days = self::DAYS): array
    {
        $since = now()->subDays($days);
        $window = fn (): Builder => GameAccess::query()->where('accessed_at', '>=', $since);

        $types = $window()->selectRaw('device_type, COUNT(*) as accesses, COUNT(DISTINCT user_id) as users')
            ->groupBy('device_type')->get()->keyBy('device_type');

        return [
            'days' => $days,
            'total' => $window()->count(),
            'users' => (int) $window()->distinct()->count('user_id'),
            'guests' => $window()->whereNull('user_id')->count(),
            'types' => collect(DeviceDetector::TYPES)->map(fn (string $type): array => [
                'key' => $type,
                'accesses' => (int) ($types->get($type)?->accesses ?? 0),
                'users' => (int) ($types->get($type)?->users ?? 0),
            ])->all(),
            'os' => $window()
                ->selectRaw($this->splitColumns().', os, COUNT(*) as accesses, COUNT(DISTINCT user_id) as users')
                ->groupBy('os')->orderByDesc('accesses')->get()
                ->map(fn (GameAccess $row): array => [
                    'name' => $row->os,
                    'accesses' => (int) $row->accesses,
                    'users' => (int) $row->users,
                    ...$this->split($row),
                ])->all(),
            'browsers' => $window()->selectRaw('browser, COUNT(*) as accesses')
                ->groupBy('browser')->orderByDesc('accesses')->limit(6)->get()
                ->map(fn (GameAccess $row): array => ['name' => $row->browser, 'accesses' => (int) $row->accesses])->all(),
            'games' => $window()->selectRaw($this->splitColumns().', game_key, COUNT(*) as accesses')
                ->groupBy('game_key')->orderByDesc('accesses')->get()
                ->map(fn (GameAccess $row): array => ['game' => $row->game_key, ...$this->split($row)])->all(),
        ];
    }

    private function splitColumns(): string
    {
        return collect(DeviceDetector::TYPES)
            ->map(fn (string $type): string => "SUM(CASE WHEN device_type = '{$type}' THEN 1 ELSE 0 END) as {$type}")
            ->implode(', ');
    }

    /** @return array{mobile: int, tablet: int, desktop: int} */
    private function split(GameAccess $row): array
    {
        return [
            'mobile' => (int) $row->getAttribute('mobile'),
            'tablet' => (int) $row->getAttribute('tablet'),
            'desktop' => (int) $row->getAttribute('desktop'),
        ];
    }
}
