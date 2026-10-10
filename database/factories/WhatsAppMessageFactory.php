<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\WhatsAppMessage;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WhatsAppMessage>
 */
class WhatsAppMessageFactory extends Factory
{
    protected $model = WhatsAppMessage::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'event' => 'friend_request',
            'phone' => '62812'.fake()->numerify('#######'),
            'body' => fake()->sentence(),
            'status' => WhatsAppMessage::QUEUED,
        ];
    }

    public function sent(): static
    {
        return $this->state(fn (): array => ['status' => WhatsAppMessage::SENT, 'sent_at' => now(), 'provider_message_id' => fake()->uuid()]);
    }

    public function failed(): static
    {
        return $this->state(fn (): array => ['status' => WhatsAppMessage::FAILED, 'error' => 'you are not logged in']);
    }
}
