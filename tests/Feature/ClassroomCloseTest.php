<?php

use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\User;
use App\Services\Classrooms\ClassroomCloser;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

const CLASSROOM_CLOSE_SECRET = 'ssssssssssssssssssssssssssssssssssssssss';

beforeEach(function (): void {
    $this->withoutVite();
    config([
        'game-service.secret' => CLASSROOM_CLOSE_SECRET,
        'game-service.classroom_close_url' => 'http://game.test/internal/classroom/close',
        'game-service.classroom_kick_url' => 'http://classroom.test/internal/classroom/kick',
        'chat-service.secret' => str_repeat('c', 40),
        'chat-service.publish_url' => 'http://chat.test/internal/publish',
    ]);
    Http::fake([
        'chat.test/*' => Http::response(['delivered' => 1]),
        '*' => Http::response(null, 204),
    ]);

    $this->teacher = User::factory()->teacher()->create();
    $this->student = User::factory()->create();
    $this->leaver = User::factory()->create();
    $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'pin' => '876543']);
    ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'floor-drop', 'sort_order' => 0]);
    $this->classroom->members()->create(['user_id' => $this->student->id, 'joined_at' => now()]);
    $this->classroom->members()->create(['user_id' => $this->leaver->id, 'joined_at' => now(), 'left_at' => now()]);
});

function signedFor(Request $request, string $secret): bool
{
    return hash_hmac('sha256', $request->header('X-Game-Timestamp')[0].'.'.$request->body(), $secret) === $request->header('X-Game-Signature')[0];
}

it('closes game rooms, the world and student pages when the teacher ends the class', function (): void {
    $this->actingAs($this->teacher)
        ->post(route('teacher.classrooms.end', $this->classroom))
        ->assertRedirect();

    expect($this->classroom->fresh()->closed_at)->not->toBeNull();

    Http::assertSent(fn (Request $r): bool => $r->url() === 'http://game.test/internal/classroom/close'
        && $r->data() === ['classroom' => $this->classroom->id]
        && signedFor($r, CLASSROOM_CLOSE_SECRET));
    Http::assertSent(fn (Request $r): bool => $r->url() === 'http://classroom.test/internal/classroom/kick'
        && $r->data() === ['classroom' => $this->classroom->id, 'user' => 0]
        && signedFor($r, CLASSROOM_CLOSE_SECRET));
    Http::assertSent(fn (Request $r): bool => $r->url() === 'http://chat.test/internal/publish'
        && $r->data()['users'] === [$this->student->id]
        && $r->data()['event'] === ['t' => 'classroom_ended', 'classroom_id' => $this->classroom->id, 'pin' => '876543']);
});

it('closes classrooms whose time ran out exactly once', function (): void {
    $running = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);
    $this->classroom->update(['ends_at' => now()->subMinute()]);

    $this->artisan('classrooms:close-ended')->assertSuccessful();
    $this->artisan('classrooms:close-ended')->assertSuccessful();

    expect($this->classroom->fresh()->closed_at)->not->toBeNull()
        ->and($running->fresh()->closed_at)->toBeNull();
    Http::assertSentCount(3);
});

it('re-arms the close when the teacher extends an ended classroom', function (): void {
    app(ClassroomCloser::class)->close($this->classroom);
    expect($this->classroom->fresh()->closed_at)->not->toBeNull();

    $this->actingAs($this->teacher)->put(route('teacher.classrooms.update', $this->classroom), [
        'name' => 'Kelas lanjut',
        'description' => null,
        'starts_at' => now()->addMinutes(5)->format('Y-m-d H:i'),
        'duration_minutes' => 60,
        'max_members' => 30,
        'games' => [['game_key' => 'floor-drop', 'question_ids' => []]],
    ])->assertSessionHasNoErrors();

    expect($this->classroom->fresh()->closed_at)->toBeNull();
});

it('schedules the automatic close every minute', function (): void {
    $this->artisan('schedule:list')->expectsOutputToContain('classrooms:close-ended')->assertSuccessful();
});
