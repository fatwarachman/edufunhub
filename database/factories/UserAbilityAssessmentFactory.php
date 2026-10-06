<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\UserAbilityAssessment;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<UserAbilityAssessment> */
class UserAbilityAssessmentFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'requested_by' => null,
            'status' => UserAbilityAssessment::PENDING,
            'model' => 'gpt-4o-mini',
            'input_snapshot' => ['profile' => ['alias' => 'Peserta']],
            'result' => null,
            'error' => null,
        ];
    }

    /** @param  array<string, mixed>  $result */
    public function done(array $result = []): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => UserAbilityAssessment::DONE,
            'result' => $result + [
                'summary' => fake()->sentence(),
                'strengths' => ['Matematika dasar'],
                'weaknesses' => ['Membaca soal panjang'],
                'subject_scores' => ['math' => 80, 'science' => 55],
                'game_insights' => [],
                'recommendations' => ['Latih soal cerita 10 menit per hari.'],
                'learning_style' => 'Visual',
                'progress_vs_previous' => 'Analisa pertama.',
                'confidence' => 'sedang',
            ],
        ]);
    }

    public function failed(string $error = 'model overloaded'): static
    {
        return $this->state(fn (array $attributes): array => ['status' => UserAbilityAssessment::FAILED, 'error' => $error]);
    }
}
