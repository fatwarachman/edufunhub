<?php

namespace App\Http\Controllers;

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserDashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();
        $history = $user->gameHistories()->orderByDesc('played_at')->orderByDesc('id')->paginate(10);

        return Inertia::render('user/dashboard', [
            'points' => (int) $user->pointLedgers()->sum('points'),
            'character' => ($user->playerProfile()->first() ?? new PlayerProfile)->character(),
            'categories' => collect(config('game-catalog.categories'))->map(fn (array $category): array => [
                'key' => $category['key'],
                'titleKey' => $category['titleKey'],
                'games' => collect($category['games'])->map(fn (array $game): array => [
                    'key' => $game['key'],
                    'titleKey' => $game['titleKey'],
                    'url' => route($game['route'], absolute: false),
                ])->all(),
            ])->all(),
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
