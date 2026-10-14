<?php

use App\Jobs\SendWhatsAppMessage;
use App\Models\Role;
use App\Models\TeacherRequest;
use App\Models\User;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\WhatsAppSettings;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    Queue::fake();
    app(WhatsAppSettings::class)->save(true, ['welcome' => true, 'ability_analysis' => true, 'friend_request' => true, 'teacher_request' => true]);
});

function teacherAlertReviewer(array $attributes = []): User
{
    return User::factory()->create(['locale' => 'id', 'whatsapp_number' => '62812'.random_int(1000000, 9999999), ...$attributes]);
}

function requestTeacherAccess(User $player, array $data = ['subject_key' => 'math', 'message' => 'Saya guru <b>matematika</b>.']): void
{
    test()->actingAs($player)->withoutMiddleware(PreventRequestForgery::class)
        ->post('/teacher-request', $data)
        ->assertRedirect(route('teacher-request.create'));
}

it('shows the pending teacher request count on the superadmin menu', function (): void {
    $super = User::factory()->superadmin()->create();
    TeacherRequest::query()->create(['user_id' => User::factory()->create()->id, 'status' => TeacherRequest::PENDING]);
    TeacherRequest::query()->create(['user_id' => User::factory()->create()->id, 'status' => TeacherRequest::PENDING]);
    TeacherRequest::query()->create(['user_id' => User::factory()->create()->id, 'status' => TeacherRequest::APPROVED]);

    $this->actingAs($super)->get('/admin/teacher-requests')
        ->assertInertia(fn (Assert $page) => $page->where('adminBadges', ['/admin/teacher-requests' => 2]));
});

it('does not share the count outside the admin panel or with non-superadmins', function (): void {
    TeacherRequest::query()->create(['user_id' => User::factory()->create()->id, 'status' => TeacherRequest::PENDING]);
    $super = User::factory()->superadmin()->create();
    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => Role::ADMIN], ['name' => 'Admin'])->id);

    $this->actingAs($super)->get('/dashboard')
        ->assertInertia(fn (Assert $page) => $page->where('adminBadges', []));
    $this->actingAs($admin)->get('/admin/users')
        ->assertInertia(fn (Assert $page) => $page->where('adminBadges', []));
});

it('sends a WhatsApp alert to every superadmin and admin when a player asks', function (): void {
    $super = teacherAlertReviewer(['is_superadmin' => true, 'name' => 'Super']);
    $admin = teacherAlertReviewer(['name' => 'Admin En', 'locale' => 'en']);
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => Role::ADMIN], ['name' => 'Admin'])->id);
    $noNumber = User::factory()->superadmin()->create(['whatsapp_number' => null]);
    $optedOut = teacherAlertReviewer(['is_superadmin' => true, 'whatsapp_notifications' => false]);
    $disabled = teacherAlertReviewer(['is_superadmin' => true, 'disabled_at' => now()]);
    $plain = teacherAlertReviewer();
    $player = User::factory()->create(['name' => 'Budi Guru']);

    requestTeacherAccess($player);

    $messages = WhatsAppMessage::query()->where('event', 'teacher_request')->get()->keyBy('user_id');
    expect($messages->keys()->sort()->values()->all())->toBe(collect([$super->id, $admin->id])->sort()->values()->all())
        ->and($messages[$super->id]->body)->toContain('Budi Guru')->toContain('mengajukan permintaan menjadi guru')
        ->toContain('Saya guru <b>matematika</b>.')->toContain(url('/admin/teacher-requests'))
        ->and($messages[$admin->id]->body)->toContain('asked for teacher access');
    expect($messages->has($noNumber->id) || $messages->has($optedOut->id) || $messages->has($disabled->id) || $messages->has($plain->id))->toBeFalse();
    Queue::assertPushed(SendWhatsAppMessage::class, 2);
});

it('respects the teacher request switch on /admin/whatsapp', function (): void {
    app(WhatsAppSettings::class)->save(true, ['welcome' => true, 'ability_analysis' => true, 'friend_request' => true, 'teacher_request' => false]);
    $super = teacherAlertReviewer(['is_superadmin' => true]);

    requestTeacherAccess(User::factory()->create(), ['subject_key' => null, 'message' => null]);

    $message = WhatsAppMessage::query()->where('user_id', $super->id)->sole();
    expect($message->status)->toBe(WhatsAppMessage::SKIPPED)
        ->and($message->body)->toContain('Belum dipilih');
    Queue::assertNothingPushed();
});

it('does not alert again when the pending request is refused as a duplicate', function (): void {
    teacherAlertReviewer(['is_superadmin' => true]);
    $player = User::factory()->create();
    requestTeacherAccess($player);

    $this->actingAs($player)->withoutMiddleware(PreventRequestForgery::class)
        ->post('/teacher-request', ['subject_key' => 'math'])
        ->assertSessionHasErrors('request');

    expect(WhatsAppMessage::query()->where('event', 'teacher_request')->count())->toBe(1);
});
