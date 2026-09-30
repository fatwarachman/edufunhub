<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateCharacterRequest;
use App\Models\PlayerProfile;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CharacterController extends Controller
{
    public function show(Request $request): Response
    {
        return Inertia::render('user/character', [
            'character' => ($request->user()->playerProfile()->first() ?? new PlayerProfile)->character(),
        ]);
    }

    public function update(UpdateCharacterRequest $request): RedirectResponse
    {
        $request->user()->playerProfile()->updateOrCreate([], $request->safe()->only(['color', 'accessory', 'nickname']));

        return to_route('character.show');
    }
}
