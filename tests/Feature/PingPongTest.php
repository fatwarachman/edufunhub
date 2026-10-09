<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameAccess;
use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\User;
use App\Services\ActiveGames;
use App\Services\RoomPinLookup;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('p', 40)]);
});

/** @param array<string, mixed> $payload */
function postPingPongResult(array $payload): TestResponse
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
function pingPongResult(User $user): array
{
    return [
        'event_id' => 'pp-'.$user->id.'-room-1790000000000',
        'user_id' => $user->id,
        'game_key' => 'ping-pong',
        'mission' => 'room',
        'grade' => 10,
        'points' => 18150,
        'correct' => 60,
        'wrong' => 0,
        'duration_seconds' => 300,
        'completed_at' => now()->toIso8601String(),
        'match' => [
            'key' => 'pp-482913-1790000000000',
            'mode' => 'room',
            'pin' => '482913',
            'level' => 3,
            'grade' => 10,
            'started_at' => now()->subMinutes(5)->toIso8601String(),
            'ended_at' => now()->toIso8601String(),
            'finished' => true,
            'players' => [
                ['user_id' => $user->id, 'name' => $user->name, 'grade' => 10, 'rank' => 1, 'score' => 5, 'correct' => 60, 'wrong' => 0],
                ['user_id' => null, 'name' => 'Bot', 'grade' => 10, 'rank' => 2, 'score' => 3, 'correct' => 4, 'wrong' => 5, 'bot' => true],
            ],
        ],
    ];
}

it('requires sign in for the page invite and token', function (): void {
    $this->get('/games/ping-pong')->assertRedirect('/login');
    $this->get('/games/ping-pong/join/482913')->assertRedirect('/login');
    $this->postJson('/games/ping-pong/token')->assertUnauthorized();
});

it('renders player identity pin service and ads while recording access', function (): void {
    $user = User::factory()->withPlayerDetails()->create();

    $this->actingAs($user)->get('/games/ping-pong?pin=482913')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('games/ping-pong', false)
        ->where('player.id', $user->id)
        ->where('pin', '482913')
        ->where('wsUrl', '/game-ws/ping-pong')
        ->where('serviceReady', true)
        ->has('ads'));

    expect(GameAccess::query()->where('game_key', 'ping-pong')->where('user_id', $user->id)->count())->toBe(1);
});

it('ignores malformed query pins and rejects malformed invite pins', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    $this->actingAs($user)->get('/games/ping-pong?pin=abcdef')->assertInertia(fn (Assert $page) => $page->where('pin', null));
    $this->get('/games/ping-pong?pin[]=482913')->assertInertia(fn (Assert $page) => $page->where('pin', null));
    $this->get('/games/ping-pong/join/12345')->assertNotFound();
});

it('signs the player grade for the question band', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    $user->playerProfile()->update(['grade' => 7]);
    $token = $this->actingAs($user)->postJson('/games/ping-pong/token')->assertOk()->json('token');
    $claims = json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);

    expect($claims)->toMatchArray(['game' => 'ping-pong', 'grade' => 7]);
});

it('signs game audience identity expiry character and selected difficulty without a school grade', function (): void {
    $this->freezeTime();
    $user = User::factory()->withPlayerDetails()->create();
    $user->playerProfile()->update(['grade' => null, 'question_level' => 3]);
    $response = $this->actingAs($user)->postJson('/games/ping-pong/token', ['level' => 999, 'sub' => 999])->assertOk();
    [$encoded, $signature] = explode('.', $response->json('token'));
    $claims = json_decode(base64_decode(strtr($encoded, '-_', '+/')), true);

    expect($signature)->toBe(rtrim(strtr(base64_encode(hash_hmac('sha256', $encoded, config('game-service.secret'), true)), '+/', '-_'), '='))
        ->and($claims)->toMatchArray(['sub' => $user->id, 'game' => 'ping-pong', 'grade' => PlayerProfile::MIN_GRADE, 'level' => 3])
        ->and($claims['exp'])->toBe(now()->getTimestamp() + config('game-service.token_ttl'))
        ->and($claims['character'])->toBeArray()
        ->and($response->json('expires_in'))->toBe(config('game-service.token_ttl'));
});

it('refuses tokens without a configured service secret', function (): void {
    config(['game-service.secret' => '']);
    $user = User::factory()->withPlayerDetails()->create();
    $this->actingAs($user)->postJson('/games/ping-pong/token')->assertServiceUnavailable();
});

it('lists one to two human players with login and point awards', function (): void {
    $game = collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => $category['games'])->firstWhere('key', 'ping-pong');
    expect($game)->toMatchArray(['route' => 'games.ping-pong', 'min_players' => 1, 'max_players' => 2, 'multiplayer' => true, 'awards_points' => true, 'guest_playable' => false, 'requires_grade' => false, 'min_grade' => 1, 'max_grade' => 12, 'descriptionKey' => 'portal.games.pingPong']);
    expect(StoreGameResultRequest::GAMES['ping-pong'])->toMatchArray(['max_points' => 18150, 'max_players' => 2, 'max_level' => 3, 'missions' => ['room']]);
});

it('supports generic invite presence resume and PIN lookup', function (): void {
    $user = User::factory()->withPlayerDetails()->create();
    Http::fake(['*' => Http::response(['rooms' => [['game' => 'ping-pong', 'pin' => '482913', 'phase' => 'lobby', 'open' => true, 'host' => true]]])]);
    $this->actingAs($user)->get('/games/ping-pong/join/482913')->assertRedirect('/games/ping-pong?pin=482913');
    expect(app(ActiveGames::class)->for($user)[0]['url'])->toBe('/games/ping-pong?pin=482913')
        ->and(app(RoomPinLookup::class)->find('482913')[0])->toMatchArray(['game_key' => 'ping-pong', 'open' => true, 'url' => '/games/ping-pong?pin=482913']);
});

it('records signed capped results once and never creates a bot account', function (string $locale): void {
    $user = User::factory()->create(['locale' => $locale]);
    $payload = pingPongResult($user);
    $usersBefore = User::query()->count();
    postPingPongResult($payload)->assertCreated();
    postPingPongResult($payload)->assertOk()->assertJson(['status' => 'duplicate']);

    expect(GameHistory::query()->sole()->game_name)->toBe('Ping Pong')
        ->and($user->pointLedgers()->count())->toBe(1)
        ->and((int) $user->pointLedgers()->sum('points'))->toBe(18150)
        ->and(GameMatch::query()->sole()->players()->count())->toBe(2)
        ->and(User::query()->count())->toBe($usersBefore);
})->with(['id', 'en']);

it('records bank answers with the original choice for question stats', function (): void {
    $user = User::factory()->create(['locale' => 'id']);
    $question = Question::factory()->create(['games' => ['ping-pong'], 'options' => ['A', 'B', 'C', 'D'], 'answer' => 1]);
    $payload = [...pingPongResult($user), 'answers' => [
        ['key' => $question->key, 'correct' => true, 'choice' => 1],
        ['key' => $question->key, 'correct' => false, 'choice' => 3],
        ['key' => 'missing-question', 'correct' => true, 'choice' => 0],
    ]];

    postPingPongResult($payload)->assertCreated();

    $answers = QuestionAnswer::query()->orderBy('id')->get();
    expect($answers)->toHaveCount(2)
        ->and($answers->pluck('game_key')->unique()->all())->toBe(['ping-pong'])
        ->and($answers->pluck('choice')->all())->toBe([1, 3])
        ->and($answers->pluck('correct')->all())->toBe([true, false])
        ->and($question->fresh())->times_answered->toBe(2)->times_correct->toBe(1);
});

it('tracks ping pong as a multiple choice bank game', function (): void {
    expect(Question::GAMES)->toContain('ping-pong')
        ->and(Question::CHOICE_ONLY_GAMES)->toContain('ping-pong');
});

it('distributes sky quiz choice questions to ping pong and removes them on rollback', function (): void {
    Question::query()->delete();
    $trivia = Question::factory()->create(['games' => ['sky-quiz', 'quiz-duel']]);
    $already = Question::factory()->create(['games' => ['sky-quiz', 'ping-pong']]);
    $trueFalse = Question::factory()->trueFalse()->create(['games' => ['sky-quiz', 'flag-quest']]);
    $other = Question::factory()->create(['games' => ['market-math']]);
    $migration = require database_path('migrations/2026_10_29_090001_distribute_trivia_questions_to_ping_pong.php');

    $migration->up();
    $migration->up();

    expect($trivia->fresh()->games)->toBe(['sky-quiz', 'quiz-duel', 'ping-pong'])
        ->and($already->fresh()->games)->toBe(['sky-quiz', 'ping-pong'])
        ->and($trueFalse->fresh()->games)->toBe(['sky-quiz', 'flag-quest'])
        ->and($other->fresh()->games)->toBe(['market-math']);

    $migration->down();

    expect($trivia->fresh()->games)->toBe(['sky-quiz', 'quiz-duel'])
        ->and($already->fresh()->games)->toBe(['sky-quiz']);
});

it('rejects invalid result caps missions prefixes and seat limits', function (string $field, mixed $value): void {
    $user = User::factory()->create();
    $payload = pingPongResult($user);
    data_set($payload, $field, $value);
    postPingPongResult($payload)->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(GameHistory::query()->count())->toBe(0);
})->with([
    ['points', 18151],
    ['points', -1],
    ['mission', 'solo'],
    ['event_id', 'bb-1-room-1790000000000'],
    ['match.level', 4],
    ['match.players', array_fill(0, 3, ['name' => 'Player', 'grade' => 10, 'rank' => 1, 'score' => 0, 'correct' => 0, 'wrong' => 0])],
]);

it('rejects unsigned results', function (): void {
    $user = User::factory()->create();
    $this->postJson('/api/internal/game-results', pingPongResult($user))->assertForbidden();
});

it('ships matching catalog labels in both locales', function (): void {
    foreach (['id', 'en'] as $locale) {
        $catalog = json_decode(file_get_contents(resource_path("js/locales/{$locale}-player.json")), true);
        expect($catalog['player']['pingPong'])->not->toBeEmpty()
            ->and($catalog['portal']['games']['pingPong'])->not->toBeEmpty();
    }
});

it('ships ping pong tutorial media', function (string $extension, string $signature): void {
    $path = public_path('tutorials/cara-bermain-ping-pong.'.$extension);
    expect($path)->toBeFile()->and(file_get_contents($path, length: 12))->toContain($signature);
})->with([['mp4', 'ftyp'], ['pdf', '%PDF']]);

it('maps ping pong websocket traffic on both gateways', function (string $file): void {
    $config = file_get_contents(base_path($file));
    expect($config)->toContain('location = /game-ws/ping-pong {', '/ws/ping-pong$is_args$args;');
})->with(['dashboard-gateway.dev.conf', 'deploy/nginx/gateway.prod.conf']);
