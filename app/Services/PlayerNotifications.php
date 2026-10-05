<?php

namespace App\Services;

use App\Models\BroadcastMessage;
use App\Models\Role;
use App\Models\User;
use App\Notifications\PlayerNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Notifications\DatabaseNotification;

/**
 * Player bell: system events (points, level up, shop, teacher role) and
 * manual admin messages, stored as database notifications.
 */
class PlayerNotifications
{
    /** Audiences an admin can target. */
    public const AUDIENCES = ['all', 'players', 'teachers', 'grade'];

    /** Newest notifications shown in the bell. */
    public const FEED_SIZE = 20;

    /** @param  array<string, scalar|null>  $params */
    public function notify(User $user, string $kind, string $key, array $params = [], ?string $url = null): void
    {
        $user->notify(PlayerNotification::system($kind, $key, $params, $url));
    }

    /**
     * Points from a finished game, plus a level-up message when the new total
     * crosses a level boundary.
     */
    public function gameFinished(User $user, string $gameName, int $points, int $totalBefore): void
    {
        if ($points <= 0) {
            return;
        }
        $this->notify($user, 'points', 'player_notifications.points', ['points' => $points, 'game' => $gameName], '/dashboard');

        $perLevel = max(1, (int) config('game-catalog.points_per_level'));
        $levelBefore = intdiv(max(0, $totalBefore), $perLevel) + 1;
        $levelAfter = intdiv(max(0, $totalBefore + $points), $perLevel) + 1;
        if ($levelAfter > $levelBefore) {
            $this->notify($user, 'level', 'player_notifications.level', ['level' => $levelAfter], '/portal');
        }
    }

    /**
     * Send an admin message to an audience. Returns the number of recipients.
     */
    public function broadcast(BroadcastMessage $message, string $audience, ?int $grade = null): int
    {
        $count = 0;
        $this->audience($audience, $grade)->chunkById(200, function ($users) use ($message, &$count): void {
            foreach ($users as $user) {
                $user->notify(PlayerNotification::fromBroadcast($message));
                $count++;
            }
        });

        return $count;
    }

    /** @return Builder<User> */
    public function audience(string $audience, ?int $grade = null): Builder
    {
        $query = User::query()->whereNull('disabled_at');

        return match ($audience) {
            'players' => $query->whereHas('playerProfile'),
            'teachers' => $query->whereHas('roles', fn (Builder $role) => $role->where('slug', Role::TEACHER)),
            'grade' => $query->whereHas('playerProfile', fn (Builder $profile) => $profile->where('grade', $grade)),
            default => $query,
        };
    }

    /**
     * @return array{unread: int, items: list<array{id: string, kind: string, title: string, body: string, url: ?string, read: bool, created_at: ?string}>}
     */
    public function feed(User $user): array
    {
        $locale = $user->locale === 'en' ? 'en' : 'id';

        return [
            'unread' => $this->unreadCount($user),
            'items' => $user->notifications()
                ->where('type', 'player')
                ->latest()
                ->limit(self::FEED_SIZE)
                ->get()
                ->map(fn (DatabaseNotification $notification): array => $this->present($notification, $locale))
                ->all(),
        ];
    }

    public function unreadCount(User $user): int
    {
        return $user->unreadNotifications()->where('type', 'player')->count();
    }

    /**
     * @return array{id: string, kind: string, title: string, body: string, url: ?string, read: bool, count: int, created_at: ?string}
     */
    public function present(DatabaseNotification $notification, string $locale): array
    {
        $data = $notification->data;
        $kind = in_array($data['kind'] ?? null, PlayerNotification::KINDS, true) ? $data['kind'] : 'admin';
        $params = is_array($data['params'] ?? null) ? $data['params'] : [];

        if (isset($data['key']) && is_string($data['key'])) {
            $title = __($data['key'].'.title', $params, $locale);
            $body = __($data['key'].'.body', $params, $locale);
        } else {
            $title = (string) ($data['title'] ?? '');
            $body = (string) ($data['body'] ?? '');
        }

        $url = $data['url'] ?? null;

        return [
            'id' => $notification->id,
            'kind' => $kind,
            'title' => $title,
            'body' => $body,
            'url' => is_string($url) && $this->isSafeUrl($url) ? $url : null,
            'read' => $notification->read_at !== null,
            'count' => max(1, (int) ($data['count'] ?? 1)),
            'created_at' => $notification->created_at?->toIso8601String(),
        ];
    }

    /** Links stay on this site or use https, never javascript: or data: URLs. */
    public function isSafeUrl(string $url): bool
    {
        return str_starts_with($url, '/') && ! str_starts_with($url, '//')
            || str_starts_with($url, 'https://');
    }
}
