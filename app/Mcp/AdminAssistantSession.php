<?php

namespace App\Mcp;

use App\Mcp\Servers\AdminServer;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request as HttpRequest;
use Laravel\Mcp\Request;
use Laravel\Mcp\Server\Methods\CallTool;
use Laravel\Mcp\Server\Transport\HttpTransport;
use Laravel\Mcp\Transport\JsonRpcRequest;

/** In-process MCP dispatcher. Actor and citations never enter shared container state. */
class AdminAssistantSession
{
    private array $retrievedSources = [];

    private int $calls = 0;

    public function __construct(private User $actor) {}

    public function authorize(): void
    {
        AdminAccess::authorize($this->actor);
    }

    public function tools(): array
    {
        $this->authorize();

        return (new AdminServer(new HttpTransport(new HttpRequest, 'admin-assistant')))->createContext()->tools()->all();
    }

    public function call(string $name, array $arguments = []): string
    {
        $this->authorize();
        abort_if(++$this->calls > 12, 429);
        $rpc = new JsonRpcRequest($this->calls, 'tools/call', ['name' => $name, 'arguments' => $arguments]);
        $request = new class($arguments, $this->actor) extends Request
        {
            public function __construct(array $arguments, private User $actor)
            {
                parent::__construct($arguments);
            }

            public function user(?string $guard = null): ?Authenticatable
            {
                return $this->actor;
            }
        };
        $previous = app()->bound('mcp.request') ? app('mcp.request') : null;
        $previousRequest = app()->bound(Request::class) ? app(Request::class) : null;
        app()->instance('mcp.request', $request);
        app()->instance(Request::class, $request);
        try {
            $context = (new AdminServer(new HttpTransport(new HttpRequest, 'admin-assistant')))->createContext();
            $response = app(CallTool::class)->handle($rpc, $context);
            $result = json_decode($response->toJson(), true, flags: JSON_THROW_ON_ERROR)['result'];
        } finally {
            $previous === null ? app()->forgetInstance('mcp.request') : app()->instance('mcp.request', $previous);
            $previousRequest === null ? app()->forgetInstance(Request::class) : app()->instance(Request::class, $previousRequest);
        }
        if ($result['isError'] ?? false) {
            return json_encode(['error' => __('ai_assistant.invalid_filter')], JSON_THROW_ON_ERROR);
        }
        $text = $result['content'][0]['text'] ?? '{}';
        $payload = json_decode($text, true, flags: JSON_THROW_ON_ERROR);
        if (isset($payload['source']['url'])) {
            $this->retrievedSources[$payload['source']['url']] = $payload['source'];
        }

        return $text;
    }

    public function sources(): array
    {
        return array_values($this->retrievedSources);
    }
}
