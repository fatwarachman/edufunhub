<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\GameSoundsRequest;
use App\Services\GameSounds;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Game sound settings: correct/wrong answer sounds, volume and on/off.
 */
class GameSoundsController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('admin/sound-settings', [
            'settings' => GameSounds::current(),
            'defaults' => GameSounds::DEFAULTS,
            'options' => ['correct' => GameSounds::CORRECT, 'wrong' => GameSounds::WRONG],
        ]);
    }

    public function update(GameSoundsRequest $request): RedirectResponse
    {
        $settings = [
            'enabled' => $request->boolean('enabled'),
            'volume' => $request->integer('volume'),
            'correct' => $request->string('correct')->toString(),
            'wrong' => $request->string('wrong')->toString(),
        ];
        GameSounds::save($settings);
        activity()->causedBy($request->user())->withProperties($settings)->log('Updated game sounds');

        return back()->with('success', 'Sound settings saved.');
    }
}
