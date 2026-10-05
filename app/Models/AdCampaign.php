<?php

namespace App\Models;

use Database\Factories\AdCampaignFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * A paid flight: date range, pricing, impression caps and targeting.
 */
class AdCampaign extends Model
{
    /** @use HasFactory<AdCampaignFactory> */
    use HasFactory, SoftDeletes;

    public const STATUSES = ['draft', 'active', 'paused', 'ended'];

    /** flat = fixed contract value; cpm = per 1000 impressions; cpc = per click. */
    public const PRICING = ['flat', 'cpm', 'cpc'];

    /** @var list<string> */
    protected $fillable = [
        'advertiser_id', 'name', 'status', 'starts_on', 'ends_on', 'pricing_model', 'contract_value', 'contract_number',
        'max_impressions', 'daily_max_impressions', 'weight', 'target_games', 'grade_min', 'grade_max', 'notes', 'created_by',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'contract_value' => 'integer',
            'max_impressions' => 'integer',
            'daily_max_impressions' => 'integer',
            'weight' => 'integer',
            'target_games' => 'array',
            'grade_min' => 'integer',
            'grade_max' => 'integer',
        ];
    }

    /** @return BelongsTo<Advertiser, $this> */
    public function advertiser(): BelongsTo
    {
        return $this->belongsTo(Advertiser::class);
    }

    /** @return HasMany<AdCreative, $this> */
    public function creatives(): HasMany
    {
        return $this->hasMany(AdCreative::class);
    }

    /** @return HasMany<AdDailyStat, $this> */
    public function dailyStats(): HasMany
    {
        return $this->hasMany(AdDailyStat::class);
    }

    /**
     * Campaigns that may serve today: status active and today within the flight.
     *
     * @param  Builder<AdCampaign>  $query
     */
    public function scopeLive(Builder $query, ?Carbon $today = null): void
    {
        $day = ($today ?? now())->toDateString();
        $query->where('status', 'active')->whereDate('starts_on', '<=', $day)->whereDate('ends_on', '>=', $day)
            ->whereHas('advertiser', fn (Builder $a) => $a->where('is_active', true));
    }

    /** Effective state for the admin list (active but outside its dates shows as scheduled/expired). */
    public function displayStatus(?Carbon $today = null): string
    {
        $today = ($today ?? now())->startOfDay();
        if ($this->status !== 'active') {
            return $this->status;
        }
        if ($this->starts_on->gt($today)) {
            return 'scheduled';
        }

        return $this->ends_on->lt($today) ? 'expired' : 'live';
    }

    public function targetsGame(?string $game): bool
    {
        return empty($this->target_games) || ($game !== null && in_array($game, $this->target_games, true));
    }

    public function targetsGrade(?int $grade): bool
    {
        if ($this->grade_min === null && $this->grade_max === null) {
            return true;
        }
        if ($grade === null) {
            return false;
        }

        return ($this->grade_min === null || $grade >= $this->grade_min) && ($this->grade_max === null || $grade <= $this->grade_max);
    }
}
