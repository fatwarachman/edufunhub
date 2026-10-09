<?php

namespace App\Ai\Tools;

use App\Services\Ai\AdminAssistantData;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Validation\ValidationException;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;

class AdminAssistantQuery implements Tool
{
    public function __construct(private AdminAssistantData $data) {}

    public function description(): string
    {
        return 'Read live EduFunHub data. Operations: catalog (game configuration); players (search name/nickname/school, max 20); player (required user_id, profile plus stats); results (game history); matches; points (net includes shop spending); questions (current bank and dated answer stats); screen_time (active screen seconds); ads (impressions/clicks/plays). Optional from/to YYYY-MM-DD, inclusive, default last 30 days, max 366 days. game filter only results/matches/ads; user_id only player/results/matches/points/screen_time; search only players. Omit unused filters, never send null. No SQL or custom fields. Catalog and players ignore dates; do not send them. Recent lists max 20, not exhaustive. Returned source URL and timestamp are authoritative.';
    }

    public function handle(Request $request): string
    {
        $this->data->authorize();
        try {
            return json_encode($this->data->query($request->all()), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        } catch (ValidationException) {
            return json_encode(['error' => __('ai_assistant.invalid_filter')], JSON_THROW_ON_ERROR);
        }
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'operation' => $schema->string()->enum(AdminAssistantData::OPERATIONS)->required(),
            'search' => $schema->string()->description('Name, nickname or school, 2-100 characters.'),
            'user_id' => $schema->integer()->min(1),
            'game' => $schema->string()->description('Exact key from catalog.'),
            'from' => $schema->string()->description('Inclusive date YYYY-MM-DD.'),
            'to' => $schema->string()->description('Inclusive date YYYY-MM-DD.'),
        ];
    }
}
