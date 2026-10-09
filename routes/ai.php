<?php

use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsureSuperadmin;
use App\Mcp\AdminAccess;
use App\Mcp\Servers\AdminServer;
use Illuminate\Support\Facades\Route;
use Laravel\Mcp\Facades\Mcp;

Route::middleware(['web', 'auth', 'verified', EnsureAdmin::class, EnsureSuperadmin::class, AdminAccess::class, 'throttle:60,1'])->group(function (): void {
    Mcp::web('/mcp/admin', AdminServer::class)->name('mcp.admin');
});
