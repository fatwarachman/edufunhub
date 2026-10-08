<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdatePlayerDetailsRequest;
use App\Models\School;
use Illuminate\Http\RedirectResponse;

class PlayerDetailsController extends Controller
{
    public function update(UpdatePlayerDetailsRequest $request): RedirectResponse
    {
        $details = $request->safe()->only(['birth_date', 'school_name', 'school_city', 'school_level', 'school_npsn']);

        $request->user()->playerProfile()->updateOrCreate([], School::officialDetails($details));

        return back();
    }
}
