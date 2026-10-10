<?php

use App\Http\Controllers\Admin\AbilityAssessmentController;
use App\Http\Controllers\Admin\ActivityLogController;
use App\Http\Controllers\Admin\AdController;
use App\Http\Controllers\Admin\AiAssistantController;
use App\Http\Controllers\Admin\AiSettingsController;
use App\Http\Controllers\Admin\ChangelogController;
use App\Http\Controllers\Admin\CharacterItemController;
use App\Http\Controllers\Admin\CompensationController;
use App\Http\Controllers\Admin\CrosswordWordController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\FeedbackController;
use App\Http\Controllers\Admin\GameSoundsController;
use App\Http\Controllers\Admin\GameStatisticsController;
use App\Http\Controllers\Admin\ImpersonationController;
use App\Http\Controllers\Admin\LeaderboardController;
use App\Http\Controllers\Admin\MatchHistoryController;
use App\Http\Controllers\Admin\PermissionController;
use App\Http\Controllers\Admin\PlayerNotificationController;
use App\Http\Controllers\Admin\PlayerSchoolGradeController;
use App\Http\Controllers\Admin\PlayingTimeController;
use App\Http\Controllers\Admin\PointRulesController;
use App\Http\Controllers\Admin\QuestionController;
use App\Http\Controllers\Admin\QuestionGenerationController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\ScreenTimeController;
use App\Http\Controllers\Admin\SequenceSetController;
use App\Http\Controllers\Admin\ServerMonitorController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\SorterSetController;
use App\Http\Controllers\Admin\SubjectController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\UserStatisticsController;
use App\Http\Controllers\Admin\WhatsAppController;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsureSuperadmin;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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

Route::middleware(['web', 'auth', EnsureAdmin::class, 'verified'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function (): void {

        // Dashboard
        Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

        // Users CRUD + toggle status
        Route::resource('users', UserController::class);
        Route::patch('/users/{user}/toggle-status', [UserController::class, 'toggleStatus'])->name('users.toggle-status');
        Route::patch('/users/{user}/teacher', [UserController::class, 'toggleTeacher'])->middleware(EnsureSuperadmin::class)->name('users.teacher');
        Route::patch('/users/{user}/player-details', [PlayerSchoolGradeController::class, 'update'])->middleware([EnsureSuperadmin::class, 'throttle:30,1,users.player-details'])->name('users.player-details');
        Route::post('/impersonate/{user}', [ImpersonationController::class, 'impersonate'])->whereNumber('user')->middleware('throttle:20,1,impersonate')->name('impersonate');

        // Roles CRUD
        Route::resource('roles', RoleController::class)->except(['show']);

        // Permissions (read-only)
        Route::get('/permissions', [PermissionController::class, 'index'])->name('permissions.index');

        // Activity Log
        Route::get('/activity-log', [ActivityLogController::class, 'index'])->name('activity-log.index');
        Route::get('/activity-log/{activity}', [ActivityLogController::class, 'show'])->whereNumber('activity')->name('activity-log.show');

        // Player feedback review
        Route::get('/feedback', [FeedbackController::class, 'index'])->name('feedback.index');
        Route::patch('/feedback/{feedback}', [FeedbackController::class, 'update'])->middleware('throttle:60,1,feedback.update')->name('feedback.update');

        // Super admin: game statistics, leaderboard and question bank
        Route::middleware(EnsureSuperadmin::class)->group(function (): void {
            Route::get('/games', [GameStatisticsController::class, 'index'])->name('games.index');
            Route::get('/games/{game}', [GameStatisticsController::class, 'show'])->where('game', '[a-z0-9-]+')->name('games.show');
            Route::get('/leaderboard', [LeaderboardController::class, 'index'])->name('leaderboard.index');
            Route::get('/user-statistics', [UserStatisticsController::class, 'index'])->name('user-statistics.index');
            Route::get('/playing-time', [PlayingTimeController::class, 'index'])->name('playing-time.index');
            Route::get('/screen-time', [ScreenTimeController::class, 'index'])->name('screen-time.index');
            Route::get('/questions/generate', [QuestionGenerationController::class, 'index'])->name('questions.generate');
            Route::post('/questions/generate', [QuestionGenerationController::class, 'store'])->name('questions.generate.store');
            Route::post('/questions/generate/{generation}/cancel', [QuestionGenerationController::class, 'cancel'])->middleware('throttle:20,1,questions.generate.cancel')->name('questions.generate.cancel');
            Route::post('/users/{user}/ability-assessments', [AbilityAssessmentController::class, 'store'])->middleware('throttle:5,1,users.ability-assessments.store')->name('users.ability-assessments.store');
            Route::post('/questions/bulk', [QuestionController::class, 'bulk'])->middleware('throttle:30,1,questions.bulk')->name('questions.bulk');
            Route::patch('/questions/{question}/toggle', [QuestionController::class, 'toggle'])->name('questions.toggle');
            Route::get('/notifications', [PlayerNotificationController::class, 'index'])->name('notifications.index');
            Route::post('/notifications', [PlayerNotificationController::class, 'store'])->middleware('throttle:20,1,notifications.store')->name('notifications.store');
            Route::get('/point-rules', [PointRulesController::class, 'index'])->name('point-rules.index');
            Route::put('/point-rules', [PointRulesController::class, 'update'])->name('point-rules.update');
            Route::get('/sound-settings', [GameSoundsController::class, 'index'])->name('sound-settings.index');
            Route::put('/sound-settings', [GameSoundsController::class, 'update'])->name('sound-settings.update');
            Route::get('/ai-assistant', [AiAssistantController::class, 'index'])->name('ai-assistant.index');
            Route::post('/ai-assistant/messages', [AiAssistantController::class, 'store'])->middleware('throttle:10,1,ai-assistant.messages')->name('ai-assistant.messages');
            Route::get('/ai-assistant/conversations/{conversation}', [AiAssistantController::class, 'show'])->whereUuid('conversation')->name('ai-assistant.conversations.show');
            Route::patch('/ai-assistant/conversations/{conversation}', [AiAssistantController::class, 'update'])->whereUuid('conversation')->middleware('throttle:30,1,ai-assistant.conversations')->name('ai-assistant.conversations.update');
            Route::delete('/ai-assistant/conversations/{conversation}', [AiAssistantController::class, 'destroy'])->whereUuid('conversation')->middleware('throttle:30,1,ai-assistant.conversations')->name('ai-assistant.conversations.destroy');
            Route::get('/ai-settings', [AiSettingsController::class, 'index'])->name('ai-settings.index');
            Route::put('/ai-settings', [AiSettingsController::class, 'update'])->name('ai-settings.update');
            Route::post('/ai-settings/models', [AiSettingsController::class, 'refresh'])->name('ai-settings.models');
            Route::put('/ai-settings/model', [AiSettingsController::class, 'model'])->name('ai-settings.model');
            Route::delete('/ai-settings/key', [AiSettingsController::class, 'forgetKey'])->name('ai-settings.key');
            Route::get('/whatsapp', [WhatsAppController::class, 'index'])->name('whatsapp.index');
            Route::put('/whatsapp', [WhatsAppController::class, 'update'])->name('whatsapp.update');
            Route::get('/whatsapp/log', [WhatsAppController::class, 'log'])->name('whatsapp.log');
            Route::get('/whatsapp/log/{message}', [WhatsAppController::class, 'show'])->whereNumber('message')->name('whatsapp.log.show');
            Route::get('/whatsapp/status', [WhatsAppController::class, 'status'])->middleware('throttle:60,1,whatsapp.status')->name('whatsapp.status');
            Route::post('/whatsapp/qr', [WhatsAppController::class, 'qr'])->middleware('throttle:20,1,whatsapp.qr')->name('whatsapp.qr');
            Route::post('/whatsapp/code', [WhatsAppController::class, 'code'])->middleware('throttle:5,1,whatsapp.code')->name('whatsapp.code');
            Route::post('/whatsapp/logout', [WhatsAppController::class, 'logout'])->middleware('throttle:10,1,whatsapp.logout')->name('whatsapp.logout');
            Route::post('/whatsapp/reconnect', [WhatsAppController::class, 'reconnect'])->middleware('throttle:10,1,whatsapp.reconnect')->name('whatsapp.reconnect');
            Route::post('/whatsapp/test', [WhatsAppController::class, 'test'])->middleware('throttle:5,1,whatsapp.test')->name('whatsapp.test');
            Route::post('/whatsapp/messages/{message}/retry', [WhatsAppController::class, 'retry'])->whereNumber('message')->middleware('throttle:30,1,whatsapp.retry')->name('whatsapp.retry');
            Route::resource('questions', QuestionController::class);
            Route::get('/compensation', [CompensationController::class, 'index'])->name('compensation.index');
            Route::put('/compensation', [CompensationController::class, 'update'])->name('compensation.update');
            Route::get('/server-monitor', [ServerMonitorController::class, 'index'])->name('server-monitor.index');
            Route::get('/matches', [MatchHistoryController::class, 'index'])->name('matches.index');
            // Crossword word bank lives under the crossword game page (sub tab "Word bank").
            Route::patch('/games/crossword/words/{crossword_word}/toggle', [CrosswordWordController::class, 'toggle'])->name('crossword-words.toggle');
            Route::resource('games/crossword/words', CrosswordWordController::class)
                ->parameters(['words' => 'crossword_word'])
                ->names('crossword-words')
                ->except(['show']);
            Route::get('/crossword-words/{path?}', fn (Request $request, ?string $path = null): RedirectResponse => redirect()->to(
                '/admin/games/crossword/words'.($path ? '/'.$path : '').($request->getQueryString() ? '?'.$request->getQueryString() : ''),
                301,
            ))->where('path', '.*')->name('crossword-words.legacy');
            Route::patch('/subjects/{subject}/toggle', [SubjectController::class, 'toggle'])->name('subjects.toggle');
            Route::patch('/subjects/{subject}/move', [SubjectController::class, 'move'])->name('subjects.move');
            Route::resource('subjects', SubjectController::class)->only(['index', 'store', 'update', 'destroy']);
            Route::get('/changelog', [ChangelogController::class, 'index'])->name('changelog.index');
            Route::post('/changelog', [ChangelogController::class, 'store'])->middleware('throttle:30,1,changelog.store')->name('changelog.store');
            Route::put('/changelog/{changelogEntry}', [ChangelogController::class, 'update'])->middleware('throttle:60,1,changelog.update')->name('changelog.update');
            Route::delete('/changelog/{changelogEntry}', [ChangelogController::class, 'destroy'])->middleware('throttle:30,1,changelog.destroy')->name('changelog.destroy');
            // Order Rush sequence bank and Port Sorter item bank live under their game pages (sub tabs).
            Route::patch('/games/order-rush/sequences/{sequence_set}/toggle', [SequenceSetController::class, 'toggle'])->name('sequence-sets.toggle');
            Route::resource('games/order-rush/sequences', SequenceSetController::class)
                ->parameters(['sequences' => 'sequence_set'])
                ->names('sequence-sets')
                ->only(['index', 'store', 'update', 'destroy']);
            Route::get('/sequence-sets/{path?}', fn (Request $request, ?string $path = null): RedirectResponse => redirect()->to(
                '/admin/games/order-rush/sequences'.($path ? '/'.$path : '').($request->getQueryString() ? '?'.$request->getQueryString() : ''),
                301,
            ))->where('path', '.*')->name('sequence-sets.legacy');
            Route::patch('/games/port-sorter/sets/{sorter_set}/toggle', [SorterSetController::class, 'toggle'])->name('sorter-sets.toggle');
            Route::resource('games/port-sorter/sets', SorterSetController::class)
                ->parameters(['sets' => 'sorter_set'])
                ->names('sorter-sets')
                ->only(['index', 'store', 'update', 'destroy']);
            Route::get('/sorter-sets/{path?}', fn (Request $request, ?string $path = null): RedirectResponse => redirect()->to(
                '/admin/games/port-sorter/sets'.($path ? '/'.$path : '').($request->getQueryString() ? '?'.$request->getQueryString() : ''),
                301,
            ))->where('path', '.*')->name('sorter-sets.legacy');
            Route::patch('/character-items/{character_item}/toggle', [CharacterItemController::class, 'toggle'])->name('character-items.toggle');
            Route::resource('character-items', CharacterItemController::class)->except(['show']);

            // Advertising (revenue): advertisers, campaigns, creatives, reports.
            Route::prefix('ads')->name('ads.')->group(function () {
                Route::get('/', [AdController::class, 'index'])->name('index');
                Route::patch('/settings/global', [AdController::class, 'toggleGlobal'])->name('settings.global');
                Route::put('/settings/placements', [AdController::class, 'updatePlacements'])->name('settings.placements');
                Route::get('/settings/users', [AdController::class, 'searchUsers'])->middleware('throttle:60,1,settings.users')->name('settings.users');
                Route::patch('/users/{user}', [AdController::class, 'toggleUser'])->name('users.toggle');
                Route::get('/advertisers/create', [AdController::class, 'createAdvertiser'])->name('advertisers.create');
                Route::post('/advertisers', [AdController::class, 'storeAdvertiser'])->name('advertisers.store');
                Route::get('/advertisers/{advertiser}/edit', [AdController::class, 'editAdvertiser'])->name('advertisers.edit');
                Route::post('/advertisers/{advertiser}', [AdController::class, 'updateAdvertiser'])->name('advertisers.update');
                Route::delete('/advertisers/{advertiser}', [AdController::class, 'destroyAdvertiser'])->name('advertisers.destroy');
                Route::get('/campaigns/create', [AdController::class, 'createCampaign'])->name('campaigns.create');
                Route::post('/campaigns', [AdController::class, 'storeCampaign'])->name('campaigns.store');
                Route::get('/campaigns/{campaign}', [AdController::class, 'showCampaign'])->name('campaigns.show');
                Route::get('/campaigns/{campaign}/edit', [AdController::class, 'editCampaign'])->name('campaigns.edit');
                Route::put('/campaigns/{campaign}', [AdController::class, 'updateCampaign'])->name('campaigns.update');
                Route::patch('/campaigns/{campaign}/status', [AdController::class, 'statusCampaign'])->name('campaigns.status');
                Route::delete('/campaigns/{campaign}', [AdController::class, 'destroyCampaign'])->name('campaigns.destroy');
                Route::post('/campaigns/{campaign}/creatives', [AdController::class, 'storeCreative'])->name('creatives.store');
                Route::post('/campaigns/{campaign}/creatives/{creative}', [AdController::class, 'updateCreative'])->name('creatives.update');
                Route::delete('/campaigns/{campaign}/creatives/{creative}', [AdController::class, 'destroyCreative'])->name('creatives.destroy');
            });
        });

        // Settings
        Route::get('/settings', [SettingsController::class, 'index'])->name('settings.index');
        Route::put('/settings/general', [SettingsController::class, 'updateGeneral'])->name('settings.general');
        Route::put('/settings/mail', [SettingsController::class, 'updateMail'])->name('settings.mail');
        Route::put('/settings/security', [SettingsController::class, 'updateSecurity'])->name('settings.security');
        Route::put('/settings/profile', [SettingsController::class, 'updateProfile'])->name('settings.profile');
        Route::put('/settings/password', [SettingsController::class, 'updatePassword'])->name('settings.password');
    });
