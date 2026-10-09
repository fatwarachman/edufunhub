<?php

namespace App\Ai\Tools;

use App\Mcp\AdminAssistantSession;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Laravel\Mcp\Server\Tool as McpTool;

class AdminMcpTool implements Tool
{
    public function __construct(private AdminAssistantSession $session, private McpTool $tool) {}

    public function name(): string
    {
        return $this->tool->name();
    }

    public function description(): string
    {
        return $this->tool->description();
    }

    public function schema(JsonSchema $schema): array
    {
        return $this->tool->schema($schema);
    }

    public function handle(Request $request): string
    {
        return $this->session->call($this->name(), $request->all());
    }
}
