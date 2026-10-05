<?php

namespace Database\Factories;

use App\Models\GameHistory;
use App\Models\SequenceAttempt;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SequenceAttempt>
 */
class SequenceAttemptFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $solved = fake()->numberBetween(0, 5);
        $wrong = fake()->numberBetween(0, 5);

        return [
            'game_history_id' => GameHistory::factory(),
            'user_id' => User::factory(),
            'set_key' => 'utp-t568b',
            'category' => 'UTP_T568B',
            'attempts' => $solved + $wrong,
            'solved' => $solved,
            'wrong' => $wrong,
            'total_ms' => $solved * 4000,
            'slot_errors' => array_fill(0, 8, 0),
            'played_at' => now(),
        ];
    }
}
