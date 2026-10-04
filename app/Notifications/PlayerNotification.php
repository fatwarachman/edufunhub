<?php

namespace App\Notifications;

use App\Models\BroadcastMessage;
use Illuminate\Notifications\Notification;

/**
 * In-app notification shown in the player bell. System notifications store a
 * translation key plus parameters so they follow the player's language; admin
 * messages store their own title and body.
 */
class PlayerNotification extends Notification
{
    public const KINDS = ['points', 'level', 'item', 'teacher', 'admin'];

    /**
     * @param  array<string, scalar|null>  $params
     */
    public function __construct(
        public string $kind,
        public ?string $key = null,
        public array $params = [],
        public ?string $title = null,
        public ?string $body = null,
        public ?string $url = null,
        public ?int $broadcastId = null,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function databaseType(object $notifiable): string
    {
        return 'player';
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return array_filter([
            'kind' => $this->kind,
            'key' => $this->key,
            'params' => $this->params,
            'title' => $this->title,
            'body' => $this->body,
            'url' => $this->url,
            'broadcast_id' => $this->broadcastId,
        ], fn ($value): bool => $value !== null && $value !== []);
    }

    /** @param  array<string, scalar|null>  $params */
    public static function system(string $kind, string $key, array $params = [], ?string $url = null): self
    {
        return new self($kind, key: $key, params: $params, url: $url);
    }

    public static function fromBroadcast(BroadcastMessage $message): self
    {
        return new self('admin', title: $message->subject, body: $message->body, url: $message->action_url, broadcastId: $message->id);
    }
}
