<?php

namespace App\Services;

use App\Models\GameHistory;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Spatie\Activitylog\Models\Activity;

/**
 * Records what players do in the app (sign in, open and finish games, earn
 * badges) to the activity log under the `player` log name, so the admin
 * activity pages show real user activity next to admin changes.
 */
class UserActivity
{
    public const LOG_NAME = 'player';

    public const LOGIN = 'login';

    public const LOGOUT = 'logout';

    public const GAME_OPENED = 'game_opened';

    public const GAME_FINISHED = 'game_finished';

    public const BADGE_EARNED = 'badge_earned';

    /** Player events, in the order the admin filter lists them. */
    public const EVENTS = [self::LOGIN, self::LOGOUT, self::GAME_OPENED, self::GAME_FINISHED, self::BADGE_EARNED];

    public function __construct(private DeviceDetector $detector) {}

    public function login(User $user, Request $request): void
    {
        $this->log($user, self::LOGIN, 'Logged in', $this->client($request));
    }

    public function logout(User $user, Request $request): void
    {
        $this->log($user, self::LOGOUT, 'Logged out', $this->client($request));
    }

    public function gameOpened(User $user, string $game, string $device): void
    {
        $this->log($user, self::GAME_OPENED, 'Opened game', ['game_key' => $game, 'device' => $device]);
    }

    public function gameFinished(User $user, GameHistory $history): void
    {
        activity(self::LOG_NAME)
            ->causedBy($user)
            ->performedOn($history)
            ->event(self::GAME_FINISHED)
            ->withProperties(self::gameProperties($history))
            ->log('Finished game');
    }

    public function badgeEarned(User $user, string $badge): void
    {
        $this->log($user, self::BADGE_EARNED, 'Earned badge', ['badge' => $badge]);
    }

    /**
     * Properties stored with a finished game.
     *
     * @return array{game_key: string, mission: ?string, points: int, correct: ?int, wrong: ?int}
     */
    public static function gameProperties(GameHistory $history): array
    {
        return [
            'game_key' => $history->game_key,
            'mission' => $history->mission,
            'points' => (int) $history->points,
            'correct' => $history->correct,
            'wrong' => $history->wrong,
        ];
    }

    /**
     * Activity properties the admin panel shows, with the badge name in the
     * current language.
     *
     * @return array<string, mixed>
     */
    public static function displayProperties(Activity $activity): array
    {
        $properties = $activity->properties?->only(['game_key', 'mission', 'points', 'correct', 'wrong', 'badge', 'device', 'ip_address'])->all() ?? [];

        if (isset($properties['badge']) && is_string($properties['badge'])) {
            $name = __('badges.'.$properties['badge'].'.name');
            $properties['badge'] = $name === 'badges.'.$properties['badge'].'.name' ? $properties['badge'] : $name;
        }

        return $properties;
    }

    /**
     * Hide automatic "last seen" heartbeats: they are not something the
     * user did and used to flood the log.
     *
     * @param  Builder<Activity>|QueryBuilder  $query
     */
    public static function withoutHeartbeats(Builder|QueryBuilder $query): void
    {
        $query->where(fn ($q) => $q
            ->where('log_name', '!=', 'user')
            ->orWhereNull('event')
            ->orWhere('event', '!=', 'updated')
            ->orWhere('properties', 'not like', '{"attributes":{"last_seen_at":%'));
    }

    /** @param array<string, mixed> $properties */
    private function log(User $user, string $event, string $description, array $properties): void
    {
        activity(self::LOG_NAME)
            ->causedBy($user)
            ->performedOn($user)
            ->event($event)
            ->withProperties($properties)
            ->log($description);
    }

    /** @return array{ip_address: ?string, device: string} */
    private function client(Request $request): array
    {
        $device = $this->detector->detect($request->userAgent(), $request->header('Sec-CH-UA-Mobile'), $request->header('Sec-CH-UA-Platform'));

        return [
            'ip_address' => $request->ip(),
            'device' => trim(($device['browser'] ?? '').' · '.($device['os'] ?? ''), ' ·'),
        ];
    }
}
