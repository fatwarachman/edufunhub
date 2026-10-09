<?php

namespace Database\Factories;

use App\Models\SnakeRoom;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SnakeRoom>
 */
class SnakeRoomFactory extends Factory
{
    protected $model = SnakeRoom::class;

    public function definition(): array
    {
        return [
            'code' => SnakeRoom::generateUniqueCode(),
            'mode' => SnakeRoom::MODE_SHARED_GRID,
            'subject_id' => Subject::factory(),
            'grade_level' => 'SD',
            'max_players' => 4,
            'status' => SnakeRoom::STATUS_WAITING,
            'created_by' => User::factory(),
        ];
    }
}
