<?php

namespace Database\Factories;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClassroomMember>
 */
class ClassroomMemberFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'classroom_id' => Classroom::factory(),
            'user_id' => User::factory(),
            'joined_at' => now(),
        ];
    }
}
