<?php

namespace Database\Factories;

use App\Models\PlayerProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'two_factor_secret' => Str::random(10),
            'two_factor_recovery_codes' => Str::random(10),
            'two_factor_confirmed_at' => now(),
            'onboarded_at' => now(),
            'profile_completed_at' => now(),
        ];
    }

    /**
     * New account that still has to finish the first-login profile wizard.
     */
    public function profilePending(): static
    {
        return $this->state(fn (array $attributes) => [
            'profile_completed_at' => null,
        ]);
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    /**
     * Indicate that the model does not have two-factor authentication configured.
     */
    public function withoutTwoFactor(): static
    {
        return $this->state(fn (array $attributes) => [
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'two_factor_confirmed_at' => null,
        ]);
    }

    /**
     * Indicate that the user is a superadmin.
     */
    public function superadmin(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_superadmin' => true,
        ]);
    }

    /**
     * Give the user a player profile with the details required to play games.
     */
    public function withPlayerDetails(): static
    {
        return $this->has(PlayerProfile::factory(), 'playerProfile');
    }

    /**
     * Give the user the teacher ("guru") role.
     */
    public function teacher(): static
    {
        return $this->afterCreating(function (User $user): void {
            $role = Role::query()->firstOrCreate(
                ['slug' => Role::TEACHER],
                ['name' => 'Guru', 'description' => 'Membuat dan mengelola quiz untuk kelas', 'is_system' => true],
            );
            $user->roles()->syncWithoutDetaching([$role->id]);
        });
    }

    /**
     * Indicate that the user has not completed onboarding.
     */
    public function unonboarded(): static
    {
        return $this->state(fn (array $attributes) => [
            'onboarded_at' => null,
        ]);
    }
}
