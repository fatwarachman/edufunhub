<?php

namespace App\Http\Controllers;

use App\Models\GameHistory;
use App\Models\User;
use App\Services\CharacterShop;
use App\Services\FriendService;
use App\Services\PlayerBadges;
use App\Services\PlayerPortal;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public player page opened from a leaderboard name: who the player is
 * (nickname, grade, school, age), their badges, general stats and the
 * viewer's friendship status. Never shows the email or other account data.
 */
class PlayerPageController extends Controller
{
    public function __invoke(Request $request, User $user, PlayerPortal $portal, PlayerBadges $badges, FriendService $friends, CharacterShop $shop): Response
    {
        $profile = $user->playerProfile()->first();
        abort_if($profile === null || $user->disabled_at !== null, 404);

        $viewer = $request->user();
        $points = $portal->totalPoints($user);
        $relation = $friends->relationsFor($viewer, [$user->id])[$user->id] ?? null;
        $topGames = GameHistory::query()
            ->where('user_id', $user->id)
            ->selectRaw('game_key, MAX(game_name) as game_name, COUNT(*) as plays')
            ->groupBy('game_key')
            ->orderByDesc('plays')
            ->orderBy('game_key')
            ->limit(3)
            ->get();
        $catalog = collect($portal->menu())
            ->flatMap(fn (array $category): array => $category['games'])
            ->keyBy('key');

        return Inertia::render('players/show', [
            'player' => [
                'id' => $user->id,
                'name' => $profile->nickname ?: $user->name,
                'grade' => $profile->grade,
                'age' => $profile->age,
                'school_name' => $profile->school_name,
                'school_city' => $profile->school_city,
                'character' => $shop->looks([$profile])[$user->id] ?? null,
                'joined_at' => $user->created_at?->toIso8601String(),
                'last_seen_at' => $user->last_seen_at?->toIso8601String(),
            ],
            'stats' => [
                'points' => $points,
                'level' => $portal->progress($points)['level'],
                'rank' => $portal->rankOf($user, $points),
                'games' => $user->gameHistories()->count(),
            ],
            'badges' => $badges->earnedFor([$user->id])[$user->id] ?? [],
            'topGames' => $topGames->map(fn (GameHistory $game): array => [
                'key' => $game->game_key,
                'name' => $game->game_name,
                'titleKey' => $catalog[$game->game_key]['titleKey'] ?? null,
                'icon' => $catalog[$game->game_key]['icon'] ?? null,
                'accent' => $catalog[$game->game_key]['accent'] ?? null,
                'plays' => (int) $game->getAttribute('plays'),
            ])->all(),
            'isMe' => $viewer->is($user),
            'relation' => $viewer->is($user) ? 'self' : ($relation['relation'] ?? 'none'),
            'friendshipId' => $relation['friendship_id'] ?? null,
        ]);
    }
}
