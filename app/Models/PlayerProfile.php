<?php

namespace App\Models;

use App\Services\CharacterShop;
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
    protected $fillable = ['color', 'accessory', 'nickname', 'grade', 'question_level', 'birth_date', 'school_name', 'school_city', 'school_level', 'school_npsn', 'gender', 'skin', 'hair_color', 'equipped'];

    public const COLORS = ['amber', 'coral', 'teal', 'violet'];

    public const ACCESSORIES = ['none', 'cap', 'glasses'];

    public const GENDERS = ['boy', 'girl'];

    public const SKINS = ['light', 'tan', 'brown', 'dark'];

    public const HAIR_COLORS = ['brown', 'black', 'blonde', 'red', 'blue', 'pink', 'teal'];

    /** 0 is kindergarten (TK). */
    public const MIN_GRADE = 0;

    public const MAX_GRADE = 12;

    public const MIN_AGE = 3;

    public const MAX_AGE = 100;

    public const SCHOOL_NAME_MAX = 120;

    public const SCHOOL_CITY_MAX = 100;

    /** @var list<string> */
    protected $appends = ['age'];

    /** @var array<string, mixed> */
    protected $attributes = ['question_level' => 1, 'color' => 'amber', 'accessory' => 'none', 'gender' => 'boy', 'skin' => 'light', 'hair_color' => 'brown'];

    /**
     * Drawable character: base look, equipped shop items and nickname.
     *
     * @return array{color: string, accessory: string, gender: string, skin: string, hair: string, items: array<string, array{style: string, color: ?string}>, nickname: ?string}
     */
    public function character(): array
    {
        return [...app(CharacterShop::class)->look($this), 'nickname' => $this->nickname];
    }

    /**
     * Drawable look without the nickname: shared with every game and the Go
     * service so in-game characters match the portal avatar.
     *
     * @return array{color: string, accessory: string, gender: string, skin: string, hair: string, items: array<string, array{style: string, color: ?string}>}
     */
    public function look(): array
    {
        return app(CharacterShop::class)->look($this);
    }

    /** Age in whole years from birth date, or null when unknown. */
    protected function age(): Attribute
    {
        return Attribute::get(fn (): ?int => $this->birth_date?->age);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['grade' => 'integer', 'question_level' => 'integer', 'birth_date' => 'immutable_date:Y-m-d', 'equipped' => 'array'];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
