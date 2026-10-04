<?php

namespace Database\Factories;

use App\Models\PlayerProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<PlayerProfile> */
class PlayerProfileFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'color' => 'amber',
            'accessory' => 'none',
            'nickname' => null,
            'birth_date' => now()->subYears(10)->toDateString(),
            'school_name' => 'SDN 1 Bogor',
        ];
    }

    /** Profile without the participant details required to play. */
    public function incomplete(): static
    {
        return $this->state(fn (array $attributes): array => ['birth_date' => null, 'school_name' => null]);
    }
}
