<?php

use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\PermissionController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
|
| Routes grouped under prefix 'admin' with web, auth, verified, and
| EnsureAdmin middleware. Registered via bootstrap/app.php `then` callback.
|
*/

Route::middleware(['web', 'auth', 'verified', \App\Http\Middleware\EnsureAdmin::class])
    ->prefix('admin')
    ->name('admin.')
    ->group(function (): void {

        // Dashboard
        Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

        // Users CRUD + toggle status
        Route::resource('users', UserController::class);
        Route::patch('/users/{user}/toggle-status', [UserController::class, 'toggleStatus'])->name('users.toggle-status');

        // Roles CRUD
        Route::resource('roles', RoleController::class)->except(['show']);

        // Permissions (read-only)
        Route::get('/permissions', [PermissionController::class, 'index'])->name('permissions.index');

        // Activity Log
        Route::get('/activity-log', [ActivityLogController::class, 'index'])->name('activity-log.index');
    });
