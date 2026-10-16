<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\PlayerProgressRequest;
use App\Services\PlayerProgressReport;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Learning progress per account: games played, questions answered and
 * whether an AI ability analysis exists.
 */
class PlayerProgressController extends Controller
{
    public function index(PlayerProgressRequest $request, PlayerProgressReport $report): Response
    {
        $filters = $request->filters();

        return Inertia::render('admin/player-progress/index', [
            'filters' => $filters,
            'summary' => $report->summary(),
            'players' => $report->paginate($filters),
        ]);
    }
}
