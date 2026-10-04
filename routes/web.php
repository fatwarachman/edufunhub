<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\CharacterController;
use App\Http\Controllers\FlagQuestController;
use App\Http\Controllers\GradeController;
use App\Http\Controllers\PlayerDetailsController;
use App\Http\Controllers\PortalController;
use App\Http\Controllers\SkyQuizController;
use App\Http\Controllers\UserDashboardController;
use App\Http\Middleware\EnsurePlayerDetailsComplete;
use App\Http\Middleware\EnsurePlayerIsActive;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// 1. Landing Page (Bauhaus Geometric)
Route::get('/', function () {
    return response()->file(public_path('new-landing/index.html'));
})->name('home');

Route::middleware(['auth', EnsurePlayerIsActive::class])->group(function (): void {
    Route::get('/dashboard', UserDashboardController::class)->name('dashboard');
    Route::get('/portal', PortalController::class)->name('portal');
    Route::get('/character', [CharacterController::class, 'show'])->name('character.show');
    Route::patch('/character', [CharacterController::class, 'update'])->name('character.update');
    Route::patch('/grade', [GradeController::class, 'update'])->name('grade.update');
    Route::patch('/player-details', [PlayerDetailsController::class, 'update'])->name('player-details.update');

    Route::middleware(EnsurePlayerDetailsComplete::class)->group(function (): void {
        Route::get('/games/flag-quest', [FlagQuestController::class, 'show'])->name('games.flag-quest');
        Route::post('/games/flag-quest/token', [FlagQuestController::class, 'token'])->middleware('throttle:30,1')->name('games.flag-quest.token');
    });
});

// 2. Legal Pages
Route::inertia('/privacy', 'legal/privacy')->name('legal.privacy');
Route::inertia('/terms', 'legal/terms')->name('legal.terms');

// 3. Games Arena & EduFun Games
Route::get('/gamelist', function () {
    return Inertia::render('games/index');
})->name('gamelist');

// Guests may try the demos; signed-in players must complete their details first.
Route::middleware(EnsurePlayerDetailsComplete::class)->group(function (): void {
    Route::get('/games/snakes-and-ladders', function () {
        return Inertia::render('games/snakes-and-ladders');
    })->name('games.snakes-and-ladders');

    Route::get('/games/sky-quiz', [SkyQuizController::class, 'show'])->name('games.sky-quiz');
});

Route::post('/games/sky-quiz/token', [SkyQuizController::class, 'token'])
    ->middleware(['auth', EnsurePlayerIsActive::class, EnsurePlayerDetailsComplete::class, 'throttle:30,1'])
    ->name('games.sky-quiz.token');

// ── Auth Routes ──────────────────────────────────────────────
Route::middleware('guest')->group(function (): void {
    Route::get('/admin/login', [LoginController::class, 'showLoginForm'])->name('admin.login');
    Route::post('/admin/login', [\Laravel\Fortify\Http\Controllers\AuthenticatedSessionController::class, 'store'])->middleware('throttle:login')->name('admin.login.store');
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
