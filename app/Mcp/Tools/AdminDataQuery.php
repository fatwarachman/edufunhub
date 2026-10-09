<?php

namespace App\Mcp\Tools;

use App\Mcp\AdminAccess;
use App\Services\Ai\AdminAssistantData;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Database\QueryException;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('admin-data-query')]
#[Description('Query bounded read-only admin projections. Read admin-context for operation-specific filters. player requires user_id. No SQL, writes, private chat or arbitrary fields. Dates default to last 30 calendar days; responses carry source and query time.')]
#[IsReadOnly]
#[IsOpenWorld(false)]
class AdminDataQuery extends Tool
{
    public function handle(Request $request): Response
    {
        $actor = AdminAccess::authorize($request->user());
        try {
            return Response::json((new AdminAssistantData($actor))->query($request->all()));
        } catch (QueryException) {
            return Response::error(__('ai_assistant.provider_error'));
        }
    }

    /** @return array<string, mixed> */
    public function schema(JsonSchema $schema): array
    {
        $games = collect(config('game-catalog.categories', []))->flatMap(fn (array $category): array => $category['games'])->pluck('key')->all();

        return [
            'operation' => $schema->string()->enum(AdminAssistantData::OPERATIONS)->required(),
            'search' => $schema->string()->min(2)->max(100)->description('Only players: name, nickname or school.'),
            'user_id' => $schema->integer()->min(1)->description('Required for player; optional for results, matches, points and screen_time.'),
            'game' => $schema->string()->enum($games)->description('Only results, matches and ads.'),
            'from' => $schema->string()->format('date')->description('Inclusive start date YYYY-MM-DD.'),
            'to' => $schema->string()->format('date')->description('Inclusive end date YYYY-MM-DD.'),
        ];
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        $definition = parent::toArray();
        $definition['inputSchema']['additionalProperties'] = false;

        return $definition;
    }
}
