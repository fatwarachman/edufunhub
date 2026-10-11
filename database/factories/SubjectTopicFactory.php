<?php

namespace Database\Factories;

use App\Models\SubjectTopic;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SubjectTopic>
 */
class SubjectTopicFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = ucfirst(fake()->unique()->words(2, true));

        return [
            'subject_key' => 'english',
            'name_id' => $name,
            'name_en' => $name,
            'material' => fake()->paragraph(),
            'is_active' => true,
            'sort_order' => 0,
        ];
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }
}
