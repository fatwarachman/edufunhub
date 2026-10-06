<?php

namespace App\Services;

use App\Models\ScreenTimeDaily;
use App\Models\ScreenTimeSession;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Read model for the super admin screen-time page: how long signed-in users
 * keep the app open per day, where (portal, games, chat, ...), when, and who
 * stays over the healthy daily limit.
 *
 * Every aggregate is one grouped query (no per-user loops) and cached for a
 * few minutes per filter set.
 */
class ScreenTimeAnalytics
{
    /** @var list<int> */
    public const RANGES = [7, 30, 90];

    public const PER_PAGE = 20;

    public const CACHE_SECONDS = 300;

    /** @var list<string> */
    public const SORTS = ['avg', 'max', 'over', 'total', 'name', 'last'];

    public function __construct(private GameAnalytics $games) {}

    public function limitSeconds(): int
    {
        return max(1, (int) config('screen-time.daily_limit_minutes', 300)) * 60;
    }

    public function timezone(): string
    {
        return (string) config('screen-time.timezone', 'UTC');
    }

    /** First local date of the range (inclusive). */
    public function fromDate(int $days): string
    {
        return $this->today()->subDays($days - 1)->toDateString();
    }

    public function today(): Carbon
    {
        return now()->setTimezone($this->timezone())->startOfDay();
    }

    /**
     * KPIs, daily trend, area split and hour x weekday heatmap.
     *
     * @return array<string, mixed>
     */
    public function overview(int $days): array
    {
        return Cache::remember($this->cacheKey('overview', [$days]), self::CACHE_SECONDS, fn (): array => [
            'summary' => $this->summary($days),
            'daily' => $this->daily($days),
            'areas' => $this->areas(ScreenTimeDaily::query()->whereDate('date', '>=', $this->fromDate($days))),
            'heatmap' => $this->heatmap($days),
        ]);
    }

    /**
     * Users ranked by daily average with search, sort and pagination.
     *
     * @param  array{days: int, search: ?string, sort: string, direction: string, page: int}  $filters
     * @return array<string, mixed>
     */
    public function users(array $filters): array
    {
        return Cache::remember($this->cacheKey('users', $filters), self::CACHE_SECONDS, function () use ($filters): array {
            $limit = $this->limitSeconds();
            $perUser = DB::query()
                ->fromSub($this->perUserDay($filters['days']), 'user_days')
                ->groupBy('user_id')
                ->select('user_id')
                ->selectRaw('SUM(day_seconds) as total_seconds, COUNT(*) as active_days, MAX(day_seconds) as max_day_seconds')
                ->selectRaw('SUM(CASE WHEN day_seconds >= ? THEN 1 ELSE 0 END) as over_days', [$limit])
                ->selectRaw('MAX(day) as last_day');

            $direction = $filters['direction'] === 'asc' ? 'asc' : 'desc';
            $query = DB::query()
                ->fromSub($perUser, 'stats')
                ->join('users', 'users.id', '=', 'stats.user_id')
                ->leftJoin('player_profiles', 'player_profiles.user_id', '=', 'stats.user_id')
                ->when($filters['search'], function (QueryBuilder $query, string $search): void {
                    $like = '%'.addcslashes($search, '%_\\').'%';
                    $query->where(fn (QueryBuilder $query) => $query
                        ->where('users.name', 'like', $like)
                        ->orWhere('users.email', 'like', $like)
                        ->orWhere('player_profiles.nickname', 'like', $like)
                        ->orWhere('player_profiles.school_name', 'like', $like));
                })
                ->select('stats.*', 'users.name', 'users.email', 'users.last_seen_at', 'player_profiles.nickname', 'player_profiles.grade', 'player_profiles.school_name')
                ->selectRaw('(stats.total_seconds * 1.0) / stats.active_days as avg_seconds');

            match ($filters['sort']) {
                'max' => $query->orderBy('max_day_seconds', $direction),
                'over' => $query->orderBy('over_days', $direction)->orderBy('avg_seconds', $direction),
                'total' => $query->orderBy('total_seconds', $direction),
                'name' => $query->orderBy('users.name', $direction),
                'last' => $query->orderBy('last_day', $direction)->orderBy('users.last_seen_at', $direction),
                default => $query->orderBy('avg_seconds', $direction),
            };
            $query->orderBy('stats.user_id');

            /** @var LengthAwarePaginator $page */
            $page = $query->paginate(self::PER_PAGE, ['*'], 'page', $filters['page']);

            return [
                'data' => collect($page->items())->map(fn (object $row): array => [
                    'user_id' => (int) $row->user_id,
                    'name' => $row->nickname ?: $row->name,
                    'account_name' => $row->name,
                    'grade' => $row->grade !== null ? (int) $row->grade : null,
                    'school_name' => $row->school_name,
                    'total_seconds' => (int) $row->total_seconds,
                    'active_days' => (int) $row->active_days,
                    'avg_seconds' => (int) round((float) $row->avg_seconds),
                    'max_day_seconds' => (int) $row->max_day_seconds,
                    'over_days' => (int) $row->over_days,
                    'last_day' => (string) $row->last_day,
                    'last_seen_at' => $row->last_seen_at ? Carbon::parse($row->last_seen_at)->toIso8601String() : null,
                ])->all(),
                'total' => $page->total(),
                'from' => $page->firstItem(),
                'to' => $page->lastItem(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
            ];
        });
    }

    /**
     * One user's daily bars (with per-category split) and area totals.
     *
     * @return array<string, mixed>|null
     */
    public function forUser(int $userId, int $days): ?array
    {
        $user = User::query()->with('playerProfile:id,user_id,nickname,grade,school_name')->find($userId, ['id', 'name', 'last_seen_at']);
        if ($user === null) {
            return null;
        }

        return Cache::remember($this->cacheKey('user', [$userId, $days]), self::CACHE_SECONDS, function () use ($user, $days): array {
            $from = $this->fromDate($days);
            $rows = ScreenTimeDaily::query()
                ->where('user_id', $user->id)
                ->whereDate('date', '>=', $from)
                ->get(['date', 'area', 'seconds']);
            $byDate = $rows->groupBy(fn (ScreenTimeDaily $row): string => substr((string) $row->date, 0, 10));
            $limit = $this->limitSeconds();

            $daily = collect(range($days - 1, 0))->map(function (int $ago) use ($byDate): array {
                $date = $this->today()->subDays($ago)->toDateString();
                $categories = array_fill_keys(['portal', 'games', 'chat', 'character', 'other'], 0);
                foreach ($byDate->get($date, collect()) as $row) {
                    $categories[$this->category($row->area)] += (int) $row->seconds;
                }

                return ['date' => $date, 'seconds' => array_sum($categories), ...$categories];
            });
            $active = $daily->where('seconds', '>', 0);

            return [
                'user' => [
                    'id' => $user->id,
                    'name' => $user->playerProfile?->nickname ?: $user->name,
                    'account_name' => $user->name,
                    'grade' => $user->playerProfile?->grade,
                    'school_name' => $user->playerProfile?->school_name,
                    'last_seen_at' => $user->last_seen_at?->toIso8601String(),
                ],
                'summary' => [
                    'total_seconds' => (int) $active->sum('seconds'),
                    'active_days' => $active->count(),
                    'avg_seconds' => $active->count() > 0 ? (int) round($active->avg('seconds')) : 0,
                    'max_day_seconds' => (int) ($active->max('seconds') ?? 0),
                    'over_days' => $active->where('seconds', '>=', $limit)->count(),
                ],
                'daily' => $daily->values()->all(),
                'areas' => $this->areas(ScreenTimeDaily::query()->where('user_id', $user->id)->whereDate('date', '>=', $from)),
            ];
        });
    }

    /** Category used for the split: portal, games, chat, character or other. */
    public function category(string $area): string
    {
        if (str_starts_with($area, 'game:') || in_array($area, ['games', 'gamelist', 'play', 'arena'], true)) {
            return 'games';
        }

        return match ($area) {
            'portal', 'dashboard', 'notifications' => 'portal',
            'chat' => 'chat',
            'character', 'vault' => 'character',
            default => 'other',
        };
    }

    /** @return array<string, int|float|null> */
    private function summary(int $days): array
    {
        $limit = $this->limitSeconds();
        $totals = DB::query()
            ->fromSub($this->perUserDay($days), 'user_days')
            ->selectRaw('COUNT(*) as user_days, COUNT(DISTINCT user_id) as users, SUM(day_seconds) as seconds')
            ->selectRaw('COUNT(DISTINCT CASE WHEN day_seconds >= ? THEN user_id END) as over_users', [$limit])
            ->first();

        $today = $this->today()->toDateString();
        $todayTotals = DB::query()
            ->fromSub(ScreenTimeDaily::query()->toBase()->whereDate('date', $today)->groupBy('user_id')->select('user_id')->selectRaw('SUM(seconds) as day_seconds'), 'today')
            ->selectRaw('COUNT(*) as users, SUM(CASE WHEN day_seconds >= ? THEN 1 ELSE 0 END) as over_users', [$limit])
            ->first();

        $userDays = (int) $totals->user_days;

        return [
            'total_seconds' => (int) $totals->seconds,
            'active_users' => (int) $totals->users,
            'user_days' => $userDays,
            'avg_seconds_per_user_day' => $userDays > 0 ? (int) round(((int) $totals->seconds) / $userDays) : null,
            'over_users' => (int) $totals->over_users,
            'today_users' => (int) $todayTotals->users,
            'today_over_users' => (int) $todayTotals->over_users,
            'limit_minutes' => intdiv($limit, 60),
        ];
    }

    /** @return list<array{date: string, seconds: int, users: int, avg_seconds: int, over_users: int}> */
    private function daily(int $days): array
    {
        $rows = DB::query()
            ->fromSub($this->perUserDay($days), 'user_days')
            ->groupBy('day')
            ->select('day')
            ->selectRaw('COUNT(*) as users, SUM(day_seconds) as seconds')
            ->selectRaw('SUM(CASE WHEN day_seconds >= ? THEN 1 ELSE 0 END) as over_users', [$this->limitSeconds()])
            ->get()
            ->keyBy(fn (object $row): string => substr((string) $row->day, 0, 10));

        return collect(range($days - 1, 0))->map(function (int $ago) use ($rows): array {
            $date = $this->today()->subDays($ago)->toDateString();
            $row = $rows->get($date);
            $users = (int) ($row->users ?? 0);
            $seconds = (int) ($row->seconds ?? 0);

            return [
                'date' => $date,
                'seconds' => $seconds,
                'users' => $users,
                'avg_seconds' => $users > 0 ? (int) round($seconds / $users) : 0,
                'over_users' => (int) ($row->over_users ?? 0),
            ];
        })->all();
    }

    /**
     * @param  Builder<ScreenTimeDaily>  $query
     * @return list<array{area: string, category: string, seconds: int, users: int, accent: ?string}>
     */
    private function areas(Builder $query): array
    {
        $accents = $this->games->catalogGames()->pluck('accent', 'key');

        return $query
            ->groupBy('area')
            ->select('area')
            ->selectRaw('SUM(seconds) as total, COUNT(DISTINCT user_id) as users')
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'area' => (string) $row->area,
                'category' => $this->category((string) $row->area),
                'seconds' => (int) $row->total,
                'users' => (int) $row->users,
                'accent' => str_starts_with((string) $row->area, 'game:') ? ($accents->get(substr((string) $row->area, 5)) ?? null) : null,
            ])
            ->sortByDesc('seconds')
            ->values()
            ->all();
    }

    /**
     * Seconds per weekday (0 = Monday) x local hour, from session starts.
     *
     * @return list<array{weekday: int, hour: int, seconds: int}>
     */
    private function heatmap(int $days): array
    {
        $offset = Carbon::now($this->timezone())->getOffset();
        $start = $this->today()->subDays($days - 1)->utc();
        $driver = DB::connection()->getDriverName();

        [$weekday, $hour] = $driver === 'sqlite'
            ? ["CAST(strftime('%w', started_at, '{$offset} seconds') AS INTEGER)", "CAST(strftime('%H', started_at, '{$offset} seconds') AS INTEGER)"]
            : ["DAYOFWEEK(DATE_ADD(started_at, INTERVAL {$offset} SECOND)) - 1", "HOUR(DATE_ADD(started_at, INTERVAL {$offset} SECOND))"];

        return ScreenTimeSession::query()
            ->where('started_at', '>=', $start)
            ->selectRaw("{$weekday} as weekday, {$hour} as hour, SUM(seconds) as total")
            ->groupByRaw("{$weekday}, {$hour}")
            ->toBase()
            ->get()
            ->map(fn (object $row): array => [
                'weekday' => ((int) $row->weekday + 6) % 7,
                'hour' => (int) $row->hour,
                'seconds' => (int) $row->total,
            ])
            ->values()
            ->all();
    }

    /** Seconds per user and local day within the range. */
    private function perUserDay(int $days): QueryBuilder
    {
        return ScreenTimeDaily::query()
            ->toBase()
            ->whereDate('date', '>=', $this->fromDate($days))
            ->groupBy('user_id', 'date')
            ->select('user_id', 'date as day')
            ->selectRaw('SUM(seconds) as day_seconds');
    }

    /** @param  array<int|string, mixed>  $parts */
    private function cacheKey(string $name, array $parts): string
    {
        return 'screen-time:'.$name.':'.md5(json_encode([...$parts, $this->limitSeconds(), $this->today()->toDateString()]));
    }
}
