<?php

namespace Database\Factories;

use App\Models\AdCampaign;
use App\Models\AdCreative;
use App\Models\Advertiser;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<AdCampaign> */
class AdCampaignFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'advertiser_id' => Advertiser::factory(),
            'name' => 'Kampanye '.fake()->word(),
            'status' => 'active',
            'starts_on' => now()->subDay()->toDateString(),
            'ends_on' => now()->addMonth()->toDateString(),
            'pricing_model' => 'flat',
            'contract_value' => 5_000_000,
            'weight' => 5,
        ];
    }

    /**
     * Adds one creative to the campaign.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function withCreative(array $attributes = []): static
    {
        return $this->afterCreating(fn (AdCampaign $campaign) => AdCreative::query()->create([
            'ad_campaign_id' => $campaign->id,
            'type' => 'motto',
            'name' => 'Motto',
            'placements' => ['arena.header', 'arena.result'],
            'motto' => 'Sarapan sehat, belajar semangat!',
            'click_url' => 'https://example.com/promo',
            'display_seconds' => 8,
            'is_active' => true,
            ...$attributes,
        ]));
    }
}
