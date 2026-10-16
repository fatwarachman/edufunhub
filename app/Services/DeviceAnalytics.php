<?php

namespace App\Services;

use App\Models\GameAccess;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Device, operating system and browser mix of game page opens.
 */
class DeviceAnalytics
{
    public const DAYS = 30;

    /** @return array<string, mixed> */
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
            'os' => $window()->selectRaw($this->splitColumns().', os, COUNT(*) as accesses, COUNT(DISTINCT user_id) as users')
                ->groupBy('os')->orderByDesc('accesses')->get()
                ->map(fn (GameAccess $row): array => ['name' => $row->os, 'accesses' => (int) $row->accesses, 'users' => (int) $row->users, ...$this->split($row)])->all(),
            'browsers' => $window()->selectRaw('browser, COUNT(*) as accesses')
                ->groupBy('browser')->orderByDesc('accesses')->limit(6)->get()
                ->map(fn (GameAccess $row): array => ['name' => $row->browser, 'accesses' => (int) $row->accesses])->all(),
            'games' => $window()->selectRaw($this->splitColumns().', game_key, COUNT(*) as accesses')
                ->groupBy('game_key')->orderByDesc('accesses')->get()
                ->map(fn (GameAccess $row): array => ['game' => $row->game_key, ...$this->split($row)])->all(),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(int $days, ?string $os, ?string $device, ?string $role, int $page = 1): array
    {
        $since = now()->subDays($days);
        $filtered = fn (): Builder => GameAccess::query()
            ->where('accessed_at', '>=', $since)
            ->when($os, fn (Builder $query) => $query->where('os', $os))
            ->when($device, fn (Builder $query) => $query->where('device_type', $device));

        $usersQuery = User::query()
            ->with('roles:id,name,slug')
            ->withCount(['gameAccesses as device_accesses_count' => function (Builder $query) use ($since, $os, $device): void {
                $query->where('accessed_at', '>=', $since)->when($os, fn (Builder $q) => $q->where('os', $os))->when($device, fn (Builder $q) => $q->where('device_type', $device));
            }])
            ->whereHas('gameAccesses', function (Builder $query) use ($since, $os, $device): void {
                $query->where('accessed_at', '>=', $since)->when($os, fn (Builder $q) => $q->where('os', $os))->when($device, fn (Builder $q) => $q->where('device_type', $device));
            })
            ->when($role, fn (Builder $query) => $query->whereHas('roles', fn (Builder $roles) => $roles->where('slug', $role)))
            ->orderByDesc('device_accesses_count')->orderBy('name');

        $users = $usersQuery->paginate(20, ['id', 'name', 'email', 'avatar_url'], 'users_page')->withQueryString();
        $userIds = $users->getCollection()->pluck('id');
        $latest = $filtered()->whereIn('user_id', $userIds)->latest('accessed_at')->get(['user_id', 'os', 'device_type', 'browser', 'accessed_at'])->groupBy('user_id');
        $users->getCollection()->transform(fn (User $user): array => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'avatar_url' => $user->avatar_url,
            'accesses' => (int) $user->device_accesses_count,
            'roles' => $user->roles->pluck('name')->values()->all(),
            'latest' => $latest->get($user->id)?->first()?->only(['os', 'device_type', 'browser', 'accessed_at']),
        ]);

        return [
            'days' => $days,
            'filters' => ['os' => $os, 'device' => $device, 'role' => $role],
            'options' => [
                'os' => GameAccess::query()->where('accessed_at', '>=', $since)->select('os')->distinct()->orderBy('os')->pluck('os')->values()->all(),
                'roles' => Role::query()->orderBy('name')->get(['name', 'slug'])->map(fn ($item): array => $item->only(['name', 'slug']))->all(),
            ],
            'charts' => [
                'daily' => $filtered()->selectRaw('DATE(accessed_at) as date, COUNT(*) as accesses, COUNT(DISTINCT user_id) as users')->groupBy('date')->orderBy('date')->get()->map(fn ($row): array => ['date' => $row->date, 'accesses' => (int) $row->accesses, 'users' => (int) $row->users])->all(),
                'os' => $filtered()->selectRaw('os, COUNT(*) as accesses, COUNT(DISTINCT user_id) as users')->groupBy('os')->orderByDesc('accesses')->get()->map(fn ($row): array => ['name' => $row->os, 'accesses' => (int) $row->accesses, 'users' => (int) $row->users])->all(),
                'devices' => $filtered()->selectRaw('device_type, COUNT(*) as accesses, COUNT(DISTINCT user_id) as users')->groupBy('device_type')->orderByDesc('accesses')->get()->map(fn ($row): array => ['name' => $row->device_type, 'accesses' => (int) $row->accesses, 'users' => (int) $row->users])->all(),
                'browsers' => $filtered()->selectRaw('browser, COUNT(*) as accesses')->groupBy('browser')->orderByDesc('accesses')->limit(8)->get()->map(fn ($row): array => ['name' => (string) $row->browser, 'accesses' => (int) $row->accesses])->all(),
            ],
            'totals' => [
                'accesses' => $filtered()->count(),
                'users' => (int) $filtered()->whereNotNull('user_id')->distinct()->count('user_id'),
            ],
            'users' => $users,
        ];
    }

    /** @return list<array<string, mixed>> */
    public function gameBreakdown(int $days = self::DAYS): array
    {
        $since = now()->subDays($days);
        $window = fn (): Builder => GameAccess::query()->where('accessed_at', '>=', $since);
        $browsers = $window()->selectRaw('game_key, browser, COUNT(*) as accesses')->groupBy('game_key', 'browser')->get()
            ->map(fn (GameAccess $row): array => ['game' => (string) $row->game_key, 'name' => (string) $row->browser, 'accesses' => (int) $row->accesses])
            ->groupBy('game')->map(fn (Collection $rows): array => $rows->sortBy([['accesses', 'desc'], ['name', 'asc']])->map(fn (array $row): array => ['name' => $row['name'], 'accesses' => $row['accesses']])->values()->all());

        return $window()->selectRaw($this->splitColumns().', game_key, COUNT(*) as accesses, COUNT(DISTINCT user_id) as users')->groupBy('game_key')->orderByDesc('accesses')->orderBy('game_key')->get()
            ->map(fn (GameAccess $row): array => ['game' => $row->game_key, 'accesses' => (int) $row->accesses, 'users' => (int) $row->users, ...$this->split($row), 'browsers' => $browsers->get($row->game_key, [])])->values()->all();
    }

    private function splitColumns(): string
    {
        return collect(DeviceDetector::TYPES)->map(fn (string $type): string => "SUM(CASE WHEN device_type = '{$type}' THEN 1 ELSE 0 END) as {$type}")->implode(', ');
    }

    /** @return array{mobile: int, tablet: int, desktop: int} */
    private function split(GameAccess $row): array
    {
        return ['mobile' => (int) $row->getAttribute('mobile'), 'tablet' => (int) $row->getAttribute('tablet'), 'desktop' => (int) $row->getAttribute('desktop')];
    }
}
