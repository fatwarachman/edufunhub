<?php

namespace Database\Factories;

use App\Models\Advertiser;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Advertiser> */
class AdvertiserFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'name' => 'PT '.fake()->company(),
            'brand' => fake()->word(),
            'industry' => 'Makanan & minuman',
            'contact_name' => fake()->name(),
            'email' => fake()->safeEmail(),
            'phone' => '0812'.fake()->numerify('########'),
            'website' => 'https://example.com',
            'is_active' => true,
        ];
    }
}
