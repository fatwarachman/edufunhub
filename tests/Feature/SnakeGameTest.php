<?php

use App\Http\Requests\StoreGameResultRequest;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\SnakeRoom;
use App\Models\SnakeRoomPlayer;
use App\Models\Subject;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => str_repeat('s', 40)]);
    config(['game-service.public_snake_ws_url' => '/game-ws/snake']);
});

/**
 * @param  array<string, mixed>  $payload
 * @return array{0: string, 1: array<string, string>}
 */
function signSnakeResult(array $payload): array
{
    $body = json_encode($payload);
    $timestamp = (string) now()->getTimestamp();

    return [$body, [
        'X-Game-Timestamp' => $timestamp,
        'X-Game-Signature' => hash_hmac('sha256', $timestamp.'.'.$body, config('game-service.secret')),
        'Content-Type' => 'application/json',
        'Accept' => 'application/json',
    ]];
}

/**
 * @param  array<string, string>  $headers
 * @return array<string, string>
 */
function snakeServerHeaders(array $headers): array
{
    return collect($headers)->mapWithKeys(function (string $value, string $name): array {
        $key = strtoupper(str_replace('-', '_', $name));

        return [in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH'], true) ? $key : 'HTTP_'.$key => $value];
    })->all();
}

it('requires sign in for snake web pages and token', function (): void {
    $this->get('/games/snake')->assertRedirect('/login');
    $this->get('/games/snake/arena')->assertRedirect('/login');
    $this->postJson('/games/snake/token')->assertUnauthorized();
});

it('shows the snake game page with player profile and websocket url', function (): void {
    $user = User::factory()->create(['name' => 'Budi']);
    PlayerProfile::factory()->for($user)->create(['nickname' => 'BudiSnake', 'grade' => 4]);

    $this->actingAs($user)->get('/games/snake?pin=123456')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('games/snake/index', false)
            ->where('player.id', $user->id)
            ->where('player.name', 'BudiSnake')
            ->where('player.grade', 4)
            ->where('pin', '123456')
            ->where('wsUrl', '/game-ws/snake')
            ->where('serviceReady', true));
});

it('ignores an invalid invite pin on the snake page', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 4]);

    $this->actingAs($user)->get('/games/snake?pin=abc')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('pin', null));
});

it('redirects old arena links to the snake game page', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 4]);

    $this->actingAs($user)->get('/games/snake/arena')->assertRedirect('/games/snake');
    $this->actingAs($user)->get('/games/snake/arena/482913')->assertRedirect('/games/snake?pin=482913');
});

it('joins a snake room through the standard invite link', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 4]);

    $this->actingAs($user)->get('/games/snake/join/482913')->assertRedirect('/games/snake?pin=482913');
});

it('issues a signed snake websocket token', function (): void {
    $user = User::factory()->create();
    PlayerProfile::factory()->for($user)->create(['grade' => 6]);

    $response = $this->actingAs($user)->postJson('/games/snake/token')->assertOk();

    $token = $response->json('token');
    [$payload] = explode('.', $token);
    $claims = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

    expect($claims['game'])->toBe('snake')
        ->and($claims['sub'])->toBe($user->id)
        ->and($claims['grade'])->toBe(6);
});

it('does not accept client reported snake scores', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/games/snake/finish', ['score' => 9999, 'correct' => 99])
        ->assertNotFound();

    expect(GameHistory::query()->count())->toBe(0);
});

it('creates a room with 6-character code and creator as initial player', function (): void {
    $user = User::factory()->create();
    $subject = Subject::query()->first() ?? Subject::factory()->create(['is_active' => true]);

    $response = $this->actingAs($user)->postJson('/api/games/snake/rooms', [
        'mode' => SnakeRoom::MODE_SHARED_GRID,
        'subject_id' => $subject->id,
        'grade_level' => 'SMP',
        'max_players' => 4,
    ])->assertCreated();

    $code = $response->json('room.code');
    expect(strlen($code))->toBe(6);

    $room = SnakeRoom::query()->where('code', $code)->first();
    expect($room)->not->toBeNull()
        ->and($room->mode)->toBe(SnakeRoom::MODE_SHARED_GRID)
        ->and($room->status)->toBe(SnakeRoom::STATUS_WAITING)
        ->and($room->created_by)->toBe($user->id);

    $players = SnakeRoomPlayer::query()->where('room_id', $room->id)->get();
    expect($players)->toHaveCount(1)
        ->and($players->first()->user_id)->toBe($user->id)
        ->and($players->first()->tail_length)->toBe(18)
        ->and($players->first()->is_alive)->toBeTrue();
});

it('shows an existing room and joins a room', function (): void {
    $host = User::factory()->create();
    $guest = User::factory()->create();

    $room = SnakeRoom::factory()->create([
        'code' => 'ABC123',
        'max_players' => 3,
        'status' => SnakeRoom::STATUS_WAITING,
        'created_by' => $host->id,
    ]);
    SnakeRoomPlayer::factory()->create([
        'room_id' => $room->id,
        'user_id' => $host->id,
    ]);

    // Show room
    $this->getJson('/api/games/snake/rooms/ABC123')
        ->assertOk()
        ->assertJsonPath('room.code', 'ABC123');

    // Join room
    $joinResponse = $this->actingAs($guest)->postJson('/api/games/snake/rooms/ABC123/join')
        ->assertOk();

    expect($joinResponse->json('player.user_id'))->toBe($guest->id)
        ->and(SnakeRoomPlayer::query()->where('room_id', $room->id)->count())->toBe(2);

    // Re-joining returns current player without duplicates
    $this->actingAs($guest)->postJson('/api/games/snake/rooms/ABC123/join')
        ->assertOk();
    expect(SnakeRoomPlayer::query()->where('room_id', $room->id)->count())->toBe(2);
});

it('rejects joining when room is full or not in waiting status', function (): void {
    $host = User::factory()->create();
    $guest1 = User::factory()->create();
    $guest2 = User::factory()->create();

    $room = SnakeRoom::factory()->create([
        'code' => 'FULL01',
        'max_players' => 2,
        'status' => SnakeRoom::STATUS_WAITING,
        'created_by' => $host->id,
    ]);
    SnakeRoomPlayer::factory()->create(['room_id' => $room->id, 'user_id' => $host->id]);
    SnakeRoomPlayer::factory()->create(['room_id' => $room->id, 'user_id' => $guest1->id]);

    // Room is full
    $this->actingAs($guest2)->postJson('/api/games/snake/rooms/FULL01/join')
        ->assertStatus(422);

    // Room is playing
    $room->update(['status' => SnakeRoom::STATUS_PLAYING, 'max_players' => 10]);
    $this->actingAs($guest2)->postJson('/api/games/snake/rooms/FULL01/join')
        ->assertStatus(422);
});

it('returns curated questions filtered by school_level and subject', function (): void {
    Question::factory()->create([
        'type' => Question::TYPE_CHOICE,
        'subject' => 'civics',
        'band' => 0, // SD
        'games' => ['snake'],
        'is_active' => true,
        'prompt_id' => 'Pancasila sila ke-1 adalah?',
    ]);
    Question::factory()->create([
        'type' => Question::TYPE_CHOICE,
        'subject' => 'civics',
        'band' => 2, // SMP
        'games' => ['snake'],
        'is_active' => true,
        'prompt_id' => 'Bunyi Pembukaan UUD 1945 alinea 1?',
    ]);

    // Filter by school_level SD
    $resSD = $this->getJson('/api/games/snake/questions?school_level=SD&subject=civics')->assertOk();
    $questionsSD = $resSD->json('questions');
    expect($questionsSD)->not->toBeEmpty();
    foreach ($questionsSD as $q) {
        expect($q['subject'])->toBe('civics')
            ->and(in_array($q['band'], [0, 1], true))->toBeTrue();
    }

    // Filter by school_level SMP
    $resSMP = $this->getJson('/api/games/snake/questions?school_level=SMP&subject=civics')->assertOk();
    $questionsSMP = $resSMP->json('questions');
    expect($questionsSMP)->not->toBeEmpty();
    foreach ($questionsSMP as $q) {
        expect($q['subject'])->toBe('civics')
            ->and($q['band'])->toBe(2);
    }

    // Filter by school_level SMA
    $resSMA = $this->getJson('/api/games/snake/questions?school_level=SMA')->assertOk();
    $questionsSMA = $resSMA->json('questions');
    expect($questionsSMA)->not->toBeEmpty();
    foreach ($questionsSMA as $q) {
        expect($q['band'])->toBe(3);
    }
});

it('records signed snake result via internal webhook', function (): void {
    $user = User::factory()->create(['locale' => 'id']);
    $question = Question::factory()->create(['games' => ['snake']]);

    $payload = [
        'event_id' => 'sn-'.$user->id.'-room-'.time(),
        'user_id' => $user->id,
        'game_key' => 'snake',
        'mission' => 'room',
        'grade' => 5,
        'points' => 150,
        'correct' => 10,
        'wrong' => 1,
        'duration_seconds' => 180,
        'completed_at' => now()->toIso8601String(),
        'answers' => [
            ['key' => $question->key, 'correct' => true],
        ],
    ];

    [$body, $headers] = signSnakeResult($payload);

    $this->call('POST', '/api/internal/game-results', [], [], [], snakeServerHeaders($headers), $body)
        ->assertCreated();

    $history = GameHistory::query()->where('user_id', $user->id)->first();
    expect($history)->not->toBeNull()
        ->and($history->game_key)->toBe('snake')
        ->and($history->mission)->toBe('room')
        ->and($history->points)->toBe(150)
        ->and($user->pointLedgers()->sum('points'))->toBe(150)
        ->and($question->fresh()->times_answered)->toBe(1);
});

it('validates snake game rules in StoreGameResultRequest', function (): void {
    $user = User::factory()->create();

    // Max points is 12150 (Go points.Cap(40))
    $payloadTooManyPoints = [
        'event_id' => 'sn-'.$user->id.'-room-'.time(),
        'user_id' => $user->id,
        'game_key' => 'snake',
        'mission' => 'room',
        'grade' => 5,
        'points' => 12151,
        'correct' => 10,
        'wrong' => 0,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
    ];
    [$body, $headers] = signSnakeResult($payloadTooManyPoints);
    $this->call('POST', '/api/internal/game-results', [], [], [], snakeServerHeaders($headers), $body)
        ->assertUnprocessable();

    // Invalid mission
    $payloadInvalidMission = [
        'event_id' => 'sn-'.$user->id.'-room-'.(time() + 1),
        'user_id' => $user->id,
        'game_key' => 'snake',
        'mission' => 'invalid_mission',
        'grade' => 5,
        'points' => 100,
        'correct' => 5,
        'wrong' => 0,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
    ];
    [$body, $headers] = signSnakeResult($payloadInvalidMission);
    $this->call('POST', '/api/internal/game-results', [], [], [], snakeServerHeaders($headers), $body)
        ->assertUnprocessable();
});

it('includes snake in Question games and choice-only games', function (): void {
    expect(Question::GAMES)->toContain('snake')
        ->and(Question::CHOICE_ONLY_GAMES)->toContain('snake')
        ->and(StoreGameResultRequest::GAMES)->toHaveKey('snake');

    $admin = User::factory()->create(['is_superadmin' => true]);

    // Rejects true/false question assigned to snake
    $this->actingAs($admin)->post('/admin/questions', [
        'type' => 'true_false',
        'band' => 1,
        'grades' => [4],
        'subject' => 'science',
        'prompt_id' => 'Ular berkaki empat.',
        'answer' => 0,
        'games' => ['snake'],
        'is_active' => true,
    ])->assertSessionHasErrors(['games' => __('questions.choice_only_games')]);
});

it('registers Main Ular in the game catalog', function (): void {
    $game = collect(config('game-catalog.categories'))
        ->flatMap(fn ($c) => $c['games'])
        ->firstWhere('key', 'snake');

    $idCatalog = json_decode((string) file_get_contents(resource_path('js/locales/id-player.json')), true);

    expect($game)->not->toBeNull()
        ->and($game['route'])->toBe('games.snake')
        ->and($game['multiplayer'])->toBeTrue()
        ->and(data_get($idCatalog, $game['titleKey']))->toBe('Main Ular');
});

it('ships the snake how-to-play video and slides', function (string $file, string $signature): void {
    $path = public_path('tutorials/'.$file);

    expect($path)->toBeFile()
        ->and(file_get_contents($path, length: 12))->toContain($signature);
})->with([
    'video' => ['cara-bermain-main-ular.mp4', 'ftyp'],
    'slides' => ['cara-bermain-main-ular.pdf', '%PDF'],
]);
