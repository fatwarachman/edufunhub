<?php

namespace App\Services;

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\Question;
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
 */
class LandingStats
{
    public const CACHE_KEY = 'landing.stats';

    public const CACHE_SECONDS = 300;

    public const LEADERBOARD_LIMIT = 10;

    public const SCHOOL_LIMIT = 5;

    /** Global roles whose holders run the platform and never appear in public rankings. */
    public const STAFF_ROLES = ['admin', 'super-admin'];

    /**
     * @return array{
     *     stats: array{players: int, schools: int, games: int, plays: int, answers: int, questions: int},
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

        return [
            'stats' => [
                'players' => $this->eligibleUsers()->count(),
                'schools' => $this->schoolCount(),
                'games' => app(GameAnalytics::class)->catalogGames()->count(),
                'plays' => $this->histories()->count(),
                'answers' => (int) $this->histories()->selectRaw('COALESCE(SUM(correct), 0) + COALESCE(SUM(wrong), 0) as answers')->value('answers'),
                'questions' => Question::query()->active()->count(),
            ],
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
