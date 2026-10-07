<?php

namespace App\Http\Controllers;

use App\Services\PlayerPortal;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public game list (guests too). Games come from the shared `gameMenu` prop;
 * this adds cached, anonymous popularity counts per game.
 */
class GameListController extends Controller
{
    public function __construct(public PlayerPortal $portal) {}

    public function __invoke(): Response
    {
        return Inertia::render('games/index', [
            'popularity' => $this->portal->cachedPopularity(),
            'popularityDays' => PlayerPortal::POPULARITY_DAYS,
        ]);
    }
}
