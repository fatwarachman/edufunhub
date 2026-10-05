<?php

namespace App\Models;

use App\Services\Ads\AdMedia;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One ad asset: logo image, motto sentence, jingle audio or sponsored
 * character item, and the placements it may fill.
 */
class AdCreative extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'ad_campaign_id', 'type', 'name', 'size', 'placements', 'image_path', 'audio_path', 'motto', 'click_url',
        'background_color', 'text_color', 'display_seconds', 'audio_seconds', 'character_item_id', 'is_active',
    ];

    /** @var list<string> */
    protected $appends = ['image_url', 'audio_url'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'placements' => 'array',
            'display_seconds' => 'integer',
            'audio_seconds' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    /** @return BelongsTo<AdCampaign, $this> */
    public function campaign(): BelongsTo
    {
        return $this->belongsTo(AdCampaign::class, 'ad_campaign_id');
    }

    /** @return BelongsTo<CharacterItem, $this> */
    public function characterItem(): BelongsTo
    {
        return $this->belongsTo(CharacterItem::class);
    }

    /** @return HasMany<AdEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(AdEvent::class);
    }

    protected function imageUrl(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->image_path ? AdMedia::url($this->image_path) : null);
    }

    protected function audioUrl(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->audio_path ? AdMedia::url($this->audio_path) : null);
    }
}
