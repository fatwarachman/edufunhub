<?php

namespace Database\Factories;

use App\Models\School;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<School>
 */
class SchoolFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $level = fake()->randomElement(['SD', 'SMP', 'SMA']);

        return [
            'npsn' => (string) fake()->unique()->numberBetween(10000000, 99999999),
            'name' => $level.' NEGERI '.fake()->unique()->numberBetween(1, 99999).' '.strtoupper(fake()->word()),
            'regency' => 'Kota Bogor',
            'district' => strtoupper(fake()->word()),
            'level' => $level,
            'form' => $level,
        ];
    }

    public function in(string $regency, string $level, ?string $form = null): static
    {
        return $this->state(fn (): array => ['regency' => $regency, 'level' => $level, 'form' => $form ?? $level]);
    }
}
