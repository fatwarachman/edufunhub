<?php

use App\Http\Controllers\AdController;
use App\Http\Controllers\Admin\ImpersonationController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\CharacterController;
use App\Http\Controllers\Chat\ChatController;
use App\Http\Controllers\CrosswordController;
use App\Http\Controllers\FlagQuestController;
use App\Http\Controllers\GameInviteController;
use App\Http\Controllers\GradeController;
use App\Http\Controllers\KnowledgeTrainController;
use App\Http\Controllers\FloorDropController;
use App\Http\Controllers\MiniGameController;
use App\Http\Controllers\PlayerDetailsController;
use App\Http\Controllers\PlayerNotificationController;
use App\Http\Controllers\PortalController;
use App\Http\Controllers\QuizDuelController;
use App\Http\Controllers\SkyQuizController;
use App\Http\Controllers\SnakesAndLaddersController;
use App\Http\Controllers\Teacher\TeacherQuestionController;
use App\Http\Controllers\UserDashboardController;
use App\Http\Middleware\EnsurePlayerDetailsComplete;
use App\Http\Middleware\EnsurePlayerIsActive;
use App\Http\Middleware\EnsureTeacher;
use App\Http\Middleware\RecordGameAccess;
use App\Services\Ads\AdMedia;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Http\Controllers\AuthenticatedSessionController;

// 1. Landing Page (Bauhaus Geometric)
Route::get('/', function () {
    return response()->file(public_path('new-landing/index.html'));
})->name('home');

Route::middleware(['auth', EnsurePlayerIsActive::class])->group(function (): void {
    Route::get('/dashboard', UserDashboardController::class)->name('dashboard');
    Route::get('/portal', PortalController::class)->name('portal');
    Route::get('/character', [CharacterController::class, 'show'])->name('character.show');
    Route::patch('/character', [CharacterController::class, 'update'])->name('character.update');
    Route::post('/character/items/{item}/buy', [CharacterController::class, 'buy'])->middleware('throttle:30,1')->name('character.buy');
    Route::post('/vault/{item}/wear', [CharacterController::class, 'wear'])->middleware('throttle:60,1')->name('vault.wear');
    Route::get('/notifications', [PlayerNotificationController::class, 'index'])->name('player-notifications.index');
    Route::post('/notifications/read', [PlayerNotificationController::class, 'readAll'])->name('player-notifications.read-all');
    Route::post('/notifications/{id}/read', [PlayerNotificationController::class, 'read'])->whereUuid('id')->name('player-notifications.read');
    Route::patch('/grade', [GradeController::class, 'update'])->name('grade.update');
    Route::patch('/player-details', [PlayerDetailsController::class, 'update'])->name('player-details.update');

    // Player chat: Laravel stores, the Go chat container delivers live.
    Route::prefix('chat')->name('chat.')->group(function (): void {
        Route::get('/', [ChatController::class, 'index'])->name('index');
        Route::get('/inbox', [ChatController::class, 'inbox'])->name('inbox');
        Route::post('/token', [ChatController::class, 'token'])->middleware('throttle:30,1')->name('token');
        Route::get('/people', [ChatController::class, 'people'])->middleware('throttle:60,1')->name('people');
        Route::post('/direct', [ChatController::class, 'direct'])->middleware('throttle:30,1')->name('direct');
        Route::post('/groups', [ChatController::class, 'storeGroup'])->middleware('throttle:10,1')->name('groups.store');
        Route::get('/conversations/{conversation}', [ChatController::class, 'show'])->name('show');
        Route::patch('/groups/{conversation}', [ChatController::class, 'updateGroup'])->middleware('throttle:30,1')->name('groups.update');
        Route::post('/groups/{conversation}/leave', [ChatController::class, 'leave'])->name('groups.leave');
        Route::post('/conversations/{conversation}/messages', [ChatController::class, 'send'])->middleware('throttle:chat')->name('send');
        Route::post('/conversations/{conversation}/read', [ChatController::class, 'read'])->name('read');
    });

    // Teacher portal: question statistics, authoring and CSV import.
    Route::middleware(EnsureTeacher::class)->prefix('teacher')->name('teacher.')->group(function (): void {
        Route::get('/questions/import', [TeacherQuestionController::class, 'importForm'])->name('questions.import');
        Route::post('/questions/import', [TeacherQuestionController::class, 'import'])->middleware('throttle:10,1')->name('questions.import.store');
        Route::get('/questions/template', [TeacherQuestionController::class, 'template'])->name('questions.template');
        Route::resource('questions', TeacherQuestionController::class)->except(['show']);
    });

    Route::middleware(EnsurePlayerDetailsComplete::class)->group(function (): void {
        Route::get('/games/flag-quest', [FlagQuestController::class, 'show'])->middleware(RecordGameAccess::class.':flag-quest')->name('games.flag-quest');
        Route::post('/games/flag-quest/token', [FlagQuestController::class, 'token'])->middleware('throttle:30,1')->name('games.flag-quest.token');
        Route::get('/games/quiz-duel', [QuizDuelController::class, 'show'])->middleware(RecordGameAccess::class.':quiz-duel')->name('games.quiz-duel');
        Route::post('/games/quiz-duel/token', [QuizDuelController::class, 'token'])->middleware('throttle:30,1')->name('games.quiz-duel.token');
        Route::get('/games/knowledge-train', [KnowledgeTrainController::class, 'show'])->middleware(RecordGameAccess::class.':knowledge-train')->name('games.knowledge-train');
        Route::post('/games/knowledge-train/token', [KnowledgeTrainController::class, 'token'])->middleware('throttle:30,1')->name('games.knowledge-train.token');
        Route::get('/games/crossword', [CrosswordController::class, 'show'])->middleware(RecordGameAccess::class.':crossword')->name('games.crossword');
        Route::post('/games/crossword/token', [CrosswordController::class, 'token'])->middleware('throttle:30,1')->name('games.crossword.token');
        foreach (MiniGameController::GAMES as $miniGame) {
            Route::get('/games/'.$miniGame, [MiniGameController::class, 'show'])->defaults('game', $miniGame)->middleware(RecordGameAccess::class.':'.$miniGame)->name('games.'.$miniGame);
            Route::post('/games/'.$miniGame.'/token', [MiniGameController::class, 'token'])->defaults('game', $miniGame)->middleware('throttle:30,1')->name('games.'.$miniGame.'.token');
        }
        Route::get('/games/floor-drop', [FloorDropController::class, 'show'])->middleware(RecordGameAccess::class.':floor-drop')->name('games.floor-drop');
        Route::post('/games/floor-drop/token', [FloorDropController::class, 'token'])->middleware('throttle:30,1')->name('games.floor-drop.token');
        Route::get('/games/{game}/join/{pin}', GameInviteController::class)->where(['game' => '[a-z-]+', 'pin' => '[0-9]{6}'])->name('games.join');
        Route::post('/games/snakes-and-ladders/token', [SnakesAndLaddersController::class, 'token'])->middleware('throttle:30,1')->name('games.snakes-and-ladders.token');
    });
});

// Leaving "login as" runs as the impersonated user, so it sits outside the admin group.
Route::post('/admin/impersonate/leave', [ImpersonationController::class, 'leave'])->middleware('auth')->name('admin.impersonate.leave');

// Ads: media, tracking and click-through (guests see ads in demo games too).
Route::get('/ads/media/{path}', [AdController::class, 'media'])->where('path', AdMedia::PATH_PATTERN)->name('ads.media');
Route::post('/ads/track', [AdController::class, 'track'])->middleware('throttle:120,1')->name('ads.track');
Route::get('/ads/click', [AdController::class, 'click'])->middleware('throttle:60,1')->name('ads.click');

// 2. Legal Pages
Route::inertia('/privacy', 'legal/privacy')->name('legal.privacy');
Route::inertia('/terms', 'legal/terms')->name('legal.terms');

// 3. Games Arena & EduFun Games
Route::get('/gamelist', function () {
    return Inertia::render('games/index');
})->name('gamelist');

// Guests may try the demos; signed-in players must complete their details first.
Route::middleware(EnsurePlayerDetailsComplete::class)->group(function (): void {
    Route::get('/games/snakes-and-ladders', [SnakesAndLaddersController::class, 'show'])->middleware(RecordGameAccess::class.':snakes-and-ladders')->name('games.snakes-and-ladders');

    Route::get('/games/sky-quiz', [SkyQuizController::class, 'show'])->middleware(RecordGameAccess::class.':sky-quiz')->name('games.sky-quiz');
});

Route::post('/games/sky-quiz/token', [SkyQuizController::class, 'token'])
    ->middleware(['auth', EnsurePlayerIsActive::class, EnsurePlayerDetailsComplete::class, 'throttle:30,1'])
    ->name('games.sky-quiz.token');

// ── Auth Routes ──────────────────────────────────────────────
Route::middleware('guest')->group(function (): void {
    Route::get('/admin/login', [LoginController::class, 'showLoginForm'])->name('admin.login');
    Route::post('/admin/login', [AuthenticatedSessionController::class, 'store'])->middleware('throttle:login')->name('admin.login.store');
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
