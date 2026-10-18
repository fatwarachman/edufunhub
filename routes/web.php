<?php

use App\Http\Controllers\AbilityController;
use App\Http\Controllers\AdController;
use App\Http\Controllers\Admin\ImpersonationController;
use App\Http\Controllers\AndroidApkController;
use App\Http\Controllers\AndroidApkInfoController;
use App\Http\Controllers\AndroidAssetLinksController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\BlockBattleController;
use App\Http\Controllers\CharacterController;
use App\Http\Controllers\Chat\ChatController;
use App\Http\Controllers\ClassroomAnnouncementController;
use App\Http\Controllers\ClassroomJoinController;
use App\Http\Controllers\ClassroomReportController;
use App\Http\Controllers\ClassroomWorldChatController;
use App\Http\Controllers\ClassroomWorldController;
use App\Http\Controllers\CrosswordController;
use App\Http\Controllers\CurrentPageController;
use App\Http\Controllers\EconomyHeistController;
use App\Http\Controllers\EduKartController;
use App\Http\Controllers\FeedbackController;
use App\Http\Controllers\FlagQuestController;
use App\Http\Controllers\FloorDropController;
use App\Http\Controllers\FriendController;
use App\Http\Controllers\GameInviteController;
use App\Http\Controllers\GameListController;
use App\Http\Controllers\GameReviewController;
use App\Http\Controllers\GradeController;
use App\Http\Controllers\JoinByPinController;
use App\Http\Controllers\KnowledgeTrainController;
use App\Http\Controllers\LandingStatsController;
use App\Http\Controllers\LeaderboardController;
use App\Http\Controllers\LocaleController;
use App\Http\Controllers\MiniGameController;
use App\Http\Controllers\MonsterCafeController;
use App\Http\Controllers\MyClassroomController;
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
use App\Http\Controllers\QuestionMediaController;
use App\Http\Controllers\QuizDuelController;
use App\Http\Controllers\RegencyController;
use App\Http\Controllers\SchoolListController;
use App\Http\Controllers\SchoolSuggestionController;
use App\Http\Controllers\ScreenTimeController;
use App\Http\Controllers\SkyQuizController;
use App\Http\Controllers\SnakeGameController;
use App\Http\Controllers\SnakesAndLaddersController;
use App\Http\Controllers\SubjectDetailController;
use App\Http\Controllers\Teacher\ClassroomAnnouncementController as TeacherClassroomAnnouncementController;
use App\Http\Controllers\Teacher\ClassroomController;
use App\Http\Controllers\Teacher\ClassroomWorldController as TeacherClassroomWorldController;
use App\Http\Controllers\Teacher\TeacherAiAssistantController;
use App\Http\Controllers\Teacher\TeacherQuestionController;
use App\Http\Controllers\Teacher\TeacherTopicController;
use App\Http\Controllers\TeacherRequestController;
use App\Http\Controllers\TurboTriviaController;
use App\Http\Controllers\UserDashboardController;
use App\Http\Middleware\EnsurePlayerDetailsComplete;
use App\Http\Middleware\EnsurePlayerIsActive;
use App\Http\Middleware\EnsureTeacher;
use App\Http\Middleware\RecordGameAccess;
use App\Services\Ads\AdMedia;
use App\Services\ProfilePhoto;
use App\Services\QuestionVisual;
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
Route::get('/download/edufunhub.apk', AndroidApkController::class)->middleware('throttle:20,1,android.apk')->name('android.apk');
Route::get('/download/apk', AndroidApkController::class)->middleware('throttle:20,1,android.apk')->name('android.apk.latest');
Route::get('/download/apk.json', AndroidApkInfoController::class)->middleware('throttle:60,1,android.apk.info')->name('android.apk.info');

Route::get('/landing/stats', LandingStatsController::class)->middleware('throttle:60,1,landing.stats')->name('landing.stats');
Route::get('/player-details/regencies', RegencyController::class)->middleware('throttle:30,1,player-details.regencies')->name('player-details.regencies');
Route::get('/player-details/school-list', SchoolListController::class)->middleware('throttle:120,1,player-details.school-list')->name('player-details.school-list');

Route::post('/current-page', CurrentPageController::class)->middleware(['auth', 'throttle:60,1,current-page'])->name('current-page.store');

Route::middleware(['auth', EnsurePlayerIsActive::class])->group(function (): void {
    Route::get('/teacher-request', [TeacherRequestController::class, 'create'])->name('teacher-request.create');
    Route::post('/teacher-request', [TeacherRequestController::class, 'store'])->middleware('throttle:5,1,teacher-request.store')->name('teacher-request.store');
    Route::get('/dashboard', UserDashboardController::class)->name('dashboard');
    Route::get('/portal', PortalController::class)->name('portal');
    Route::get('/subjects/{subject:key}', SubjectDetailController::class)->name('subjects.show');
    Route::get('/leaderboard', LeaderboardController::class)->name('leaderboard');
    Route::get('/games/review/{play}', [GameReviewController::class, 'show'])->whereNumber('play')->name('games.review');
    Route::get('/games/review/match/{matchKey}', [GameReviewController::class, 'byMatch'])->where('matchKey', '[A-Za-z0-9-]{1,80}')->middleware('throttle:60,1,games.review.match')->name('games.review.match');
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
    Route::get('/games/question-media/{file}', [QuestionMediaController::class, 'show'])->where('file', QuestionVisual::FILE_PATTERN)->name('games.question-media');
    Route::get('/players/online', OnlinePlayersController::class)->middleware('throttle:60,1,players.online')->name('players.online');
    Route::get('/players/online/count', [OnlinePlayersController::class, 'count'])->middleware('throttle:30,1,players.online.count')->name('players.online.count');
    Route::get('/players/{user}', PlayerPageController::class)->whereNumber('user')->middleware('throttle:60,1,players.show')->name('players.show');
    Route::patch('/player-details', [PlayerDetailsController::class, 'update'])->name('player-details.update');
    Route::post('/profile/wizard', [ProfileWizardController::class, 'store'])->middleware('throttle:20,1,profile-wizard')->name('profile-wizard.store');
    Route::post('/screen-time/beat', [ScreenTimeController::class, 'beat'])->middleware('throttle:10,1,screen-time.beat')->name('screen-time.beat');

    // Classrooms (player)
    Route::get('/portal/classrooms/{pin}', [ClassroomJoinController::class, 'show'])->where('pin', '[0-9]{6}')->name('classrooms.show');
    Route::post('/portal/classrooms/{pin}/join', [ClassroomJoinController::class, 'join'])->where('pin', '[0-9]{6}')->middleware('throttle:10,1,classrooms.join')->name('classrooms.join');
    Route::post('/portal/classrooms/{pin}/leave', [ClassroomJoinController::class, 'leave'])->where('pin', '[0-9]{6}')->middleware('throttle:10,1,classrooms.leave')->name('classrooms.leave');
    Route::post('/portal/classrooms/{pin}/world-token', [ClassroomWorldController::class, 'token'])->where('pin', '[0-9]{6}')->middleware('throttle:30,1,classrooms.world')->name('classrooms.world-token');
    Route::get('/portal/classrooms/{pin}/hud', [ClassroomWorldController::class, 'hud'])->where('pin', '[0-9]{6}')->middleware('throttle:60,1,classrooms.hud')->name('classrooms.hud');
    Route::get('/portal/classrooms/{pin}/world-chat', [ClassroomWorldChatController::class, 'inbox'])->where('pin', '[0-9]{6}')->middleware('throttle:60,1,classrooms.world-chat')->name('classrooms.world-chat');
    Route::post('/portal/classrooms/{pin}/world-chat/reply', [ClassroomWorldChatController::class, 'reply'])->where('pin', '[0-9]{6}')->middleware('throttle:chat')->name('classrooms.world-chat.reply');
    Route::post('/portal/classrooms/{pin}/world-chat/read', [ClassroomWorldChatController::class, 'read'])->where('pin', '[0-9]{6}')->middleware('throttle:60,1,classrooms.world-chat.read')->name('classrooms.world-chat.read');
    Route::get('/portal/classrooms/{pin}/announcement', [ClassroomAnnouncementController::class, 'show'])->where('pin', '[0-9]{6}')->middleware('throttle:60,1,classrooms.announcement')->name('classrooms.announcement');
    Route::get('/portal/classrooms/report/{member}', [ClassroomReportController::class, 'show'])->name('classrooms.report');
    Route::get('/my-classrooms', [MyClassroomController::class, 'index'])->name('my-classrooms.index');
    Route::get('/my-classrooms/teachers', [MyClassroomController::class, 'teachers'])->name('my-classrooms.teachers');
    Route::get('/my-classrooms/{member}', [MyClassroomController::class, 'show'])->whereNumber('member')->middleware('throttle:60,1,my-classrooms.show')->name('my-classrooms.show');
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
        Route::post('/direct/open', [ChatController::class, 'openDirect'])->middleware('throttle:30,1,chat.direct')->name('direct.open');
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
        Route::resource('questions', TeacherQuestionController::class)->except(['store', 'update']);
        Route::post('/questions', [TeacherQuestionController::class, 'store'])->middleware('throttle:30,1,teacher.questions.store')->name('questions.store');
        Route::post('/questions/media', [QuestionMediaController::class, 'store'])->middleware('throttle:30,1,teacher.questions.media')->name('questions.media.store');
        Route::put('/questions/{question}', [TeacherQuestionController::class, 'update'])->middleware('throttle:60,1,teacher.questions.update')->name('questions.update');

        // Teacher topics
        Route::get('/topics', [TeacherTopicController::class, 'index'])->name('topics.index');
        Route::post('/topics', [TeacherTopicController::class, 'store'])->middleware('throttle:30,1,teacher.topics.store')->name('topics.store');
        Route::put('/topics/{topic}', [TeacherTopicController::class, 'update'])->middleware('throttle:60,1,teacher.topics.update')->name('topics.update');
        Route::delete('/topics/{topic}', [TeacherTopicController::class, 'destroy'])->middleware('throttle:30,1,teacher.topics.destroy')->name('topics.destroy');

        Route::get('/ai-assistant', [TeacherAiAssistantController::class, 'index'])->name('ai-assistant.index');
        Route::post('/ai-assistant/messages', [TeacherAiAssistantController::class, 'store'])->middleware('throttle:10,1,teacher.ai-assistant.messages')->name('ai-assistant.messages');
        Route::get('/ai-assistant/conversations/{conversation}', [TeacherAiAssistantController::class, 'show'])->whereUuid('conversation')->name('ai-assistant.conversations.show');
        Route::delete('/ai-assistant/conversations/{conversation}', [TeacherAiAssistantController::class, 'destroy'])->whereUuid('conversation')->middleware('throttle:30,1,teacher.ai-assistant.conversations')->name('ai-assistant.conversations.destroy');

        // Teacher classrooms
        Route::get('/classrooms/history', [ClassroomController::class, 'history'])->name('classrooms.history');
        Route::get('/classrooms', [ClassroomController::class, 'index'])->name('classrooms.index');
        Route::get('/classrooms/create', [ClassroomController::class, 'create'])->name('classrooms.create');
        Route::post('/classrooms', [ClassroomController::class, 'store'])->middleware('throttle:10,1,classrooms.store')->name('classrooms.store');
        Route::get('/classrooms/questions', [ClassroomController::class, 'questionOptions'])->name('classrooms.questions');
        Route::get('/classrooms/{classroom}', [ClassroomController::class, 'show'])->name('classrooms.show');
        Route::get('/classrooms/{classroom}/participants', [ClassroomController::class, 'participants'])->name('classrooms.participants');
        Route::get('/classrooms/{classroom}/edit', [ClassroomController::class, 'edit'])->name('classrooms.edit');
        Route::put('/classrooms/{classroom}', [ClassroomController::class, 'update'])->middleware('throttle:10,1,classrooms.update')->name('classrooms.update');
        Route::delete('/classrooms/{classroom}', [ClassroomController::class, 'destroy'])->name('classrooms.destroy');
        Route::post('/classrooms/{classroom}/end', [ClassroomController::class, 'end'])->middleware('throttle:10,1,classrooms.end')->name('classrooms.end');
        Route::post('/classrooms/{classroom}/remove-member', [ClassroomController::class, 'removeMember'])->middleware('throttle:30,1,classrooms.remove')->name('classrooms.remove');
        Route::post('/classrooms/{classroom}/analyze', [ClassroomController::class, 'analyze'])->middleware('throttle:5,1,classrooms.analyze')->name('classrooms.analyze');
        Route::get('/classrooms/{classroom}/live', [ClassroomController::class, 'live'])->name('classrooms.live');
        Route::get('/classrooms/{classroom}/world', [TeacherClassroomWorldController::class, 'show'])->name('classrooms.world');
        Route::post('/classrooms/{classroom}/world-token', [TeacherClassroomWorldController::class, 'token'])->middleware('throttle:30,1,teacher.classrooms.world-token')->name('classrooms.world-token');
        Route::get('/classrooms/{classroom}/world-hud', [TeacherClassroomWorldController::class, 'hud'])->middleware('throttle:60,1,teacher.classrooms.world-hud')->name('classrooms.world-hud');
        Route::get('/classrooms/{classroom}/world-chat', [ClassroomWorldChatController::class, 'teacherInbox'])->middleware('throttle:60,1,teacher.classrooms.world-chat')->name('classrooms.world-chat');
        Route::post('/classrooms/{classroom}/world-chat/reply', [ClassroomWorldChatController::class, 'teacherReply'])->middleware('throttle:chat')->name('classrooms.world-chat.reply');
        Route::post('/classrooms/{classroom}/world-chat/read', [ClassroomWorldChatController::class, 'teacherRead'])->middleware('throttle:60,1,teacher.classrooms.world-chat.read')->name('classrooms.world-chat.read');
        Route::post('/classrooms/{classroom}/share', [ClassroomController::class, 'share'])->middleware('throttle:30,1,classrooms.share')->name('classrooms.share');
        Route::post('/classrooms/{classroom}/share-all', [ClassroomController::class, 'shareAll'])->middleware('throttle:10,1,classrooms.share-all')->name('classrooms.share-all');
        Route::post('/classrooms/{classroom}/announcements', [TeacherClassroomAnnouncementController::class, 'store'])->middleware('throttle:10,1,classrooms.announcements')->name('classrooms.announcements.store');
        Route::post('/classrooms/{classroom}/announcements/{announcement}/stop', [TeacherClassroomAnnouncementController::class, 'stop'])->scopeBindings()->middleware('throttle:30,1,classrooms.announcements.stop')->name('classrooms.announcements.stop');
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
        Route::get('/games/edu-kart', [EduKartController::class, 'show'])->middleware(RecordGameAccess::class.':edu-kart')->name('games.edu-kart');
        Route::post('/games/edu-kart/token', [EduKartController::class, 'token'])->middleware('throttle:30,1,games.edu-kart.token')->name('games.edu-kart.token');
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
