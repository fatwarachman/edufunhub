<?php

namespace App\Models;

use App\Services\Ads\AdMedia;
use Database\Factories\AdvertiserFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A company or brand that buys ad campaigns.
 */
class Advertiser extends Model
{
    /** @use HasFactory<AdvertiserFactory> */
    use HasFactory, SoftDeletes;

    /** @var list<string> */
    protected $fillable = ['name', 'brand', 'industry', 'contact_name', 'email', 'phone', 'website', 'tax_id', 'address', 'notes', 'logo_path', 'is_active'];

    /** @var list<string> */
    protected $appends = ['logo_url'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    /** @return HasMany<AdCampaign, $this> */
    public function campaigns(): HasMany
    {
        return $this->hasMany(AdCampaign::class);
    }

    /** @return HasMany<CharacterItem, $this> */
    public function sponsoredItems(): HasMany
    {
        return $this->hasMany(CharacterItem::class);
    }

    protected function logoUrl(): Attribute
    {
        return Attribute::get(fn (): ?string => $this->logo_path ? AdMedia::url($this->logo_path) : null);
    }
}
