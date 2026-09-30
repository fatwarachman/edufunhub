<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\CharacterController;
use App\Http\Controllers\UserDashboardController;
use App\Http\Middleware\EnsurePlayerIsActive;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response;

// 1. Landing Page (Bauhaus Geometric)
Route::get('/', function () {
    return response()->file(public_path('new-landing/index.html'));
})->name('home');

Route::middleware(['auth', EnsurePlayerIsActive::class])->group(function (): void {
    Route::get('/dashboard', UserDashboardController::class)->name('dashboard');
    Route::get('/character', [CharacterController::class, 'show'])->name('character.show');
    Route::patch('/character', [CharacterController::class, 'update'])->name('character.update');
});

// 3. Games Arena & EduFun Games
Route::get('/gamelist', function () {
    return Inertia::render('games/index');
})->name('gamelist');

Route::get('/games/snakes-and-ladders', function () {
    return Inertia::render('games/snakes-and-ladders');
})->name('games.snakes-and-ladders');

Route::get('/games/sky-quiz', function (): Response {
    return Inertia::render('games/sky-quiz');
})->name('games.sky-quiz');

// ── Auth Routes ──────────────────────────────────────────────
Route::middleware('guest')->group(function (): void {
    Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect'])->middleware('throttle:10,1')->name('google.redirect');
    Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback'])->middleware('throttle:10,1')->name('google.callback');
    Route::get('/login', [LoginController::class, 'showLoginForm'])->name('login');
    Route::get('/register', [RegisterController::class, 'showRegisterForm'])->name('register');
});

// POST /logout is handled by Fortify automatically.

// ── Admin Redirect ───────────────────────────────────────────
Route::get('/admin', function () {
    return redirect()->route('admin.dashboard');
})->middleware(['auth', 'verified'])->name('admin');
