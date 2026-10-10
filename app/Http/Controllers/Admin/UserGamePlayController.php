<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\GameHistory;
use App\Models\User;
use App\Services\GamePlayDetail;
use App\Services\MatchHistory;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Detail page of one game a user played: questions with their subjects and
 * the statistics of that play, opened from the user's game history tab.
 */
class UserGamePlayController extends Controller
{
    public function show(User $user, GameHistory $play, GamePlayDetail $detail, MatchHistory $matches): Response
    {
        abort_unless($play->user_id === $user->id, 404);

        return Inertia::render('admin/users/play', [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'avatar_url' => $user->avatar_url,
                'nickname' => $user->playerProfile?->nickname,
            ],
            ...$detail->present($play->setRelation('user', $user), $matches),
        ]);
    }
}
