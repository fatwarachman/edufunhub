<?php

namespace App\Http\Controllers;

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Services\CharacterShop;
use App\Services\PlayerAbility;
use App\Services\PlayerBadges;
use App\Services\PlayerDashboardStats;
use App\Services\PlayerPortal;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserDashboardController extends Controller
{
    public function __invoke(Request $request, PlayerPortal $portal, CharacterShop $shop, PlayerBadges $badges, PlayerDashboardStats $stats, PlayerAbility $abilities): Response
    {
        $user = $request->user();
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;
        $points = $portal->totalPoints($user);
        $history = $user->gameHistories()->orderByDesc('played_at')->orderByDesc('id')->paginate(10);

        return Inertia::render('user/dashboard', [
            'points' => $points,
            'character' => $profile->character(),
            'vault' => $shop->vault($user, $user->locale === 'en' ? 'en' : 'id'),
            'grade' => $profile->grade,
            'questionLevel' => Question::normalizeLevel($profile->question_level),
            'playerDetails' => [
                'birth_date' => $profile->birth_date?->toDateString(),
                'school_name' => $profile->school_name,
                'school_city' => $profile->school_city,
            ],
            'categories' => $portal->catalog($profile->grade),
            'progress' => $portal->progress($points),
            'rank' => $portal->rankOf($user, $points),
            'badges' => $badges->summary($user),
            'history' => $history->getCollection()->map(fn (GameHistory $game): array => [
                'id' => $game->id,
                'game_key' => $game->game_key,
                'game_name' => $game->game_name,
                'points' => $game->points,
                'correct' => $game->correct,
                'wrong' => $game->wrong,
                'duration_seconds' => $game->duration_seconds,
                'played_at' => $game->played_at->toIso8601String(),
            ])->all(),
            'historyPagination' => [
                'current_page' => $history->currentPage(),
                'last_page' => $history->lastPage(),
                'total' => $history->total(),
                'prev_page_url' => $history->previousPageUrl(),
                'next_page_url' => $history->nextPageUrl(),
            ],
            'leaderboards' => Inertia::defer(fn (): array => $portal->leaderboards($user), 'board'),
            'stats' => Inertia::defer(fn (): array => $stats->for($user), 'stats'),
            'ability' => Inertia::defer(fn (): ?array => $abilities->present($abilities->latestFor($user)), 'stats'),
        ]);
    }
}
