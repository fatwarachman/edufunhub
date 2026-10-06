<?php

namespace App\Models;

use Database\Factories\UserAbilityAssessmentFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * One AI analysis of a player's abilities, run manually by a super admin.
 * The prepared input is stored with the result so later analyses can build
 * on earlier ones and admins can see what the model was given.
 *
 * @property int $id
 * @property int $user_id
 * @property ?int $requested_by
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

    /** A pending analysis older than this is treated as lost (worker died). */
    public const STALE_MINUTES = 10;

    /** @var list<string> */
    protected $fillable = ['user_id', 'requested_by', 'status', 'model', 'input_snapshot', 'result', 'error'];

    /** @var array<string, mixed> */
    protected $attributes = ['status' => self::PENDING];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['input_snapshot' => 'array', 'result' => 'array'];
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
