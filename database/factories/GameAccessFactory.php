<?php

namespace Database\Factories;

use App\Models\GameAccess;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<GameAccess> */
class GameAccessFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'game_key' => 'sky-quiz',
            'device_type' => 'desktop',
            'os' => 'Windows',
            'browser' => 'Chrome',
            'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
            'accessed_at' => now(),
        ];
    }

    public function mobile(string $os = 'Android'): static
    {
        return $this->state(fn (): array => ['device_type' => 'mobile', 'os' => $os, 'browser' => $os === 'iOS' ? 'Safari' : 'Chrome']);
    }
}
