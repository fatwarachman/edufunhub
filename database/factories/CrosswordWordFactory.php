<?php

namespace Database\Factories;

use App\Models\CrosswordWord;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<CrosswordWord> */
class CrosswordWordFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'key' => 'cw-'.Str::lower(Str::random(10)),
            'level' => 1,
            'answer' => Str::upper(fake()->unique()->lexify('??????')),
            'clue_id' => fake()->sentence(4),
            'clue_en' => fake()->sentence(4),
            'is_active' => true,
        ];
    }
}
