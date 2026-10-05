<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Raw ad event: one impression, click or jingle play per serve.
 */
class AdEvent extends Model
{
    public const TYPES = ['impression', 'click', 'play'];

    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = ['ad_creative_id', 'ad_campaign_id', 'user_id', 'type', 'placement', 'game_key', 'device', 'grade', 'serve_id'];

    /** @return BelongsTo<AdCreative, $this> */
    public function creative(): BelongsTo
    {
        return $this->belongsTo(AdCreative::class, 'ad_creative_id');
    }
}
