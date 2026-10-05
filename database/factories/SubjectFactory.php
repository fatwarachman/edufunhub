<?php

namespace Database\Factories;

use App\Models\Subject;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Subject>
 */
class SubjectFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->words(2, true);

        return [
            'key' => 's'.fake()->unique()->numberBetween(1000, 999999),
            'name_id' => ucfirst($name),
            'name_en' => ucfirst($name),
            'icon' => fake()->randomElement(Subject::ICONS),
            'color' => fake()->randomElement(['#ffd93d', '#5ad1a6', '#ff9ecf', '#8fb8ff']),
            'ai_hint' => null,
            'sort_order' => 100,
            'is_active' => true,
            'is_system' => false,
        ];
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }
}
