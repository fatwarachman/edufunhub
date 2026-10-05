<?php

namespace Database\Factories;

use App\Models\Question;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Question>
 */
class QuestionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'key' => 'q-'.fake()->unique()->numberBetween(1000, 999999),
            'type' => Question::TYPE_CHOICE,
            'band' => fake()->numberBetween(0, 3),
            'subject' => fake()->randomElement(['math', 'science', 'language', 'social', 'english', 'civics']),
            'prompt_id' => fake()->sentence().'?',
            'prompt_en' => fake()->sentence().'?',
            'options' => [
                ['id' => 'Benar', 'en' => 'Right'],
                ['id' => 'Salah satu', 'en' => 'One'],
                ['id' => 'Salah dua', 'en' => 'Two'],
                ['id' => 'Salah tiga', 'en' => 'Three'],
            ],
            'answer' => 0,
            'hint_id' => null,
            'hint_en' => null,
            'games' => Question::GAMES,
            'is_active' => true,
        ];
    }

    public function trueFalse(bool $answer = true): static
    {
        return $this->state(fn (array $attributes): array => [
            'type' => Question::TYPE_TRUE_FALSE,
            'options' => null,
            'answer' => $answer ? 1 : 0,
            'games' => ['flag-quest'],
        ]);
    }

    /**
     * A question authored by a teacher for explicit grades.
     *
     * @param  list<int>  $grades
     */
    public function byTeacher(User $teacher, array $grades = [5]): static
    {
        return $this->state(fn (array $attributes): array => [
            'source' => 'teacher',
            'created_by' => $teacher->id,
            'updated_by' => $teacher->id,
            'grades' => $grades,
            'band' => Question::bandForGrades($grades),
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => ['is_active' => false]);
    }
}
