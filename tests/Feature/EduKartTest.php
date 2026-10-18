<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\Classroom;
use App\Models\GameAccess;
use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use App\Services\ActiveGames;
use App\Services\Classrooms\ClassroomCloser;
use App\Services\RoomPinLookup;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('k', 40)]);
});

/** @param array<string, mixed> $payload */
function postEduKartResult(array $payload): TestResponse
{
    $body = (string) json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return test()->call('POST', '/api/internal/game-results', [], [], [], [
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $body);
}

/** @return array<string, mixed> */
function eduKartResult(User $user): array
{
    return [
        'event_id' => 'ek-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'edu-kart',
        'mission' => 'room',
        'grade' => 10,
        'points' => 4650,
        'correct' => 15,
        'wrong' => 0,
        'duration_seconds' => 300,
        'completed_at' => now()->toIso8601String(),
        'match' => [
            'key' => 'ek-482913-1790000000000',
            'mode' => 'room',
            'pin' => '482913',
            'level' => 15,
            'grade' => 10,
            'started_at' => now()->subMinutes(5)->toIso8601String(),
            'ended_at' => now()->toIso8601String(),
            'finished' => true,
            'players' => [
                ['user_id' => $user->id, 'name' => $user->name, 'grade' => 10, 'rank' => 1, 'score' => 5, 'correct' => 15, 'wrong' => 0],
                ['user_id' => null, 'name' => 'Bot', 'grade' => 10, 'rank' => 2, 'score' => 3, 'correct' => 4, 'wrong' => 5, 'bot' => true],
            ],
        ],
    ];
}

it('requires sign in for the page invite and token', function (): void {
    $this->get('/games/edu-kart')->assertRedirect('/login');
    $this->get('/games/edu-kart/join/482913')->assertRedirect('/login');
    $this->postJson('/games/edu-kart/token')->assertUnauthorized();
});

it('renders player identity pin service and ads while recording access', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/edu-kart?pin=482913')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/edu-kart', false)
        ->where('player.id', $user->id)
        ->where('pin', '482913')
        ->where('wsUrl', '/game-ws/edu-kart')
        ->where('serviceReady', true)
        ->has('ads'));

    expect(GameAccess::query()->where('game_key', 'edu-kart')->where('user_id', $user->id)->count())->toBe(1);
});

it('ignores malformed query pins and rejects malformed invite pins', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    $this->actingAs($user)->get('/games/edu-kart?pin=abcdef')->assertInertia(fn (Assert $page) => $page->where('pin', null));
    $this->get('/games/edu-kart?pin[]=482913')->assertInertia(fn (Assert $page) => $page->where('pin', null));
    $this->get('/games/edu-kart/join/12345')->assertNotFound();
});

it('signs the player grade for the question band', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    $user->playerProfile()->update(['grade' => 7]);
    $token = $this->actingAs($user)->postJson('/games/edu-kart/token')->assertOk()->json('token');
    $claims = json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);

    expect($claims)->toMatchArray(['game' => 'edu-kart', 'grade' => 7]);
});

it('signs game audience identity expiry character and selected difficulty without a school grade', function (): void {
    $this->freezeTime();
    $user = User::factory()->withPlayerDetails()->create();
    $user->playerProfile()->update(['grade' => null, 'question_level' => 3]);
    $response = $this->actingAs($user)->postJson('/games/edu-kart/token', ['level' => 999, 'sub' => 999])->assertOk();
    [$encoded, $signature] = explode('.', $response->json('token'));
    $claims = json_decode(base64_decode(strtr($encoded, '-_', '+/')), true);

    expect($signature)->toBe(rtrim(strtr(base64_encode(hash_hmac('sha256', $encoded, config('game-service.secret'), true)), '+/', '-_'), '='))
        ->and($claims)->toMatchArray(['sub' => $user->id, 'game' => 'edu-kart', 'grade' => PlayerProfile::MIN_GRADE, 'level' => 3])
        ->and($claims['exp'])->toBe(now()->getTimestamp() + config('game-service.token_ttl'))
        ->and($claims['character'])->toBeArray()
        ->and($response->json('expires_in'))->toBe(config('game-service.token_ttl'));
});

it('refuses tokens without a configured service secret', function (): void {
    config(['game-service.secret' => '']);
    $user = User::factory()->withPlayerDetails()->create();
    $this->actingAs($user)->postJson('/games/edu-kart/token')->assertServiceUnavailable();
});

it('lists one to eight human players with login and point awards', function (): void {
    $game = collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => $category['games'])->firstWhere('key', 'edu-kart');
    expect($game)->toMatchArray(['route' => 'games.edu-kart', 'icon' => 'kart', 'accent' => '#e11d48', 'min_players' => 1, 'max_players' => 8, 'multiplayer' => true, 'awards_points' => true, 'guest_playable' => false, 'requires_grade' => false, 'min_grade' => 1, 'max_grade' => 12, 'titleKey' => 'player.eduKart', 'descriptionKey' => 'portal.games.eduKart', 'released_at' => '2026-10-17']);
    expect(StoreGameResultRequest::GAMES['edu-kart'])->toMatchArray(['max_points' => 4650, 'max_players' => 8, 'max_level' => 15, 'missions' => ['room']]);
});

it('supports generic invite presence resume and PIN lookup from the edukart container', function (): void {
    config([
        'game-service.presence_url' => 'http://game.test/internal/presence',
        'game-service.room_url' => 'http://game.test/internal/room',
        'game-service.edu_kart_presence_url' => 'http://edukart.test/internal/presence',
        'game-service.edu_kart_room_url' => 'http://edukart.test/internal/room',
    ]);
    $user = User::factory()->withPlayerDetails()->create();
    Http::fake([
        'game.test/*' => Http::response(['rooms' => [['game' => 'ping-pong', 'pin' => '482913', 'phase' => 'playing', 'open' => false, 'host' => false]]]),
        'edukart.test/*' => Http::response(['rooms' => [['game' => 'edu-kart', 'pin' => '482913', 'phase' => 'lobby', 'open' => true, 'host' => true]]]),
    ]);
    $this->actingAs($user)->get('/games/edu-kart/join/482913')->assertRedirect('/games/edu-kart?pin=482913');

    expect(collect(app(ActiveGames::class)->for($user))->pluck('url')->all())->toBe(['/games/ping-pong?pin=482913', '/games/edu-kart?pin=482913']);
    $rooms = app(RoomPinLookup::class)->find('482913');
    expect($rooms)->toHaveCount(2)
        ->and($rooms[0])->toMatchArray(['game_key' => 'edu-kart', 'open' => true, 'url' => '/games/edu-kart?pin=482913'])
        ->and($rooms[1])->toMatchArray(['game_key' => 'ping-pong', 'open' => false]);
    Http::assertSent(fn ($request): bool => str_starts_with($request->url(), 'http://edukart.test/internal/room') && $request['pin'] === '482913');
    Http::assertSent(fn ($request): bool => str_starts_with($request->url(), 'http://edukart.test/internal/presence') && $request['user'] == $user->id);
});

it('still finds rooms of the main game service when the edukart container is down', function (): void {
    config([
        'game-service.presence_url' => 'http://game.test/internal/presence',
        'game-service.room_url' => 'http://game.test/internal/room',
        'game-service.edu_kart_presence_url' => 'http://edukart.test/internal/presence',
        'game-service.edu_kart_room_url' => 'http://edukart.test/internal/room',
    ]);
    $user = User::factory()->withPlayerDetails()->create();
    Http::fake([
        'game.test/*' => Http::response(['rooms' => [['game' => 'ping-pong', 'pin' => '482913', 'phase' => 'lobby', 'open' => true, 'host' => false]]]),
        'edukart.test/*' => Http::response('down', 503),
    ]);

    expect(app(ActiveGames::class)->for($user))->toHaveCount(1)
        ->and(app(RoomPinLookup::class)->find('482913'))->toHaveCount(1);
});

it('records signed capped results once and never creates a bot account', function (string $locale): void {
    $user = User::factory()->create(['locale' => $locale]);
    $payload = eduKartResult($user);
    $usersBefore = User::query()->count();
    postEduKartResult($payload)->assertCreated();
    postEduKartResult($payload)->assertOk()->assertJson(['status' => 'duplicate']);

    expect(GameHistory::query()->sole()->game_name)->toBe($locale === 'id' ? 'Balap Kuis EduKart' : 'EduKart Quiz Racing')
        ->and($user->pointLedgers()->count())->toBe(1)
        ->and((int) $user->pointLedgers()->sum('points'))->toBe(4650)
        ->and(GameMatch::query()->sole()->players()->count())->toBe(2)
        ->and(User::query()->count())->toBe($usersBefore);
})->with(['id', 'en']);

it('records bank answers with the original choice for question stats', function (): void {
    $user = User::factory()->create(['locale' => 'id']);
    $question = Question::factory()->create(['games' => ['edu-kart'], 'options' => ['A', 'B', 'C', 'D'], 'answer' => 1]);
    $payload = [...eduKartResult($user), 'answers' => [
        ['key' => $question->key, 'correct' => true, 'choice' => 1],
        ['key' => $question->key, 'correct' => false, 'choice' => 3],
        ['key' => 'missing-question', 'correct' => true, 'choice' => 0],
    ]];

    postEduKartResult($payload)->assertCreated();

    $answers = QuestionAnswer::query()->orderBy('id')->get();
    expect($answers)->toHaveCount(2)
        ->and($answers->pluck('game_key')->unique()->all())->toBe(['edu-kart'])
        ->and($answers->pluck('choice')->all())->toBe([1, 3])
        ->and($answers->pluck('correct')->all())->toBe([true, false])
        ->and($question->fresh())->times_answered->toBe(2)->times_correct->toBe(1);
});

it('tracks edukart as a bank game with true false and choice questions', function (): void {
    expect(Question::GAMES)->toContain('edu-kart')
        ->and(Question::CHOICE_ONLY_GAMES)->not->toContain('edu-kart');
});

it('distributes trivia choice and true false questions to edukart and removes them on rollback', function (): void {
    Question::query()->delete();
    $trivia = Question::factory()->create(['games' => ['sky-quiz', 'quiz-duel']]);
    $already = Question::factory()->create(['games' => ['sky-quiz', 'edu-kart']]);
    $trueFalse = Question::factory()->trueFalse()->create(['games' => ['flag-quest']]);
    $other = Question::factory()->create(['games' => ['market-math']]);
    $otherTrueFalse = Question::factory()->trueFalse()->create(['games' => ['market-math']]);
    $migration = require database_path('migrations/2026_11_10_090001_distribute_questions_to_edu_kart.php');

    $migration->up();
    $migration->up();

    expect($trivia->fresh()->games)->toBe(['sky-quiz', 'quiz-duel', 'edu-kart'])
        ->and($already->fresh()->games)->toBe(['sky-quiz', 'edu-kart'])
        ->and($trueFalse->fresh()->games)->toBe(['flag-quest', 'edu-kart'])
        ->and($other->fresh()->games)->toBe(['market-math'])
        ->and($otherTrueFalse->fresh()->games)->toBe(['market-math']);

    $migration->down();

    expect($trivia->fresh()->games)->toBe(['sky-quiz', 'quiz-duel'])
        ->and($already->fresh()->games)->toBe(['sky-quiz'])
        ->and($trueFalse->fresh()->games)->toBe(['flag-quest']);
});

it('rejects invalid result caps missions prefixes and seat limits', function (string $field, mixed $value): void {
    $user = User::factory()->create();
    $payload = eduKartResult($user);
    data_set($payload, $field, $value);
    postEduKartResult($payload)->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(GameHistory::query()->count())->toBe(0);
})->with([
    ['points', 4651],
    ['points', -1],
    ['mission', 'solo'],
    ['event_id', 'pp-1-room-1790000000000'],
    ['match.level', 16],
    ['match.players', array_fill(0, 9, ['name' => 'Player', 'grade' => 10, 'rank' => 1, 'score' => 0, 'correct' => 0, 'wrong' => 0])],
]);

it('rejects unsigned results', function (): void {
    $user = User::factory()->create();
    $this->postJson('/api/internal/game-results', eduKartResult($user))->assertForbidden();
});

it('closes classroom rooms on the edukart container too', function (): void {
    config([
        'game-service.classroom_close_url' => 'http://game.test/internal/classroom/close',
        'game-service.edu_kart_classroom_close_url' => 'http://edukart.test/internal/classroom/close',
    ]);
    Http::fake(['game.test/*' => Http::response('down', 503), '*' => Http::response(null, 204)]);
    $classroom = Classroom::factory()->create();

    app(ClassroomCloser::class)->close($classroom);

    Http::assertSent(fn ($request): bool => $request->url() === 'http://game.test/internal/classroom/close');
    Http::assertSent(fn ($request): bool => $request->url() === 'http://edukart.test/internal/classroom/close' && $request->data() === ['classroom' => $classroom->id]);
});

it('ships history names and admin registration', function (): void {
    expect(__('edu_kart.history_name', [], 'id'))->toBe('Balap Kuis EduKart')
        ->and(__('edu_kart.history_name', [], 'en'))->toBe('EduKart Quiz Racing')
        ->and(file_get_contents(resource_path('js/components/admin/dashboard-kit.tsx')))->toContain("'edu-kart': '#e11d48'")
        ->and(file_get_contents(resource_path('js/components/admin/game-stats.tsx')))->toContain("'edu-kart': 'EduKart Racing'")
        ->and(file_get_contents(public_path('new-landing/index.html')))->toContain('href="/games/edu-kart"', 'data-game-players="edu-kart"')
        ->and(file_get_contents(public_path('new-landing/games.html')))->toContain(',edu-kart"');
});

it('ships matching catalog labels in both locales', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(file_get_contents(resource_path("js/locales/{$locale}-player.json")), true);
        expect($catalog['player']['eduKart'])->not->toBeEmpty()
            ->and($catalog['portal']['games']['eduKart'])->not->toBeEmpty();
    }
});

it('maps edukart websocket traffic to its own container on both gateways', function (string $file): void {
    $config = file_get_contents(base_path($file));
    expect($config)->toContain('location = /game-ws/edu-kart {', 'http://edufunhub-edukart:8093', '/ws/edu-kart$is_args$args;');
})->with(['dashboard-gateway.dev.conf', 'deploy/nginx/gateway.prod.conf']);

it('ships edukart tutorial media in both languages', function (string $file, string $signature): void {
    $path = public_path('tutorials/'.$file);
    expect($path)->toBeFile()->and(file_get_contents($path, length: 12))->toContain($signature);
})->with([
    ['cara-bermain-edu-kart.mp4', 'ftyp'],
    ['cara-bermain-edu-kart-en.mp4', 'ftyp'],
    ['cara-bermain-edu-kart.jpg', "\xFF\xD8\xFF"],
    ['cara-bermain-edu-kart-en.jpg', "\xFF\xD8\xFF"],
    ['cara-bermain-edu-kart.pdf', '%PDF'],
    ['cara-bermain-edu-kart-en.pdf', '%PDF'],
]);

it('streams tutorial media from disk on the dev gateway so videos can seek', function (): void {
    $config = file_get_contents(base_path('dashboard-gateway.dev.conf'));
    $compose = file_get_contents(base_path('docker-compose.yml'));
    expect($config)->toContain('location ^~ /tutorials/ {', 'try_files $uri @dashboard_tutorials;')
        ->and($compose)->toContain('./public/tutorials:/srv/public/tutorials:ro');
});
