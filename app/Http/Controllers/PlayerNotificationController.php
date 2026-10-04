<?php

namespace App\Http\Controllers;

use App\Services\PlayerNotifications;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Player bell: list newest notifications and mark them read. JSON only; the
 * bell polls this endpoint.
 */
class PlayerNotificationController extends Controller
{
    public function __construct(private PlayerNotifications $notifications) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->notifications->feed($request->user()));
    }

    public function read(Request $request, string $id): JsonResponse
    {
        $request->user()->notifications()->where('type', 'player')->whereKey($id)->firstOrFail()->markAsRead();

        return response()->json(['unread' => $this->notifications->unreadCount($request->user())]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->where('type', 'player')->update(['read_at' => now()]);

        return response()->json(['unread' => 0]);
    }
}
