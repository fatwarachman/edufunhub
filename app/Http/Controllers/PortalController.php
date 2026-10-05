<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Services\PlayerPortal;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PortalController extends Controller
{
    public function __construct(public PlayerPortal $portal) {}

    public function __invoke(Request $request): Response
    {
        $user = $request->user();
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;
        $points = $this->portal->totalPoints($user);

        return Inertia::render('portal/index', [
            'player' => [
                'name' => $profile->nickname ?: $user->name,
                'grade' => $profile->grade,
                'character' => $profile->character(),
                'detailsComplete' => $profile->birth_date !== null && filled($profile->school_name),
            ],
            'detailsRequiredNotice' => $request->session()->get('player_details_required') !== null,
            'progress' => $this->portal->progress($points),
            'rank' => $this->portal->rankOf($user, $points),
            'categories' => $this->portal->catalog($profile->grade, $this->portal->popularity()),
            'popularityDays' => PlayerPortal::POPULARITY_DAYS,
            'leaderboards' => $this->portal->leaderboards($user),
            'recent' => $this->portal->recentResults($user),
        ]);
    }
}
