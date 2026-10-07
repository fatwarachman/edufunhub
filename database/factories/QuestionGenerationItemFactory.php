<?php

namespace Database\Factories;

use App\Models\QuestionGeneration;
use App\Models\QuestionGenerationItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<QuestionGenerationItem>
 */
class QuestionGenerationItemFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'generation_id' => fn (): int => QuestionGeneration::query()->create([
                'model' => 'test-model', 'subjects' => ['math'], 'grades' => [1], 'per_combination' => 5,
                'games' => ['sky-quiz'], 'status' => 'queued', 'total_jobs' => 1,
            ])->id,
            'subject' => 'math',
            'grade' => fake()->numberBetween(0, 12),
            'status' => QuestionGenerationItem::QUEUED,
            'target' => 5,
        ];
    }

    public function running(int $created = 0): static
    {
        return $this->state(['status' => QuestionGenerationItem::RUNNING, 'created_count' => $created, 'started_at' => now()]);
    }

    public function done(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => QuestionGenerationItem::DONE, 'created_count' => $attributes['target'] ?? 5, 'started_at' => now(), 'finished_at' => now(),
        ]);
    }

    public function failed(string $error = 'model overloaded'): static
    {
        return $this->state(['status' => QuestionGenerationItem::FAILED, 'error' => $error, 'started_at' => now(), 'finished_at' => now()]);
    }
}
