<?php

namespace Database\Factories;

use App\Models\Classroom;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Classroom>
 */
class ClassroomFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'teacher_id' => User::factory()->teacher(),
            'name' => 'Kelas '.fake()->unique()->numerify('##-???'),
            'description' => null,
            'pin' => str_pad((string) fake()->unique()->numberBetween(0, 999999), 6, '0', STR_PAD_LEFT),
            'starts_at' => now()->subMinutes(10),
            'ends_at' => now()->addHour(),
            'max_members' => 100,
        ];
    }

    public function scheduled(): static
    {
        return $this->state(['starts_at' => now()->addHour(), 'ends_at' => now()->addHours(2)]);
    }

    public function ended(): static
    {
        return $this->state(['starts_at' => now()->subHours(2), 'ends_at' => now()->subHour()]);
    }
}
