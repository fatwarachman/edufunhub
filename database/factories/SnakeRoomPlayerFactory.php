<?php

namespace Database\Factories;

use App\Models\SnakeRoom;
use App\Models\SnakeRoomPlayer;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SnakeRoomPlayer>
 */
class SnakeRoomPlayerFactory extends Factory
{
    protected $model = SnakeRoomPlayer::class;

    public function definition(): array
    {
        return [
            'room_id' => SnakeRoom::factory(),
            'user_id' => User::factory(),
            'score' => 0,
            'final_rank' => null,
            'tail_length' => 18,
            'is_alive' => true,
        ];
    }
}
