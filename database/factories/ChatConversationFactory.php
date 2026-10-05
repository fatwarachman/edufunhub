<?php

namespace Database\Factories;

use App\Models\ChatConversation;
use App\Models\ChatParticipant;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ChatConversation> */
class ChatConversationFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'type' => ChatConversation::GROUP,
            'name' => 'Kelompok '.fake()->word(),
        ];
    }

    /**
     * Direct chat between two users.
     */
    public static function between(User $a, User $b): ChatConversation
    {
        $conversation = ChatConversation::query()->create([
            'type' => ChatConversation::DIRECT,
            'direct_key' => ChatConversation::directKey($a->id, $b->id),
            'created_by' => $a->id,
        ]);
        foreach ([$a, $b] as $user) {
            $conversation->participants()->create(['user_id' => $user->id, 'role' => ChatParticipant::MEMBER]);
        }

        return $conversation;
    }

    /**
     * Group owned by the first user.
     *
     * @param  list<User>  $users
     */
    public static function group(array $users, string $name = 'Kelompok Belajar'): ChatConversation
    {
        $conversation = ChatConversation::query()->create([
            'type' => ChatConversation::GROUP,
            'name' => $name,
            'created_by' => $users[0]->id,
        ]);
        foreach ($users as $i => $user) {
            $conversation->participants()->create([
                'user_id' => $user->id,
                'role' => $i === 0 ? ChatParticipant::OWNER : ChatParticipant::MEMBER,
            ]);
        }

        return $conversation;
    }
}
