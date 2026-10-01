<?php

use App\Http\Middleware\AuthenticateApiKey;
use App\Http\Middleware\EnforceWorkspaceIpAllowlist;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsurePasswordNotExpired;
use App\Http\Middleware\EnsureSuperadmin;
use App\Http\Middleware\EnsureUserIsOnboarded;
use App\Http\Middleware\EnsureWorkspaceAccess;
use App\Http\Middleware\EnsureWorkspaceAdmin;
use App\Http\Middleware\EnsureWorkspaceNotSuspended;
use App\Http\Middleware\EnsureWorkspaceOwner;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\PreventRequestsDuringMaintenance;
use App\Http\Middleware\RequestId;
use App\Http\Middleware\RequireTwoFactor;
use App\Http\Middleware\SetLocale;
use App\Http\Middleware\TrackLastSeen;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
        then: function (): void {
            require __DIR__.'/../routes/admin.php';
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Behind Cloudflare Tunnel + nginx gateway: honour X-Forwarded-* from private networks.
        $middleware->trustProxies(
            at: ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
            headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_HOST | Request::HEADER_X_FORWARDED_PORT | Request::HEADER_X_FORWARDED_PROTO,
        );

        $middleware->replace(
            Illuminate\Foundation\Http\Middleware\PreventRequestsDuringMaintenance::class,
            PreventRequestsDuringMaintenance::class
        );

        $middleware->web(prepend: [RequestId::class]);
        $middleware->api(prepend: [RequestId::class]);

        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->validateCsrfTokens(except: [
            'stripe/*', // Exclude Stripe webhooks from CSRF
        ]);

        $middleware->web(append: [
            RequestId::class,
            SetLocale::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
            EnsurePasswordNotExpired::class,
            TrackLastSeen::class,
        ]);

        $middleware->api(append: [
            RequestId::class,
        ]);

        $middleware->alias([
            'superadmin' => EnsureSuperadmin::class,
            'admin' => EnsureAdmin::class,
            'workspace' => EnsureWorkspaceAccess::class,
            'workspace.ip' => EnforceWorkspaceIpAllowlist::class,
            'workspace.owner' => EnsureWorkspaceOwner::class,
            'workspace.admin' => EnsureWorkspaceAdmin::class,
            'workspace.suspended' => EnsureWorkspaceNotSuspended::class,
            'onboarded' => EnsureUserIsOnboarded::class,
            'require2fa' => RequireTwoFactor::class,
            'api-key' => AuthenticateApiKey::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        Integration::handles($exceptions);

        $exceptions->respond(function (mixed $response, Throwable $e, Request $request) {
            $status = $response->getStatusCode();

            $isWebPage = $request->isMethod('GET') && ! $request->expectsJson() && ! $request->is('api/*', 'stripe/*');

            if (in_array($status, [403, 404, 429, 500, 503], true) && ($request->header('X-Inertia') || $isWebPage)) {
                $response = Inertia::render('error', ['status' => $status])
                    ->toResponse($request)
                    ->setStatusCode($status);
            }

            if ($id = $request->headers->get('X-Request-Id')) {
                $response->headers->set('X-Request-Id', $id);
            }

            return $response;
        });
    })->create();
