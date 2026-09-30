<?php

namespace App\Models;

use Database\Factories\PointLedgerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PointLedger extends Model
{
    /** @use HasFactory<PointLedgerFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = ['points', 'reason', 'event_id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['points' => 'integer'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
