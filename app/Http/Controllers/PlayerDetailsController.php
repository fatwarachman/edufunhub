<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdatePlayerDetailsRequest;
use Illuminate\Http\RedirectResponse;

class PlayerDetailsController extends Controller
{
    public function update(UpdatePlayerDetailsRequest $request): RedirectResponse
    {
        $request->user()->playerProfile()->updateOrCreate([], $request->safe()->only(['birth_date', 'school_name', 'school_city']));

        return back();
    }
}
