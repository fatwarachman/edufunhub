<?php

namespace App\Models;

use Database\Factories\CharacterItemFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Wearable item in the character shop. Bought with points; free items
 * (price 0) belong to everyone.
 */
class CharacterItem extends Model
{
    /** @use HasFactory<CharacterItemFactory> */
    use HasFactory;

    public const SLOTS = ['hat', 'face', 'outfit', 'back', 'weapon', 'offhand'];

    /** Drawing styles the renderer knows, per slot. */
    public const STYLES = [
        'hat' => ['cap', 'flower', 'hood', 'wizard', 'helmet', 'circlet', 'horned', 'crown'],
        'face' => ['glasses', 'mask'],
        'outfit' => ['tunic', 'leather', 'robe', 'dress', 'armor'],
        'back' => ['cape', 'wings'],
        'weapon' => ['sword', 'wand', 'bow', 'staff', 'spear', 'mace', 'axe'],
        'offhand' => ['shield'],
    ];

    public const MAX_PRICE = 100000;

    /** @var list<string> */
    protected $fillable = ['key', 'slot', 'style', 'color', 'name_id', 'name_en', 'price', 'is_active', 'sort_order'];

    /** @var array<string, mixed> */
    protected $attributes = ['is_active' => true, 'price' => 0, 'sort_order' => 0];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['price' => 'integer', 'is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    /** @param Builder<CharacterItem> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @return BelongsToMany<User, $this> */
    public function owners(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withPivot('price_paid')->withTimestamps();
    }

    public function isFree(): bool
    {
        return $this->price === 0;
    }

    public function name(string $locale): string
    {
        return $locale === 'en' && $this->name_en ? $this->name_en : $this->name_id;
    }

    /** What the renderer needs to draw the item. @return array{style: string, color: ?string} */
    public function look(): array
    {
        return ['style' => $this->style, 'color' => $this->color];
    }
}
