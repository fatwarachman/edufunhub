<?php

namespace App\Models;

use Database\Factories\UserAbilityAssessmentFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * One AI analysis of a player's abilities, run manually by a super admin or
 * automatically after the player answered enough questions in one day
 * (see App\Services\Ai\AutoAbilityAssessment).
 * The prepared input is stored with the result so later analyses can build
 * on earlier ones and admins can see what the model was given.
 *
 * @property int $id
 * @property int $user_id
 * @property ?int $requested_by
 * @property string $trigger
 * @property ?Carbon $trigger_day
 * @property ?int $trigger_index
 * @property ?int $trigger_answered
 * @property string $status
 * @property ?string $model
 * @property ?array<string, mixed> $input_snapshot
 * @property ?array<string, mixed> $result
 * @property ?string $error
 */
class UserAbilityAssessment extends Model
{
    /** @use HasFactory<UserAbilityAssessmentFactory> */
    use HasFactory;

    public const PENDING = 'pending';

    public const DONE = 'done';

    public const FAILED = 'failed';

    public const STATUSES = [self::PENDING, self::DONE, self::FAILED];

    /** Started by a super admin. */
    public const TRIGGER_MANUAL = 'manual';

    /** Started after the player reached a daily answered-questions milestone. */
    public const TRIGGER_AUTO = 'auto';

    /** A pending analysis older than this is treated as lost (worker died). */
    public const STALE_MINUTES = 10;

    /** @var list<string> */
    protected $fillable = ['user_id', 'requested_by', 'trigger', 'trigger_day', 'trigger_index', 'trigger_answered', 'status', 'model', 'input_snapshot', 'result', 'error'];

    /** @var array<string, mixed> */
    protected $attributes = ['status' => self::PENDING, 'trigger' => self::TRIGGER_MANUAL];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'input_snapshot' => 'array',
            'result' => 'array',
            'trigger_day' => 'date',
            'trigger_index' => 'integer',
            'trigger_answered' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<User, $this> */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    /** @param  Builder<UserAbilityAssessment>  $query */
    public function scopeRunning(Builder $query): void
    {
        $query->where('status', self::PENDING)->where('created_at', '>=', now()->subMinutes(self::STALE_MINUTES));
    }

    /** Close pending analyses of the user that never finished. */
    public static function failStale(int $userId): void
    {
        static::query()
            ->where('user_id', $userId)
            ->where('status', self::PENDING)
            ->where('created_at', '<', now()->subMinutes(self::STALE_MINUTES))
            ->update(['status' => self::FAILED, 'error' => __('ai.assessment_timed_out')]);
    }

    /** @param  array<string, mixed>  $result */
    public function markDone(array $result): void
    {
        $this->update(['status' => self::DONE, 'result' => $result, 'error' => null]);
    }

    public function markFailed(string $message): void
    {
        $this->update(['status' => self::FAILED, 'error' => Str::limit(trim(strip_tags($message)), 500)]);
    }
}
