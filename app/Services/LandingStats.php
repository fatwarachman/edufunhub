<?php

namespace App\Services;

use App\Models\CharacterItem;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\Question;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Public, cached numbers for the static landing page: community totals,
 * player and school leaderboards. Only public-safe fields leave this class
 * (nickname or first name, school, grade, points); staff accounts
 * (superadmins, admin roles) and disabled or deleted users are excluded.
 *
 * Freshness: the snapshot lives CACHE_SECONDS (60 s) and the landing pages
 * refetch every 60 s while visible, so a figure is at most ~2 minutes old.
 * A short TTL is used instead of busting on every write: game results land
 * many times per second at peak and would otherwise rebuild the aggregates
 * on nearly every landing request.
 */
class LandingStats
{
    public const CACHE_KEY = 'landing.stats';

    public const CACHE_SECONDS = 60;

    public const SHOP_FEATURED_LIMIT = 4;

    public const LEADERBOARD_LIMIT = 10;

    public const SCHOOL_LIMIT = 5;

    /** Global roles whose holders run the platform and never appear in public rankings. */
    public const STAFF_ROLES = ['admin', 'super-admin'];

    /**
     * @return array{
     *     stats: array{players: int, schools: int, games: int, categories: int, plays: int, answers: int, questions: int, teachers: int, teacherQuestions: int, shopItems: int},
     *     catalog: list<array{key: string, url: string, category: string, minPlayers: int, maxPlayers: int}>,
     *     shop: list<array{name: string, slot: string, price: int}>,
     *     leaderboards: array{week: list<array{rank: int, name: string, school: ?string, grade: ?int, points: int}>, all: list<array{rank: int, name: string, school: ?string, grade: ?int, points: int}>},
     *     podium: list<array{rank: int, name: string, school: ?string, grade: ?int, points: int}>,
     *     schools: list<array{rank: int, name: string, players: int, points: int}>,
     *     playsByGame: array<string, int>,
     *     generatedAt: string
     * }
     */
    public function snapshot(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_SECONDS, fn (): array => $this->build());
    }

    /**
     * @return array<string, mixed>
     */
    private function build(): array
    {
        $allTime = $this->leaderboard(null);
        $catalog = $this->catalog();

        return [
            'stats' => [
                'players' => $this->eligibleUsers()->count(),
                'schools' => $this->schoolCount(),
                'games' => count($catalog),
                'categories' => collect($catalog)->pluck('category')->unique()->count(),
                'plays' => $this->histories()->count(),
                'answers' => (int) $this->histories()->selectRaw('COALESCE(SUM(correct), 0) + COALESCE(SUM(wrong), 0) as answers')->value('answers'),
                'questions' => Question::query()->active()->count(),
                'teachers' => $this->eligibleUsers()->whereHas('roles', fn (Builder $query) => $query->where('slug', Role::TEACHER))->count(),
                'teacherQuestions' => Question::query()->active()->whereIn('source', Question::TEACHER_SOURCES)->count(),
                'shopItems' => CharacterItem::query()->active()->where('price', '>', 0)->count(),
            ],
            'catalog' => $catalog,
            'shop' => $this->featuredShopItems(),
            'leaderboards' => [
                'week' => $this->leaderboard(7),
                'all' => $allTime,
            ],
            'podium' => array_slice($allTime, 0, 3),
            'schools' => $this->topSchools(),
            'playsByGame' => $this->histories()
                ->selectRaw('game_key, COUNT(*) as plays')
                ->groupBy('game_key')
                ->pluck('plays', 'game_key')
                ->map(fn (mixed $count): int => (int) $count)
                ->all(),
            'generatedAt' => now()->toIso8601String(),
        ];
    }

    /**
     * Playable games straight from config/game-catalog.php, in catalog order.
     *
     * @return list<array{key: string, url: string, category: string, minPlayers: int, maxPlayers: int}>
     */
    private function catalog(): array
    {
        return collect(config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => collect($category['games'])->map(fn (array $game): array => [
                'key' => (string) $game['key'],
                'url' => route($game['route'], absolute: false),
                'category' => (string) $category['key'],
                'minPlayers' => (int) ($game['min_players'] ?? 1),
                'maxPlayers' => (int) ($game['max_players'] ?? 1),
            ])->all())
            ->values()
            ->all();
    }

    /**
     * Most valuable active items of the character shop (name, slot, price only).
     *
     * @return list<array{name: string, slot: string, price: int}>
     */
    private function featuredShopItems(): array
    {
        return CharacterItem::query()
            ->active()
            ->where('price', '>', 0)
            ->orderByDesc('price')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->limit(self::SHOP_FEATURED_LIMIT)
            ->get(['name_id', 'slot', 'price'])
            ->map(fn (CharacterItem $item): array => [
                'name' => Str::limit(Str::squish($item->name_id), 40, ''),
                'slot' => $item->slot,
                'price' => $item->price,
            ])
            ->values()
            ->all();
    }

    /** @return Builder<User> */
    private function eligibleUsers(): Builder
    {
        return User::query()
            ->where('is_superadmin', false)
            ->whereNull('disabled_at')
            ->whereDoesntHave('roles', fn (Builder $query) => $query->whereIn('slug', self::STAFF_ROLES));
    }

    /** @return Builder<GameHistory> */
    private function histories(): Builder
    {
        return GameHistory::query()->whereIn('user_id', $this->eligibleUsers()->select('id'));
    }

    /** Distinct schools, ignoring case and surrounding whitespace. */
    private function schoolCount(): int
    {
        return (int) PlayerProfile::query()
            ->whereIn('user_id', $this->eligibleUsers()->select('id'))
            ->whereNotNull('school_name')
            ->where('school_name', '!=', '')
            ->selectRaw('COUNT(DISTINCT LOWER(TRIM(school_name))) as schools')
            ->value('schools');
    }

    /**
     * Top players by points earned, optionally within the last N days (same rule as the player portal).
     *
     * @return list<array{rank: int, name: string, school: ?string, grade: ?int, points: int}>
     */
    private function leaderboard(?int $days): array
    {
        $window = function ($query) use ($days): void {
            $query->when($days !== null, fn ($query) => $query->where('created_at', '>=', now()->subDays($days)));
        };

        /** @var Collection<int, User> $users */
        $users = $this->eligibleUsers()
            ->whereIn('id', PointLedger::query()
                ->select('user_id')
                ->when($days !== null, fn ($query) => $query->where('created_at', '>=', now()->subDays($days)))
                ->groupBy('user_id')
                ->havingRaw('SUM(points) > 0'))
            ->withSum(['pointLedgers as total_points' => $window], 'points')
            ->with('playerProfile:id,user_id,nickname,school_name,grade')
            ->orderByDesc('total_points')
            ->orderBy('id')
            ->limit(self::LEADERBOARD_LIMIT)
            ->get(['id', 'name']);

        return $users->values()->map(fn (User $user, int $index): array => [
            'rank' => $index + 1,
            'name' => $this->publicName($user),
            'school' => filled($user->playerProfile?->school_name) ? Str::squish($user->playerProfile->school_name) : null,
            'grade' => $user->playerProfile?->grade,
            'points' => (int) $user->total_points,
        ])->all();
    }

    /**
     * Schools ranked by the points their players earned.
     *
     * @return list<array{rank: int, name: string, players: int, points: int}>
     */
    private function topSchools(): array
    {
        return PointLedger::query()
            ->join('player_profiles', 'player_profiles.user_id', '=', 'point_ledgers.user_id')
            ->whereIn('point_ledgers.user_id', $this->eligibleUsers()->select('id'))
            ->where('point_ledgers.points', '>', 0)
            ->whereNotNull('player_profiles.school_name')
            ->where('player_profiles.school_name', '!=', '')
            ->selectRaw('LOWER(TRIM(player_profiles.school_name)) as school_key, MAX(player_profiles.school_name) as school_name')
            ->selectRaw('COUNT(DISTINCT point_ledgers.user_id) as players, SUM(point_ledgers.points) as points')
            ->groupByRaw('LOWER(TRIM(player_profiles.school_name))')
            ->orderByDesc('points')
            ->orderBy('school_key')
            ->limit(self::SCHOOL_LIMIT)
            ->get()
            ->values()
            ->map(fn ($row, int $index): array => [
                'rank' => $index + 1,
                'name' => Str::squish((string) $row->school_name),
                'players' => (int) $row->players,
                'points' => (int) $row->points,
            ])->all();
    }

    /** Nickname, or only the first word of the account name; never the full name or email. */
    private function publicName(User $user): string
    {
        $nickname = $user->playerProfile?->nickname;

        if (filled($nickname)) {
            return Str::limit(Str::squish($nickname), 24, '');
        }

        return Str::limit((string) Str::of((string) $user->name)->squish()->before(' '), 24, '') ?: 'Pemain';
    }
}
