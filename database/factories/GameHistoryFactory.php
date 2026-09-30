<?php

namespace Database\Factories;

use App\Models\GameHistory;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<GameHistory> */
class GameHistoryFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return ['user_id' => User::factory(), 'game_key' => 'sky-quiz', 'game_name' => 'Sky Quiz', 'points' => 10, 'played_at' => now(), 'event_id' => fake()->unique()->uuid()];
    }
}
