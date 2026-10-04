<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SendPlayerNotificationRequest;
use App\Models\BroadcastMessage;
use App\Services\PlayerNotifications;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Manual notifications from the admin to players' in-app bell.
 */
class PlayerNotificationController extends Controller
{
    public function __construct(private PlayerNotifications $notifications) {}

    public function index(): Response
    {
        return Inertia::render('admin/notifications', [
            'audiences' => PlayerNotifications::AUDIENCES,
            'counts' => collect(['all', 'players', 'teachers'])
                ->mapWithKeys(fn (string $audience): array => [$audience => $this->notifications->audience($audience)->count()])
                ->all(),
            'sent' => BroadcastMessage::query()
                ->where('target_segment', 'like', 'player:%')
                ->with('sender:id,name')
                ->latest()
                ->limit(20)
                ->get()
                ->map(fn (BroadcastMessage $message): array => [
                    'id' => $message->id,
                    'title' => $message->subject,
                    'body' => $message->body,
                    'url' => $message->action_url,
                    'audience' => $message->target_segment,
                    'recipients' => (int) $message->getAttribute('recipients'),
                    'sender' => $message->sender?->name,
                    'sent_at' => $message->sent_at?->toIso8601String(),
                ])
                ->all(),
        ]);
    }

    public function store(SendPlayerNotificationRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $grade = $data['audience'] === 'grade' ? (int) $data['grade'] : null;

        $message = BroadcastMessage::query()->create([
            'sender_id' => $request->user()->id,
            'subject' => $data['title'],
            'body' => $data['body'],
            'action_url' => $data['url'] ?? null,
            'send_via_email' => false,
            'send_via_in_app' => true,
            'target_segment' => 'player:'.$data['audience'].($grade !== null ? ':'.$grade : ''),
        ]);

        $count = $this->notifications->broadcast($message, $data['audience'], $grade);
        $message->forceFill(['sent_at' => now(), 'recipients' => $count])->save();

        activity()->causedBy($request->user())->performedOn($message)
            ->withProperties(['audience' => $message->target_segment, 'recipients' => $count])
            ->log('Sent player notification');

        return back()->with('success', __('player_notifications.admin.sent', ['count' => $count]));
    }
}
