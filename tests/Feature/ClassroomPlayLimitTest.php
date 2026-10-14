<?php

use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Services\Classrooms\ClassroomContext;
use App\Services\Classrooms\ClassroomPlayLimit;
use App\Services\GameServiceSigner;

const PLAY_LIMIT_SECRET = 'pppppppppppppppppppppppppppppppppppppppp';

beforeEach(function (): void {
    $this->withoutVite();
    config(['game-service.secret' => PLAY_LIMIT_SECRET]);

    $this->teacher = User::factory()->teacher()->create();
    $this->student = User::factory()->create();
    PlayerProfile::factory()->for($this->student)->create(['grade' => 5]);
    $this->classroom = Classroom::factory()->create([
        'teacher_id' => $this->teacher->id,
        'pin' => '135790',
        'starts_at' => now()->subMinutes(10),
        'ends_at' => now()->addHour(),
    ]);
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'ping-pong', 'sort_order' => 0, 'max_plays' => 2]);
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'flag-quest', 'sort_order' => 1]);
    $this->classroom->members()->create(['user_id' => $this->student->id, 'joined_at' => now()]);
});

function playLimitPlays(int $count, string $gameKey = 'ping-pong'): void
{
    GameHistory::factory()->count($count)->create([
        'user_id' => test()->student->id,
        'classroom_id' => test()->classroom->id,
        'game_key' => $gameKey,
    ]);
}

/** @return array<string, mixed> */
function playLimitClaims(string $token): array
{
    [$payload] = explode('.', $token);

    return json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
}

/** @param  array<string, mixed>  $overrides */
function postPlayLimitResult(array $overrides = []): void
{
    $body = (string) json_encode([
        'event_id' => 'pp-'.test()->student->id.'-room-'.hrtime(true),
        'user_id' => test()->student->id,
        'game_key' => 'ping-pong',
        'mission' => 'room',
        'grade' => 5,
        'points' => 50,
        'correct' => 3,
        'wrong' => 1,
        'duration_seconds' => 60,
        'completed_at' => now()->toIso8601String(),
        ...$overrides,
    ]);
    $timestamp = (string) now()->getTimestamp();

    test()->call('POST', '/api/internal/game-results', [], [], [], [
        'HTTP_X_GAME_TIMESTAMP' => $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, PLAY_LIMIT_SECRET),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $body)->assertCreated();
}

/** @return array<string, mixed> */
function playLimitPayload(array $games): array
{
    return [
        'name' => 'Kelas Batas',
        'starts_at' => now()->addMinutes(10)->toIso8601String(),
        'duration_minutes' => 60,
        'max_members' => 30,
        'games' => $games,
    ];
}

it('stores max plays per game and keeps empty as unlimited', function (): void {
    $this->actingAs($this->teacher)->post('/teacher/classrooms', playLimitPayload([
        ['game_key' => 'snakes-and-ladders', 'max_plays' => 2, 'question_ids' => []],
        ['game_key' => 'sky-quiz', 'max_plays' => null, 'question_ids' => []],
        ['game_key' => 'flag-quest', 'question_ids' => []],
    ]))->assertRedirect()->assertSessionHasNoErrors();

    $classroom = Classroom::query()->where('name', 'Kelas Batas')->firstOrFail();
    expect($classroom->games()->pluck('max_plays', 'game_key')->all())->toBe([
        'snakes-and-ladders' => 2,
        'sky-quiz' => null,
        'flag-quest' => null,
    ]);
});

it('rejects max plays outside 1..50', function (mixed $value): void {
    $this->actingAs($this->teacher)->post('/teacher/classrooms', playLimitPayload([
        ['game_key' => 'flag-quest', 'max_plays' => $value, 'question_ids' => []],
    ]))->assertSessionHasErrors([
        'games.0.max_plays' => __('classrooms.validation.max_plays_range', ['min' => 1, 'max' => 50]),
    ]);
})->with([0, 51, 'abc']);

it('updates max plays on edit and exposes it in edit and show props', function (): void {
    $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'starts_at' => now()->addHour(), 'ends_at' => now()->addHours(2)]);
    ClassroomGame::query()->create(['classroom_id' => $classroom->id, 'game_key' => 'flag-quest', 'sort_order' => 0, 'max_plays' => 1]);

    $this->actingAs($this->teacher)->get("/teacher/classrooms/{$classroom->id}/edit")
        ->assertInertia(fn ($page) => $page->where('classroom.games.0.max_plays', 1));

    $this->actingAs($this->teacher)->put("/teacher/classrooms/{$classroom->id}", playLimitPayload([
        ['game_key' => 'flag-quest', 'max_plays' => 5, 'question_ids' => []],
    ]))->assertRedirect()->assertSessionHasNoErrors();

    expect($classroom->games()->value('max_plays'))->toBe(5);

    $this->actingAs($this->teacher)->get("/teacher/classrooms/{$classroom->id}")
        ->assertInertia(fn ($page) => $page->where('classroom.games.0.max_plays', 5));
});

it('reports remaining plays and usage', function (): void {
    playLimitPlays(1);
    playLimitPlays(3, 'flag-quest');
    $limits = app(ClassroomPlayLimit::class);

    expect($limits->remaining($this->classroom, $this->student, 'ping-pong'))->toBe(1)
        ->and($limits->remaining($this->classroom, $this->student, 'flag-quest'))->toBeNull()
        ->and($limits->usage($this->classroom->load('games'), $this->student))->toBe([
            'ping-pong' => ['plays' => 1, 'max' => 2, 'remaining' => 1],
            'flag-quest' => ['plays' => 3, 'max' => null, 'remaining' => null],
        ]);

    playLimitPlays(1);
    expect(app(ClassroomContext::class)->canStart($this->student, 'ping-pong'))->toBeFalse()
        ->and(app(ClassroomContext::class)->canStart($this->student, 'flag-quest'))->toBeTrue()
        ->and(app(ClassroomContext::class)->currentFor($this->student, 'ping-pong')?->id)->toBe($this->classroom->id);
});

it('opens the game page while plays remain', function (): void {
    playLimitPlays(1);

    $this->actingAs($this->student)->get('/games/ping-pong')->assertOk();
});

it('redirects the game page to the classroom when the limit is reached', function (): void {
    playLimitPlays(2);

    $this->actingAs($this->student)->get('/games/ping-pong')
        ->assertRedirect('/portal/classrooms/135790')
        ->assertSessionHas('error', __('classrooms.play_limit_reached', ['game' => app(ClassroomPlayLimit::class)->gameTitle('ping-pong'), 'max' => 2]));
});

it('does not redirect students outside the classroom or after leaving', function (): void {
    playLimitPlays(2);
    $this->classroom->members()->update(['left_at' => now()]);

    $this->actingAs($this->student)->get('/games/ping-pong')->assertOk();
});

it('drops the classroom claim from the game token when the limit is reached', function (): void {
    $signer = app(GameServiceSigner::class);
    $player = ['name' => 'Budi', 'grade' => 5, 'color' => '#fff', 'accessory' => 'none'];

    playLimitPlays(1);
    expect(playLimitClaims($signer->issueToken($this->student, 'ping-pong', $player))['classroom'])->toBe($this->classroom->id);

    playLimitPlays(1);
    expect(playLimitClaims($signer->issueToken($this->student, 'ping-pong', $player))['classroom'])->toBe(0)
        ->and(playLimitClaims($signer->issueToken($this->student, 'flag-quest', $player))['classroom'])->toBe($this->classroom->id);
});

it('records the result that reaches the limit in the classroom', function (): void {
    playLimitPlays(1);

    postPlayLimitResult();

    expect(GameHistory::query()->where('user_id', $this->student->id)->latest('id')->value('classroom_id'))->toBe($this->classroom->id);
});

it('records results above the limit without the classroom', function (): void {
    playLimitPlays(2);

    postPlayLimitResult();

    $latest = GameHistory::query()->where('user_id', $this->student->id)->latest('id')->first();
    expect($latest->classroom_id)->toBeNull()
        ->and($latest->points)->toBe(50)
        ->and(GameHistory::query()->where('classroom_id', $this->classroom->id)->count())->toBe(2);
});

it('sends play limits in the hud and classroom page', function (): void {
    playLimitPlays(2);

    $this->actingAs($this->student)->getJson('/portal/classrooms/135790/hud')
        ->assertOk()
        ->assertJsonPath('limits.ping-pong', ['plays' => 2, 'max' => 2, 'remaining' => 0])
        ->assertJsonPath('limits.flag-quest', ['plays' => 0, 'max' => null, 'remaining' => null]);

    $this->actingAs($this->student)->get('/portal/classrooms/135790')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('games.0.max_plays', 2)
            ->where('usage.ping-pong.remaining', 0)
            ->where('world.hud.limits.ping-pong.remaining', 0)
        );
});

it('shows the play limit in my classroom detail games', function (): void {
    playLimitPlays(2);
    $member = $this->classroom->members()->firstOrFail();

    $this->actingAs($this->student)->get("/my-classrooms/{$member->id}")
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->where('detail.games.0.max_plays', 2)
            ->where('detail.play_limits', ['ping-pong' => 2, 'flag-quest' => null])
        );
});
