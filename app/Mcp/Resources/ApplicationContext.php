<?php

namespace App\Mcp\Resources;

use App\Mcp\AdminAccess;
use App\Mcp\ApplicationKnowledge;
use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Attributes\MimeType;
use Laravel\Mcp\Server\Attributes\Uri;
use Laravel\Mcp\Server\Resource;

#[Uri('edufunhub://admin/application-context')]
#[MimeType('application/json')]
#[Description('Reviewed EduFunHub application semantics and read-only admin query contract. Not live operational data.')]
class ApplicationContext extends Resource
{
    public function handle(Request $request): Response
    {
        AdminAccess::authorize($request->user());

        return Response::json(ApplicationKnowledge::context());
    }
}
