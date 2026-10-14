<?php

use App\Models\Classroom;
use App\Models\ClassroomAnnouncement;
use App\Models\User;
use App\Services\Chat\ChatServiceClient;
use App\Services\Classrooms\ClassroomAnnouncer;
use Illuminate\Support\Facades\Http;

beforeEach(function (): void {
    $this->withoutVite();
    config([
        'chat-service.secret' => str_repeat('c', 40),
        'chat-service.publish_url' => 'http://chat.test/internal/publish',
    ]);
    Http::fake([
        'chat.test/*' => Http::response(['delivered' => 1]),
        '*' => Http::response(null, 204),
    ]);

    $this->teacher = User::factory()->teacher()->create();
    $this->otherTeacher = User::factory()->teacher()->create();
    $this->student = User::factory()->create();
    $this->classmate = User::factory()->create();
    $this->leaver = User::factory()->create();
    $this->outsider = User::factory()->create();
    $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'pin' => '246810']);

    foreach ([$this->student, $this->classmate] as $user) {
        $this->classroom->members()->create(['user_id' => $user->id, 'joined_at' => now()]);
    }
    $this->classroom->members()->create(['user_id' => $this->leaver->id, 'joined_at' => now()->subHour(), 'left_at' => now()->subMinute()]);
});

/**
 * Bodies the fake chat service received.
 *
 * @return list<array{users: list<int>, event: array<string, mixed>}>
 */
function announcementPublishes(): array
{
    return Http::recorded()
        ->filter(fn (array $pair): bool => str_contains($pair[0]->url(), 'chat.test/internal/publish'))
        ->map(fn (array $pair): array => json_decode($pair[0]->body(), true))
        ->values()
        ->all();
}

function announcementUrl(?Classroom $classroom = null): string
{
    return '/teacher/classrooms/'.($classroom ?? test()->classroom)->id.'/announcements';
}

it('lets the owner teacher send an announcement and pushes it to active members only', function (): void {
    $this->actingAs($this->teacher)
        ->post(announcementUrl(), ['title' => 'Perhatian', 'body' => "Istirahat 5 menit\nlalu lanjut.", 'display_seconds' => 30])
        ->assertRedirect()
        ->assertSessionHas('success', __('classrooms.announcement_sent'));

    $announcement = ClassroomAnnouncement::query()->sole();
    expect($announcement->classroom_id)->toBe($this->classroom->id)
        ->and($announcement->teacher_id)->toBe($this->teacher->id)
        ->and($announcement->display_seconds)->toBe(30)
        ->and((int) $announcement->starts_at->diffInSeconds($announcement->ends_at))->toBe(30);

    $publishes = announcementPublishes();
    expect($publishes)->toHaveCount(1);
    expect($publishes[0]['users'])->toEqualCanonicalizing([$this->student->id, $this->classmate->id])
        ->and($publishes[0]['event']['t'])->toBe('classroom_announcement')
        ->and($publishes[0]['event']['classroom_id'])->toBe($this->classroom->id)
        ->and($publishes[0]['event']['announcement']['id'])->toBe($announcement->id)
        ->and($publishes[0]['event']['announcement']['body'])->toBe("Istirahat 5 menit\nlalu lanjut.");
});

it('calls the chat client publish with active member ids', function (): void {
    $chat = Mockery::mock(ChatServiceClient::class);
    $chat->shouldReceive('publish')
        ->once()
        ->withArgs(function (array $userIds, array $event): bool {
            sort($userIds);
            $expected = [$this->student->id, $this->classmate->id];
            sort($expected);

            return $userIds === $expected && $event['t'] === 'classroom_announcement';
        })
        ->andReturnTrue();
    app()->instance(ChatServiceClient::class, $chat);

    $this->actingAs($this->teacher)
        ->post(announcementUrl(), ['body' => 'Halo', 'display_seconds' => 10])
        ->assertRedirect();
});

it('validates the announcement input', function (array $payload, string $field): void {
    $this->actingAs($this->teacher)
        ->post(announcementUrl(), $payload)
        ->assertSessionHasErrors($field);

    expect(ClassroomAnnouncement::query()->count())->toBe(0);
})->with([
    'too short' => [['body' => 'Halo', 'display_seconds' => 4], 'display_seconds'],
    'too long' => [['body' => 'Halo', 'display_seconds' => 601], 'display_seconds'],
    'missing duration' => [['body' => 'Halo'], 'display_seconds'],
    'empty body' => [['body' => '   ', 'display_seconds' => 30], 'body'],
    'body over 1000' => [['body' => str_repeat('a', 1001), 'display_seconds' => 30], 'body'],
    'title over 120' => [['title' => str_repeat('a', 121), 'body' => 'Halo', 'display_seconds' => 30], 'title'],
]);

it('accepts the duration bounds', function (int $seconds): void {
    $this->actingAs($this->teacher)
        ->post(announcementUrl(), ['body' => str_repeat('a', 1000), 'display_seconds' => $seconds])
        ->assertSessionHasNoErrors();

    expect(ClassroomAnnouncement::query()->count())->toBe(1);
})->with([5, 600]);

it('forbids other teachers and students', function (): void {
    $this->actingAs($this->otherTeacher)
        ->post(announcementUrl(), ['body' => 'Halo', 'display_seconds' => 30])
        ->assertForbidden();

    $this->actingAs($this->student)
        ->post(announcementUrl(), ['body' => 'Halo', 'display_seconds' => 30])
        ->assertForbidden();

    expect(ClassroomAnnouncement::query()->count())->toBe(0)
        ->and(announcementPublishes())->toBe([]);
});

it('rejects announcements for scheduled or ended classrooms', function (string $state): void {
    $classroom = Classroom::factory()->{$state}()->create(['teacher_id' => $this->teacher->id]);

    $this->actingAs($this->teacher)
        ->post(announcementUrl($classroom), ['body' => 'Halo', 'display_seconds' => 30])
        ->assertSessionHasErrors('announcement');

    expect(ClassroomAnnouncement::query()->count())->toBe(0);
})->with(['scheduled', 'ended']);

it('gives active members the current announcement', function (): void {
    $announcement = ClassroomAnnouncement::factory()->create([
        'classroom_id' => $this->classroom->id,
        'title' => '<b>Judul</b>',
        'display_seconds' => 60,
        'starts_at' => now()->subSeconds(20),
        'ends_at' => now()->addSeconds(40),
    ]);

    $this->actingAs($this->student)
        ->getJson('/portal/classrooms/246810/announcement')
        ->assertOk()
        ->assertJsonPath('announcement.id', $announcement->id)
        ->assertJsonPath('announcement.title', '<b>Judul</b>')
        ->assertJsonPath('announcement.remaining_seconds', 40);
});

it('returns null once the announcement expired', function (): void {
    ClassroomAnnouncement::factory()->expired()->create(['classroom_id' => $this->classroom->id]);

    $this->actingAs($this->student)
        ->getJson('/portal/classrooms/246810/announcement')
        ->assertOk()
        ->assertJsonPath('announcement', null);
});

it('forbids the student endpoint to non members, removed members and inactive classrooms', function (): void {
    $this->actingAs($this->outsider)->getJson('/portal/classrooms/246810/announcement')->assertForbidden();
    $this->actingAs($this->leaver)->getJson('/portal/classrooms/246810/announcement')->assertForbidden();

    $this->classroom->update(['ends_at' => now()->subMinute()]);
    $this->actingAs($this->student)->getJson('/portal/classrooms/246810/announcement')->assertForbidden();
});

it('stops an announcement early and pushes the end event', function (): void {
    $announcement = ClassroomAnnouncement::factory()->create(['classroom_id' => $this->classroom->id]);

    $this->actingAs($this->teacher)
        ->post(announcementUrl().'/'.$announcement->id.'/stop')
        ->assertRedirect()
        ->assertSessionHas('success', __('classrooms.announcement_stopped'));

    expect($announcement->fresh()->ends_at->lte(now()))->toBeTrue();

    $this->actingAs($this->student)
        ->getJson('/portal/classrooms/246810/announcement')
        ->assertJsonPath('announcement', null);

    $publishes = announcementPublishes();
    expect($publishes)->toHaveCount(1)
        ->and($publishes[0]['event'])->toBe(['t' => 'classroom_announcement_end', 'classroom_id' => $this->classroom->id, 'id' => $announcement->id])
        ->and($publishes[0]['users'])->toEqualCanonicalizing([$this->student->id, $this->classmate->id]);
});

it('scopes the stop route to the classroom and owner', function (): void {
    $otherClassroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);
    $foreign = ClassroomAnnouncement::factory()->create(['classroom_id' => $otherClassroom->id]);

    $this->actingAs($this->teacher)
        ->post(announcementUrl().'/'.$foreign->id.'/stop')
        ->assertNotFound();

    $own = ClassroomAnnouncement::factory()->create(['classroom_id' => $this->classroom->id]);
    $this->actingAs($this->otherTeacher)
        ->post(announcementUrl().'/'.$own->id.'/stop')
        ->assertForbidden();

    expect($foreign->fresh()->isActive())->toBeTrue()
        ->and($own->fresh()->isActive())->toBeTrue();
});

it('shares announcements with the teacher show page and the student pages', function (): void {
    $active = ClassroomAnnouncement::factory()->create(['classroom_id' => $this->classroom->id]);
    ClassroomAnnouncement::factory()->expired()->create(['classroom_id' => $this->classroom->id]);

    $this->actingAs($this->teacher)
        ->get('/teacher/classrooms/'.$this->classroom->id)
        ->assertInertia(fn ($page) => $page
            ->has('announcements', 2)
            ->where('announcements.0.id', $active->id + 1)
            ->where('announcements.1.id', $active->id)
            ->where('announcements.1.active', true)
            ->where('announcements.0.active', false));

    $this->actingAs($this->student)
        ->get('/portal/classrooms/246810')
        ->assertInertia(fn ($page) => $page->where('announcement.id', $active->id));

    $this->actingAs($this->outsider)
        ->get('/portal/classrooms/246810')
        ->assertInertia(fn ($page) => $page->where('announcement', null));
});

it('does not publish when no member is active', function (): void {
    $classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);

    app(ClassroomAnnouncer::class)->announce($classroom, $this->teacher, ['body' => 'Halo', 'display_seconds' => 10]);

    Http::assertNothingSent();
});
