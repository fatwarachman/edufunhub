<?php

namespace App\Http\Controllers;

use App\Services\LandingStats;
use Illuminate\Http\JsonResponse;

/**
 * Public JSON read by the static landing page (public/new-landing) to show
 * live community numbers and leaderboards.
 */
class LandingStatsController extends Controller
{
    public function __construct(private LandingStats $stats) {}

    public function __invoke(): JsonResponse
    {
        return response()
            ->json($this->stats->snapshot())
            ->header('Cache-Control', 'public, max-age=60');
    }
}
