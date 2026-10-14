<?php

namespace Database\Factories;

use App\Models\Classroom;
use App\Models\ClassroomAnnouncement;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClassroomAnnouncement>
 */
class ClassroomAnnouncementFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'classroom_id' => Classroom::factory(),
            'teacher_id' => fn (array $attributes): int => (int) Classroom::query()->findOrFail($attributes['classroom_id'])->teacher_id,
            'title' => fake()->sentence(3),
            'body' => fake()->sentence(12),
            'display_seconds' => 60,
            'starts_at' => now(),
            'ends_at' => now()->addSeconds(60),
        ];
    }

    public function expired(): static
    {
        return $this->state([
            'starts_at' => now()->subMinutes(5),
            'ends_at' => now()->subMinutes(4),
        ]);
    }
}
