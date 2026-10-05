<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\UserBadge;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UserBadge>
 */
class UserBadgeFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'badge' => fake()->randomElement(array_keys(config('badges.badges'))),
            'earned_at' => now(),
        ];
    }
}
