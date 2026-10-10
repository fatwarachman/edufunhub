<?php

use App\Http\Controllers\AbilityController;
use App\Http\Controllers\AdController;
use App\Http\Controllers\Admin\ImpersonationController;
use App\Http\Controllers\AndroidAssetLinksController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\BlockBattleController;
use App\Http\Controllers\CharacterController;
use App\Http\Controllers\Chat\ChatController;
use App\Http\Controllers\CrosswordController;
use App\Http\Controllers\EconomyHeistController;
use App\Http\Controllers\FeedbackController;
use App\Http\Controllers\FlagQuestController;
use App\Http\Controllers\FloorDropController;
use App\Http\Controllers\FriendController;
use App\Http\Controllers\GameInviteController;
use App\Http\Controllers\GameListController;
use App\Http\Controllers\GradeController;
use App\Http\Controllers\JoinByPinController;
use App\Http\Controllers\KnowledgeTrainController;
use App\Http\Controllers\LandingStatsController;
use App\Http\Controllers\LeaderboardController;
use App\Http\Controllers\LocaleController;
use App\Http\Controllers\MiniGameController;
use App\Http\Controllers\MonsterCafeController;
use App\Http\Controllers\OnlinePlayersController;
use App\Http\Controllers\OrderRushController;
use App\Http\Controllers\PingPongController;
use App\Http\Controllers\PlayerDetailsController;
use App\Http\Controllers\PlayerNotificationController;
use App\Http\Controllers\PlayerPageController;
use App\Http\Controllers\PortalController;
use App\Http\Controllers\PortSorterController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProfileWizardController;
use App\Http\Controllers\QuizDuelController;
use App\Http\Controllers\RegencyController;
use App\Http\Controllers\SchoolListController;
use App\Http\Controllers\SchoolSuggestionController;
use App\Http\Controllers\ScreenTimeController;
use App\Http\Controllers\SkyQuizController;
use App\Http\Controllers\SnakeGameController;
use App\Http\Controllers\SnakesAndLaddersController;
use App\Http\Controllers\Teacher\TeacherQuestionController;
use App\Http\Controllers\TurboTriviaController;
use App\Http\Controllers\UserDashboardController;
use App\Http\Middleware\EnsurePlayerDetailsComplete;
use App\Http\Middleware\EnsurePlayerIsActive;
use App\Http\Middleware\EnsureTeacher;
use App\Http\Middleware\RecordGameAccess;
use App\Services\Ads\AdMedia;
use App\Services\ProfilePhoto;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Http\Controllers\AuthenticatedSessionController;

// 1. Landing Page (Bauhaus Geometric)
Route::get('/', function () {
    return response()->file(public_path('new-landing/index.html'));
})->name('home');

Route::get('/about', function () {
    return response()->file(public_path('new-landing/about.html'));
})->name('about');

Route::get('/.well-known/assetlinks.json', AndroidAssetLinksController::class)->name('android.asset-links');

Route::get('/landing/stats', LandingStatsController::class)->middleware('throttle:60,1,landing.stats')->name('landing.stats');
Route::get('/player-details/regencies', RegencyController::class)->middleware('throttle:30,1,player-details.regencies')->name('player-details.regencies');
Route::get('/player-details/school-list', SchoolListController::class)->middleware('throttle:120,1,player-details.school-list')->name('player-details.school-list');

Route::middleware(['auth', EnsurePlayerIsActive::class])->group(function (): void {
    Route::get('/dashboard', UserDashboardController::class)->name('dashboard');
    Route::get('/portal', PortalController::class)->name('portal');
    Route::get('/leaderboard', LeaderboardController::class)->name('leaderboard');
    Route::get('/leaderboard/games/{game}', [LeaderboardController::class, 'game'])->where('game', '[a-z-]+')->middleware('throttle:game-leaderboard')->name('leaderboard.game');
    Route::get('/join/{pin}', JoinByPinController::class)->where('pin', '[0-9]{6}')->middleware('throttle:join-pin')->name('join.pin');
    Route::get('/join/{pin}/rooms', [JoinByPinController::class, 'lookup'])->where('pin', '[0-9]{6}')->middleware('throttle:join-pin')->name('join.pin.rooms');
    Route::get('/ability', [AbilityController::class, 'mine'])->name('ability.mine');
    Route::get('/a/{code}', [AbilityController::class, 'show'])->where('code', '[A-Za-z0-9]{8}')->middleware('throttle:60,1,ability.show')->name('ability.show');
    Route::get('/character', [CharacterController::class, 'show'])->name('character.show');
    Route::patch('/character', [CharacterController::class, 'update'])->name('character.update');
    Route::post('/character/items/{item}/buy', [CharacterController::class, 'buy'])->middleware('throttle:30,1,character.buy')->name('character.buy');
    Route::post('/vault/{item}/wear', [CharacterController::class, 'wear'])->middleware('throttle:60,1,vault.wear')->name('vault.wear');
    Route::get('/notifications', [PlayerNotificationController::class, 'index'])->name('player-notifications.index');
    Route::post('/notifications/read', [PlayerNotificationController::class, 'readAll'])->name('player-notifications.read-all');
    Route::post('/notifications/{id}/read', [PlayerNotificationController::class, 'read'])->whereUuid('id')->name('player-notifications.read');
    Route::patch('/grade', [GradeController::class, 'update'])->name('grade.update');
    Route::get('/profile', [ProfileController::class, 'show'])->name('profile.show');
    Route::patch('/profile', [ProfileController::class, 'update'])->middleware('throttle:profile')->name('profile.update');
    Route::put('/profile/password', [ProfileController::class, 'password'])->middleware('throttle:profile-password')->name('profile.password');
    Route::post('/profile/photo', [ProfileController::class, 'photo'])->middleware('throttle:profile-photo')->name('profile.photo.update');
    Route::delete('/profile/photo', [ProfileController::class, 'destroyPhoto'])->middleware('throttle:profile-photo')->name('profile.photo.destroy');
    Route::get('/profile/photo/{file}', [ProfileController::class, 'showPhoto'])->where('file', ProfilePhoto::FILE_PATTERN)->name('profile.photo.show');
    Route::get('/players/online', OnlinePlayersController::class)->middleware('throttle:60,1,players.online')->name('players.online');
    Route::get('/players/online/count', [OnlinePlayersController::class, 'count'])->middleware('throttle:30,1,players.online.count')->name('players.online.count');
    Route::get('/players/{user}', PlayerPageController::class)->whereNumber('user')->middleware('throttle:60,1,players.show')->name('players.show');
    Route::patch('/player-details', [PlayerDetailsController::class, 'update'])->name('player-details.update');
    Route::post('/profile/wizard', [ProfileWizardController::class, 'store'])->middleware('throttle:20,1,profile-wizard')->name('profile-wizard.store');
    Route::post('/screen-time/beat', [ScreenTimeController::class, 'beat'])->middleware('throttle:10,1,screen-time.beat')->name('screen-time.beat');
    Route::get('/feedback', [FeedbackController::class, 'index'])->name('feedback.index');
    Route::post('/feedback', [FeedbackController::class, 'store'])->middleware('throttle:feedback')->name('feedback.store');
    Route::get('/player-details/schools', SchoolSuggestionController::class)->middleware('throttle:60,1,player-details.schools')->name('player-details.schools');

    // Friends: list with live online status, requests and add friend.
    Route::prefix('friends')->name('friends.')->group(function (): void {
        Route::get('/', [FriendController::class, 'index'])->name('index');
        Route::get('/search', [FriendController::class, 'search'])->middleware('throttle:60,1,friends.search')->name('search');
        Route::post('/', [FriendController::class, 'store'])->middleware('throttle:20,1,friends.store')->name('store');
        Route::post('/{friendship}/accept', [FriendController::class, 'accept'])->middleware('throttle:30,1,friends.respond')->name('accept');
        Route::post('/{friendship}/decline', [FriendController::class, 'decline'])->middleware('throttle:30,1,friends.respond')->name('decline');
        Route::delete('/{friendship}', [FriendController::class, 'destroy'])->middleware('throttle:30,1,friends.respond')->name('destroy');
    });

    // Player chat: Laravel stores, the Go chat container delivers live.
    Route::prefix('chat')->name('chat.')->group(function (): void {
        Route::get('/', [ChatController::class, 'index'])->name('index');
        Route::get('/inbox', [ChatController::class, 'inbox'])->name('inbox');
        Route::post('/token', [ChatController::class, 'token'])->middleware('throttle:30,1,chat.token')->name('token');
        Route::get('/people', [ChatController::class, 'people'])->middleware('throttle:60,1,chat.people')->name('people');
        Route::post('/direct', [ChatController::class, 'direct'])->middleware('throttle:30,1,chat.direct')->name('direct');
        Route::post('/groups', [ChatController::class, 'storeGroup'])->middleware('throttle:10,1,groups.store')->name('groups.store');
        Route::get('/conversations/{conversation}', [ChatController::class, 'show'])->name('show');
        Route::patch('/groups/{conversation}', [ChatController::class, 'updateGroup'])->middleware('throttle:30,1,groups.update')->name('groups.update');
        Route::post('/groups/{conversation}/leave', [ChatController::class, 'leave'])->name('groups.leave');
        Route::post('/conversations/{conversation}/messages', [ChatController::class, 'send'])->middleware('throttle:chat')->name('send');
        Route::post('/conversations/{conversation}/read', [ChatController::class, 'read'])->name('read');
    });

    // Teacher portal: question statistics, authoring and CSV import.
    Route::middleware(EnsureTeacher::class)->prefix('teacher')->name('teacher.')->group(function (): void {
        Route::get('/questions/import', [TeacherQuestionController::class, 'importForm'])->name('questions.import');
        Route::post('/questions/import', [TeacherQuestionController::class, 'import'])->middleware('throttle:10,1,questions.import.store')->name('questions.import.store');
        Route::get('/questions/template', [TeacherQuestionController::class, 'template'])->name('questions.template');
        Route::resource('questions', TeacherQuestionController::class)->except(['show']);
    });

    Route::middleware(EnsurePlayerDetailsComplete::class)->group(function (): void {
        Route::get('/games/flag-quest', [FlagQuestController::class, 'show'])->middleware(RecordGameAccess::class.':flag-quest')->name('games.flag-quest');
        Route::post('/games/flag-quest/token', [FlagQuestController::class, 'token'])->middleware('throttle:30,1,games.flag-quest.token')->name('games.flag-quest.token');
        Route::get('/games/quiz-duel', [QuizDuelController::class, 'show'])->middleware(RecordGameAccess::class.':quiz-duel')->name('games.quiz-duel');
        Route::post('/games/quiz-duel/token', [QuizDuelController::class, 'token'])->middleware('throttle:30,1,games.quiz-duel.token')->name('games.quiz-duel.token');
        Route::get('/games/knowledge-train', [KnowledgeTrainController::class, 'show'])->middleware(RecordGameAccess::class.':knowledge-train')->name('games.knowledge-train');
        Route::post('/games/knowledge-train/token', [KnowledgeTrainController::class, 'token'])->middleware('throttle:30,1,games.knowledge-train.token')->name('games.knowledge-train.token');
        Route::get('/games/crossword', [CrosswordController::class, 'show'])->middleware(RecordGameAccess::class.':crossword')->name('games.crossword');
        Route::post('/games/crossword/token', [CrosswordController::class, 'token'])->middleware('throttle:30,1,games.crossword.token')->name('games.crossword.token');
        foreach (MiniGameController::GAMES as $miniGame) {
            Route::get('/games/'.$miniGame, [MiniGameController::class, 'show'])->defaults('game', $miniGame)->middleware(RecordGameAccess::class.':'.$miniGame)->name('games.'.$miniGame);
            Route::post('/games/'.$miniGame.'/token', [MiniGameController::class, 'token'])->defaults('game', $miniGame)->middleware('throttle:30,1,'.$miniGame.'-token')->name('games.'.$miniGame.'.token');
        }
        Route::get('/games/floor-drop', [FloorDropController::class, 'show'])->middleware(RecordGameAccess::class.':floor-drop')->name('games.floor-drop');
        Route::post('/games/floor-drop/token', [FloorDropController::class, 'token'])->middleware('throttle:30,1,games.floor-drop.token')->name('games.floor-drop.token');
        Route::get('/games/economy-heist', [EconomyHeistController::class, 'show'])->middleware(RecordGameAccess::class.':economy-heist')->name('games.economy-heist');
        Route::post('/games/economy-heist/token', [EconomyHeistController::class, 'token'])->middleware('throttle:30,1,games.economy-heist.token')->name('games.economy-heist.token');
        Route::get('/games/order-rush', [OrderRushController::class, 'show'])->middleware(RecordGameAccess::class.':order-rush')->name('games.order-rush');
        Route::post('/games/order-rush/token', [OrderRushController::class, 'token'])->middleware('throttle:30,1,games.order-rush.token')->name('games.order-rush.token');
        Route::get('/games/port-sorter', [PortSorterController::class, 'show'])->middleware(RecordGameAccess::class.':port-sorter')->name('games.port-sorter');
        Route::post('/games/port-sorter/token', [PortSorterController::class, 'token'])->middleware('throttle:30,1,games.port-sorter.token')->name('games.port-sorter.token');
        Route::get('/games/turbo-trivia', [TurboTriviaController::class, 'show'])->middleware(RecordGameAccess::class.':turbo-trivia')->name('games.turbo-trivia');
        Route::post('/games/turbo-trivia/token', [TurboTriviaController::class, 'token'])->middleware('throttle:30,1,games.turbo-trivia.token')->name('games.turbo-trivia.token');
        Route::get('/games/turbo-trivia/qr/{pin}', [TurboTriviaController::class, 'qr'])->where('pin', '[0-9]{6}')->middleware('throttle:60,1,games.turbo-trivia.qr')->name('games.turbo-trivia.qr');
        Route::get('/arena/turbo-trivia/{pin?}', [TurboTriviaController::class, 'arena'])->where('pin', '[0-9]{6}')->middleware(RecordGameAccess::class.':turbo-trivia')->name('games.turbo-trivia.arena');
        Route::get('/play/turbo-trivia/{pin?}', [TurboTriviaController::class, 'play'])->where('pin', '[0-9]{6}')->middleware(RecordGameAccess::class.':turbo-trivia')->name('games.turbo-trivia.play');
        Route::get('/games/block-battle', [BlockBattleController::class, 'show'])->middleware(RecordGameAccess::class.':block-battle')->name('games.block-battle');
        Route::post('/games/block-battle/token', [BlockBattleController::class, 'token'])->middleware('throttle:30,1,games.block-battle.token')->name('games.block-battle.token');
        Route::get('/games/monster-cafe', [MonsterCafeController::class, 'show'])->middleware(RecordGameAccess::class.':monster-cafe')->name('games.monster-cafe');
        Route::post('/games/monster-cafe/token', [MonsterCafeController::class, 'token'])->middleware('throttle:30,1,games.monster-cafe.token')->name('games.monster-cafe.token');
        Route::get('/games/block-battle/qr/{pin}', [BlockBattleController::class, 'qr'])->where('pin', '[0-9]{6}')->middleware('throttle:60,1,games.block-battle.qr')->name('games.block-battle.qr');
        Route::get('/arena/block-battle/{pin?}', [BlockBattleController::class, 'arena'])->where('pin', '[0-9]{6}')->middleware(RecordGameAccess::class.':block-battle')->name('games.block-battle.arena');
        Route::get('/play/block-battle/{pin?}', [BlockBattleController::class, 'play'])->where('pin', '[0-9]{6}')->middleware(RecordGameAccess::class.':block-battle')->name('games.block-battle.play');
        Route::get('/games/ping-pong', [PingPongController::class, 'show'])->middleware(RecordGameAccess::class.':ping-pong')->name('games.ping-pong');
        Route::post('/games/ping-pong/token', [PingPongController::class, 'token'])->middleware('throttle:30,1,games.ping-pong.token')->name('games.ping-pong.token');
        Route::get('/games/{game}/join/{pin}', GameInviteController::class)->where(['game' => '[a-z-]+', 'pin' => '[0-9]{6}'])->name('games.join');
        Route::post('/games/snakes-and-ladders/token', [SnakesAndLaddersController::class, 'token'])->middleware('throttle:30,1,games.snakes-and-ladders.token')->name('games.snakes-and-ladders.token');
        Route::get('/games/snakes-and-ladders', [SnakesAndLaddersController::class, 'show'])->middleware(RecordGameAccess::class.':snakes-and-ladders')->name('games.snakes-and-ladders');
        Route::get('/games/sky-quiz', [SkyQuizController::class, 'show'])->middleware(RecordGameAccess::class.':sky-quiz')->name('games.sky-quiz');
        Route::post('/games/sky-quiz/token', [SkyQuizController::class, 'token'])->middleware('throttle:30,1,games.sky-quiz.token')->name('games.sky-quiz.token');
        Route::get('/games/snake', [SnakeGameController::class, 'show'])->middleware(RecordGameAccess::class.':snake')->name('games.snake');
        Route::get('/games/snake/arena/{code?}', [SnakeGameController::class, 'arena'])->middleware(RecordGameAccess::class.':snake')->name('games.snake.arena');
        Route::get('/arena/snake/{code?}', [SnakeGameController::class, 'arena'])->middleware(RecordGameAccess::class.':snake')->name('games.snake.arena.alias');
        Route::post('/games/snake/token', [SnakeGameController::class, 'token'])->middleware('throttle:30,1,games.snake.token')->name('games.snake.token');
    });
});

// Leaving "login as" runs as the impersonated user, so it sits outside the admin group.
Route::post('/admin/impersonate/leave', [ImpersonationController::class, 'leave'])->middleware('auth')->name('admin.impersonate.leave');

// Ads: media, tracking and click-through (guests see ads in demo games too).
Route::get('/ads/media/{path}', [AdController::class, 'media'])->where('path', AdMedia::PATH_PATTERN)->name('ads.media');
Route::post('/ads/track', [AdController::class, 'track'])->middleware('throttle:120,1,ads.track')->name('ads.track');
Route::get('/ads/click', [AdController::class, 'click'])->middleware('throttle:60,1,ads.click')->name('ads.click');

// Language preference: session for guests, saved on the account when signed in.
Route::patch('/locale', [LocaleController::class, 'update'])->middleware('throttle:30,1,locale.update')->name('locale.update');

// 2. Legal Pages
Route::inertia('/privacy', 'legal/privacy')->name('legal.privacy');
Route::inertia('/terms', 'legal/terms')->name('legal.terms');

// 3. Games Arena & EduFun Games
Route::get('/gamelist', GameListController::class)->name('gamelist');

// ── Auth Routes ──────────────────────────────────────────────
Route::middleware('guest')->group(function (): void {
    Route::get('/admin/login', [LoginController::class, 'showLoginForm'])->name('admin.login');
    Route::post('/admin/login', [AuthenticatedSessionController::class, 'store'])->middleware('throttle:login')->name('admin.login.store');
    Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect'])->middleware('throttle:10,1,google')->name('google.redirect');
    Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback'])->middleware('throttle:10,1,google')->name('google.callback');
    Route::get('/login', [LoginController::class, 'showLoginForm'])->name('login');
    Route::get('/register', [RegisterController::class, 'showRegisterForm'])->name('register');
    Route::post('/register', [RegisterController::class, 'store'])->middleware('throttle:5,1,register.store')->name('register.store');
    Route::get('/register/schools', SchoolSuggestionController::class)->middleware('throttle:30,1,register.schools')->name('register.schools');
});

// POST /logout is handled by Fortify automatically.

// ── Admin Redirect ───────────────────────────────────────────
Route::get('/admin', function () {
    return redirect()->route('admin.dashboard');
})->middleware(['auth', 'verified'])->name('admin');
