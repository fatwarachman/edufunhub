<?php

namespace Database\Factories;

use App\Models\CharacterItem;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<CharacterItem> */
class CharacterItemFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'key' => 'item-'.Str::lower(Str::random(8)),
            'slot' => 'hat',
            'style' => 'wizard',
            'color' => '#27406e',
            'name_id' => 'Topi '.fake()->word(),
            'name_en' => 'Hat '.fake()->word(),
            'price' => 100,
            'is_active' => true,
        ];
    }

    public function free(): static
    {
        return $this->state(['price' => 0]);
    }

    public function weapon(string $style = 'sword'): static
    {
        return $this->state(['slot' => 'weapon', 'style' => $style]);
    }
}
