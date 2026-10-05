<?php

namespace Database\Factories;

use App\Models\SorterSet;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SorterSet>
 */
class SorterSetFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $number = fake()->unique()->numberBetween(1000, 999999);

        return [
            'key' => 'sort-'.$number,
            'title_id' => 'Pilah '.$number,
            'title_en' => 'Sort '.$number,
            'description_id' => 'Pilah ke keranjang yang tepat.',
            'description_en' => 'Sort into the right bin.',
            'bins' => [
                ['key' => 'layer-1', 'name_id' => 'LAYER 1', 'name_en' => 'LAYER 1', 'color' => '#2563eb'],
                ['key' => 'layer-2', 'name_id' => 'LAYER 2', 'name_en' => 'LAYER 2', 'color' => '#c2410c'],
                ['key' => 'layer-3', 'name_id' => 'LAYER 3', 'name_en' => 'LAYER 3', 'color' => '#7c3aed'],
            ],
            'items' => [
                ['label' => 'Hub', 'hint_id' => 'Penguat sinyal', 'hint_en' => 'Repeater', 'bin' => 'layer-1', 'level' => 1],
                ['label' => 'Switch', 'hint_id' => 'MAC address', 'hint_en' => 'MAC address', 'bin' => 'layer-2', 'level' => 1],
                ['label' => 'Router', 'hint_id' => 'IP address', 'hint_en' => 'IP address', 'bin' => 'layer-3', 'level' => 1],
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
