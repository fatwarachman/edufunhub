<?php

namespace App\Http\Controllers;

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Services\CharacterShop;
use App\Services\PlayerPortal;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserDashboardController extends Controller
{
    public function __invoke(Request $request, PlayerPortal $portal, CharacterShop $shop): Response
    {
        $user = $request->user();
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;
        $points = $portal->totalPoints($user);
        $history = $user->gameHistories()->orderByDesc('played_at')->orderByDesc('id')->paginate(10);

        return Inertia::render('user/dashboard', [
            'points' => $points,
            'balance' => $portal->balance($user),
            'character' => $profile->character(),
            'vault' => $shop->vault($user, $user->locale === 'en' ? 'en' : 'id'),
            'grade' => $profile->grade,
            'playerDetails' => [
                'birth_date' => $profile->birth_date?->toDateString(),
                'school_name' => $profile->school_name,
            ],
            'categories' => $portal->catalog($profile->grade),
            'progress' => $portal->progress($points),
            'history' => $history->getCollection()->map(fn (GameHistory $game): array => [
                'id' => $game->id,
                'game_name' => $game->game_name,
                'points' => $game->points,
                'played_at' => $game->played_at->toIso8601String(),
            ])->all(),
            'historyPagination' => [
                'current_page' => $history->currentPage(),
                'last_page' => $history->lastPage(),
                'total' => $history->total(),
                'prev_page_url' => $history->previousPageUrl(),
                'next_page_url' => $history->nextPageUrl(),
            ],
        ]);
    }
}
