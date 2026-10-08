<?php

namespace App\Http\Controllers;

use App\Http\Requests\SendFriendRequest;
use App\Models\Friendship;
use App\Models\User;
use App\Services\FriendService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Friends page (list with online status, requests, add friend) and the
 * request actions. Online status itself comes live from the chat socket.
 */
class FriendController extends Controller
{
    public function __construct(private FriendService $friends) {}

    public function index(Request $request): Response
    {
        $tab = in_array($request->query('tab'), ['friends', 'requests', 'add'], true) ? $request->query('tab') : 'friends';

        return Inertia::render('friends/index', [
            ...$this->friends->overview($request->user()),
            'tab' => $tab,
            'limits' => ['friends' => Friendship::MAX_FRIENDS],
        ]);
    }

    public function search(Request $request): JsonResponse
    {
        return response()->json(['people' => $this->friends->search($request->user(), (string) $request->query('q', ''))]);
    }

    public function store(SendFriendRequest $request): RedirectResponse
    {
        $friendship = $this->friends->request($request->user(), User::query()->findOrFail($request->integer('user_id')));

        return back()->with('success', __($friendship->status === Friendship::ACCEPTED ? 'friends.now_friends' : 'friends.sent'));
    }

    public function accept(Request $request, Friendship $friendship): RedirectResponse
    {
        $this->friends->accept($request->user(), $friendship);

        return back()->with('success', __('friends.now_friends'));
    }

    public function decline(Request $request, Friendship $friendship): RedirectResponse
    {
        $this->friends->decline($request->user(), $friendship);

        return back()->with('success', __('friends.declined'));
    }

    public function destroy(Request $request, Friendship $friendship): RedirectResponse
    {
        $wasFriend = $friendship->status === Friendship::ACCEPTED;
        $this->friends->remove($request->user(), $friendship);

        return back()->with('success', __($wasFriend ? 'friends.removed' : 'friends.cancelled'));
    }
}
