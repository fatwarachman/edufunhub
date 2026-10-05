<?php

namespace Database\Factories;

use App\Models\SequenceSet;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SequenceSet>
 */
class SequenceSetFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $number = fake()->unique()->numberBetween(1000, 999999);

        return [
            'key' => 'set-'.$number,
            'category' => 'CUSTOM_'.$number,
            'kind' => 'protocol',
            'title_id' => 'Urutan '.$number,
            'title_en' => 'Sequence '.$number,
            'description_id' => 'Urutkan langkahnya.',
            'description_en' => 'Order the steps.',
            'items' => [
                ['label_id' => 'Langkah 1', 'label_en' => 'Step 1'],
                ['label_id' => 'Langkah 2', 'label_en' => 'Step 2'],
                ['label_id' => 'Langkah 3', 'label_en' => 'Step 3'],
            ],
            'sort_order' => 500,
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }
}
