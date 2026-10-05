<?php

namespace App\Http\Requests\Admin;

use App\Models\AdCampaign;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdCampaignRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'name' => trim((string) $this->input('name')),
            'target_games' => array_values(array_filter((array) $this->input('target_games', []))),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'advertiser_id' => ['required', 'integer', Rule::exists('advertisers', 'id')->whereNull('deleted_at')],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'status' => ['required', Rule::in(AdCampaign::STATUSES)],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'pricing_model' => ['required', Rule::in(AdCampaign::PRICING)],
            'contract_value' => ['required', 'integer', 'min:0', 'max:100000000000'],
            'contract_number' => ['nullable', 'string', 'max:60'],
            'max_impressions' => ['nullable', 'integer', 'min:1', 'max:1000000000'],
            'daily_max_impressions' => ['nullable', 'integer', 'min:1', 'max:100000000'],
            'weight' => ['required', 'integer', 'min:1', 'max:10'],
            'target_games' => ['array'],
            'target_games.*' => ['string', Rule::in(self::gameKeys())],
            'grade_min' => ['nullable', 'integer', 'min:1', 'max:12'],
            'grade_max' => ['nullable', 'integer', 'min:1', 'max:12', 'gte:grade_min'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /** @return list<string> */
    public static function gameKeys(): array
    {
        return collect((array) config('game-catalog.categories'))->flatMap(fn (array $c) => collect($c['games'] ?? [])->pluck('key'))
            ->filter()->unique()->values()->all();
    }
}
