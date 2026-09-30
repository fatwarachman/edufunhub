<?php

namespace Database\Factories;

use App\Models\PointLedger;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<PointLedger> */
class PointLedgerFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return ['user_id' => User::factory(), 'points' => 10, 'reason' => 'game_completed', 'event_id' => fake()->unique()->uuid()];
    }
}
