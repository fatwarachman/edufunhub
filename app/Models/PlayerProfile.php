<?php

namespace App\Models;

use Database\Factories\PlayerProfileFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlayerProfile extends Model
{
    /** @use HasFactory<PlayerProfileFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = ['color', 'accessory', 'nickname', 'grade', 'birth_date', 'school_name'];

    public const COLORS = ['amber', 'coral', 'teal', 'violet'];

    public const ACCESSORIES = ['none', 'cap', 'glasses'];

    public const MIN_GRADE = 1;

    public const MAX_GRADE = 12;

    public const MIN_AGE = 3;

    public const MAX_AGE = 100;

    public const SCHOOL_NAME_MAX = 120;

    /** @var list<string> */
    protected $appends = ['age'];

    /** @var array<string, mixed> */
    protected $attributes = ['color' => 'amber', 'accessory' => 'none'];

    /** @return array{color: string, accessory: string, nickname: ?string} */
    public function character(): array
    {
        return ['color' => $this->color, 'accessory' => $this->accessory, 'nickname' => $this->nickname];
    }

    /** Age in whole years from birth date, or null when unknown. */
    protected function age(): Attribute
    {
        return Attribute::get(fn (): ?int => $this->birth_date?->age);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['grade' => 'integer', 'birth_date' => 'immutable_date:Y-m-d'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
