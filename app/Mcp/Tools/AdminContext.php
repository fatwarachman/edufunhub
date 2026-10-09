<?php

namespace App\Mcp\Tools;

use App\Mcp\AdminAccess;
use App\Mcp\ApplicationKnowledge;
use Illuminate\Validation\ValidationException;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Tool;
use Laravel\Mcp\Server\Tools\Annotations\IsOpenWorld;
use Laravel\Mcp\Server\Tools\Annotations\IsReadOnly;

#[Name('admin-context')]
#[Description('Read EduFunHub architecture, domain semantics, safe query filters and privacy boundaries. No arguments.')]
#[IsReadOnly]
#[IsOpenWorld(false)]
class AdminContext extends Tool
{
    public function handle(Request $request): Response
    {
        AdminAccess::authorize($request->user());
        if ($request->all() !== []) {
            throw ValidationException::withMessages(['arguments' => __('ai_assistant.invalid_filter')]);
        }

        return Response::json(ApplicationKnowledge::context());
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        $definition = parent::toArray();
        $definition['inputSchema']['additionalProperties'] = false;

        return $definition;
    }
}
