<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Daily rollup per creative, placement and game (reports and caps).
 */
class AdDailyStat extends Model
{
    public $timestamps = false;

    /** @var list<string> */
    protected $fillable = ['day', 'ad_creative_id', 'ad_campaign_id', 'placement', 'game_key', 'impressions', 'clicks', 'plays'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['day' => 'date', 'impressions' => 'integer', 'clicks' => 'integer', 'plays' => 'integer'];
    }
}
