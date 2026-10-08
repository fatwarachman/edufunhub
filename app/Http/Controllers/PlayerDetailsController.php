<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdatePlayerDetailsRequest;
use App\Models\School;
use App\Services\GameReturnUrl;
use Illuminate\Http\RedirectResponse;

class PlayerDetailsController extends Controller
{
    public function update(UpdatePlayerDetailsRequest $request, GameReturnUrl $returnUrl): RedirectResponse
    {
        $details = $request->safe()->only(['birth_date', 'school_name', 'school_city', 'school_level', 'school_npsn']);

        $request->user()->playerProfile()->updateOrCreate([], School::officialDetails($details));

        $gamePath = $request->user()->fresh()->hasCompletePlayerDetails() ? $returnUrl->pull($request) : null;

        return $gamePath !== null ? redirect($gamePath) : back();
    }
}
