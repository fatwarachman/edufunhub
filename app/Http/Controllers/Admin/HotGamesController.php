<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\HotGamesRequest;
use App\Services\GameAnalytics;
use App\Services\HotGames;
use Carbon\CarbonImmutable;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Hottest games of a day (today by default): games ranked by plays with
 * their player counts, the previous days' winners, and a drill-down of one
 * game on that day.
 */
class HotGamesController extends Controller
{
    public function __construct(public HotGames $hot, public GameAnalytics $games) {}

    public function index(HotGamesRequest $request): Response
    {
        $day = $request->day($this->hot);
        $ranking = $this->hot->ranking($day);

        return Inertia::render('admin/hot-games/index', [
            ...$this->dayProps($day),
            'ranking' => $ranking,
            'totals' => [
                'plays' => array_sum(array_column($ranking, 'plays')),
                'players' => $this->hot->playersOn($day),
                'games' => count($ranking),
            ],
            'history' => $this->hot->history($day),
        ]);
    }

    public function show(HotGamesRequest $request, string $game): Response
    {
        abort_unless($this->games->gameExists($game), 404);
        $day = $request->day($this->hot);

        return Inertia::render('admin/hot-games/show', [
            ...$this->dayProps($day),
            'game' => $this->games->catalogGames()->firstWhere('key', $game),
            ...$this->hot->detail($day, $game),
        ]);
    }

    /** @return array{date: string, today: string, isToday: bool, previous: string, next: ?string, minDate: string, timezone: string} */
    private function dayProps(CarbonImmutable $day): array
    {
        $today = $this->hot->today();

        return [
            'date' => $day->toDateString(),
            'today' => $today->toDateString(),
            'isToday' => $day->equalTo($today),
            'previous' => $day->subDay()->toDateString(),
            'next' => $day->lessThan($today) ? $day->addDay()->toDateString() : null,
            'minDate' => $today->subDays(HotGames::MAX_DAYS_BACK)->toDateString(),
            'timezone' => $this->hot->timezone(),
        ];
    }
}
