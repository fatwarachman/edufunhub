<?php

namespace App\Models;

use Database\Factories\PlayerProfileFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlayerProfile extends Model
{
    /** @use HasFactory<PlayerProfileFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = ['color', 'accessory', 'nickname'];

    public const COLORS = ['amber', 'coral', 'teal', 'violet'];

    public const ACCESSORIES = ['none', 'cap', 'glasses'];

    /** @var array<string, mixed> */
    protected $attributes = ['color' => 'amber', 'accessory' => 'none'];

    /** @return array{color: string, accessory: string, nickname: ?string} */
    public function character(): array
    {
        return ['color' => $this->color, 'accessory' => $this->accessory, 'nickname' => $this->nickname];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
