<?php

use App\Models\Feedback;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->superadmin = User::factory()->create(['is_superadmin' => true]);
    $this->player = User::factory()->create(['name' => 'Rani Player']);

    Feedback::factory()->create([
        'user_id' => $this->player->id,
        'type' => 'bug',
        'message' => 'The crossword timer freezes after the second word.',
        'status' => 'new',
        'metadata' => ['game' => 'crossword', 'may_contact' => true],
    ]);
    Feedback::factory()->create([
        'user_id' => $this->player->id,
        'type' => 'feature',
        'message' => 'Please add a dark mode for the player portal.',
        'status' => 'in_progress',
    ]);
});

it('allows a superadmin to view the feedback list', function () {
    actingAs($this->superadmin)
        ->get('/admin/feedback')
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('admin/feedback/index')
            ->has('feedback.data', 2)
            ->where('counts.total', 2)
            ->where('counts.new', 1)
            ->where('counts.in_progress', 1)
            ->where('feedback.data.0.type', 'feature')
            ->where('feedback.data.1.game', 'crossword')
            ->where('feedback.data.1.may_contact', true)
            ->where('feedback.data.1.user.name', 'Rani Player'));
});

it('allows an admin role user to view and update feedback', function () {
    $admin = User::factory()->create();
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']));
    $feedback = Feedback::query()->where('type', 'bug')->firstOrFail();

    actingAs($admin)->get('/admin/feedback')->assertOk();
    actingAs($admin)
        ->patch("/admin/feedback/{$feedback->id}", ['status' => 'resolved'])
        ->assertRedirect();

    expect($feedback->fresh()->status)->toBe('resolved');
});

it('forbids players from the admin feedback list and status update', function () {
    $feedback = Feedback::query()->firstOrFail();

    actingAs($this->player)->get('/admin/feedback')->assertForbidden();
    actingAs($this->player)
        ->patch("/admin/feedback/{$feedback->id}", ['status' => 'resolved'])
        ->assertForbidden();

    expect($feedback->fresh()->status)->toBe('new');
});

it('redirects guests away from the admin feedback list', function () {
    $this->get('/admin/feedback')->assertRedirect('/login');
});

it('updates the status through every allowed value', function (string $status) {
    $feedback = Feedback::query()->where('type', 'bug')->firstOrFail();

    actingAs($this->superadmin)
        ->patch("/admin/feedback/{$feedback->id}", ['status' => $status])
        ->assertRedirect()
        ->assertSessionHas('success');

    expect($feedback->fresh()->status)->toBe($status);
})->with(['new', 'in_progress', 'resolved', 'dismissed']);

it('rejects invalid status values', function () {
    $feedback = Feedback::query()->firstOrFail();

    actingAs($this->superadmin)
        ->patchJson("/admin/feedback/{$feedback->id}", ['status' => 'archived'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['status']);
});

it('filters feedback by type, status and search', function () {
    actingAs($this->superadmin)
        ->get('/admin/feedback?type=bug')
        ->assertInertia(fn ($page) => $page->has('feedback.data', 1)->where('feedback.data.0.type', 'bug'));

    actingAs($this->superadmin)
        ->get('/admin/feedback?status=in_progress')
        ->assertInertia(fn ($page) => $page->has('feedback.data', 1)->where('feedback.data.0.type', 'feature'));

    actingAs($this->superadmin)
        ->get('/admin/feedback?search=crossword')
        ->assertInertia(fn ($page) => $page->has('feedback.data', 1)->where('feedback.data.0.type', 'bug'));

    actingAs($this->superadmin)
        ->get('/admin/feedback?search=Rani')
        ->assertInertia(fn ($page) => $page->has('feedback.data', 2));

    actingAs($this->superadmin)
        ->get('/admin/feedback?type=bogus&status=bogus')
        ->assertInertia(fn ($page) => $page->has('feedback.data', 2));
});

it('prunes old dismissed feedback like archived entries', function () {
    config(['retention.feedback' => ['enabled' => true, 'days' => 30, 'archived_only' => true]]);
    $old = Feedback::factory()->create(['status' => 'dismissed', 'created_at' => now()->subDays(60)]);
    $kept = Feedback::factory()->create(['status' => 'resolved', 'created_at' => now()->subDays(60)]);

    Artisan::call('app:prune-old-records');

    expect(Feedback::find($old->id))->toBeNull()
        ->and(Feedback::find($kept->id))->not->toBeNull();
});
