<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Active screen seconds of one user, per local day and app area.
 *
 * `date` stays a plain `Y-m-d` string so Eloquent writes and the atomic
 * upsert store the same value on every driver.
 */
class ScreenTimeDaily extends Model
{
    protected $table = 'screen_time_daily';

    public $timestamps = false;

    /** @var list<string> */
    protected $fillable = ['user_id', 'date', 'area', 'seconds'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['seconds' => 'integer'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
