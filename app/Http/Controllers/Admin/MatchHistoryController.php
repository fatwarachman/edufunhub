<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\GameMatch;
use App\Services\MatchHistory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every recorded room and duel match, filterable by game, mode and player.
 */
class MatchHistoryController extends Controller
{
    public function index(Request $request, MatchHistory $history): Response
    {
        $filters = $request->only(['game', 'mode', 'search']);
        $games = GameMatch::query()->distinct()->orderBy('game_key')->pluck('game_key');

        $matches = GameMatch::query()
            ->with(['players' => fn ($q) => $q->with('user:id,name')])
            ->when($games->contains($filters['game'] ?? null), fn (Builder $q) => $q->where('game_key', $filters['game']))
            ->when(in_array($filters['mode'] ?? null, GameMatch::MODES, true), fn (Builder $q) => $q->where('mode', $filters['mode']))
            ->when($filters['search'] ?? null, fn (Builder $q, string $search) => $q->where(fn (Builder $q) => $q
                ->where('pin', $search)
                ->orWhereHas('players', fn (Builder $p) => $p->where('name', 'like', '%'.addcslashes($search, '%_\\').'%'))))
            ->latest('ended_at')
            ->latest('id')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (GameMatch $match): array => $history->present($match));

        return Inertia::render('admin/matches/index', [
            'matches' => $matches,
            'filters' => (object) $filters,
            'games' => $games,
            'modes' => GameMatch::MODES,
            'summary' => [
                'matches' => GameMatch::query()->count(),
                'multiplayer' => GameMatch::query()->where('players_count', '>', 1)->count(),
                'rooms' => GameMatch::query()->whereNotNull('pin')->count(),
                'today' => GameMatch::query()->where('ended_at', '>=', now()->startOfDay())->count(),
            ],
        ]);
    }
}
