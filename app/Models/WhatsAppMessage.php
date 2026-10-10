<?php

namespace App\Models;

use App\Services\WhatsApp\PhoneNumber;
use Database\Factories\WhatsAppMessageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * One WhatsApp message sent (or attempted) through the GOWA container.
 *
 * @property int $id
 * @property ?int $user_id
 * @property string $event
 * @property string $phone
 * @property string $body
 * @property string $status
 * @property ?string $provider_message_id
 * @property ?string $error
 */
class WhatsAppMessage extends Model
{
    /** @use HasFactory<WhatsAppMessageFactory> */
    use HasFactory;

    public const QUEUED = 'queued';

    public const SENT = 'sent';

    public const FAILED = 'failed';

    /** Not sent because an admin switch was off; kept so the log explains the gap. */
    public const SKIPPED = 'skipped';

    public const STATUSES = [self::QUEUED, self::SENT, self::FAILED, self::SKIPPED];

    /** Manual test message from the admin page. */
    public const TEST_EVENT = 'test';

    protected $table = 'whatsapp_messages';

    /** @var list<string> */
    protected $fillable = ['user_id', 'event', 'phone', 'body', 'status', 'provider_message_id', 'error', 'sent_at'];

    /** @var array<string, mixed> */
    protected $attributes = ['status' => self::QUEUED];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['sent_at' => 'datetime'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function markSent(?string $providerMessageId): void
    {
        $this->forceFill(['status' => self::SENT, 'provider_message_id' => $providerMessageId, 'error' => null, 'sent_at' => now()])->save();
    }

    public function markFailed(string $message): void
    {
        $this->forceFill(['status' => self::FAILED, 'error' => Str::limit(trim(strip_tags($message)), 480)])->save();
    }

    /**
     * Admin view of one log entry: number partly hidden, recipient by name.
     *
     * @param  array<string, string>  $eventLabels
     * @return array{id: int, event: string, event_label: string, phone: string, user: ?array{id: int, name: string, email: string}, body: string, status: string, error: ?string, provider_message_id: ?string, created_at: ?string, updated_at: ?string, sent_at: ?string}
     */
    public function toAdminArray(array $eventLabels): array
    {
        return [
            'id' => $this->id,
            'event' => $this->event,
            'event_label' => $eventLabels[$this->event] ?? $this->event,
            'phone' => PhoneNumber::mask($this->phone),
            'user' => $this->user ? ['id' => $this->user->id, 'name' => $this->user->name, 'email' => $this->user->email] : null,
            'body' => $this->body,
            'status' => $this->status,
            'error' => $this->error,
            'provider_message_id' => $this->provider_message_id,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'sent_at' => $this->sent_at?->toIso8601String(),
        ];
    }
}
