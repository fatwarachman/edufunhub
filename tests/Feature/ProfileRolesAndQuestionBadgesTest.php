<?php

use App\Models\Module;
use App\Models\Permission;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    $this->superRole = Role::query()->firstOrCreate(['slug' => Role::SUPER_ADMIN], ['name' => 'Super Admin', 'is_system' => true]);
    $this->adminRole = Role::query()->firstOrCreate(['slug' => Role::ADMIN], ['name' => 'Admin', 'is_system' => true]);
    $this->superadmin = User::factory()->create(['is_superadmin' => true]);
    $this->superadmin->roles()->attach($this->superRole);
});

describe('roles', function (): void {
    it('gives full super admin access when a user has both admin and super admin roles', function (): void {
        $user = User::factory()->create();

        $this->actingAs($this->superadmin)->put("/admin/users/{$user->id}", [
            'name' => $user->name,
            'email' => $user->email,
            'roles' => [$this->adminRole->id, $this->superRole->id],
        ])->assertSessionHasNoErrors()->assertRedirect();

        $user->refresh();
        expect($user->is_superadmin)->toBeTrue()->and($user->isAdmin())->toBeTrue();

        $this->actingAs($user)->get('/admin/questions')->assertOk();
        $this->actingAs($user)->get('/admin/point-rules')->assertOk();
        $this->actingAs($user)->get('/admin/dashboard')->assertInertia(fn (Assert $page) => $page
            ->where('auth.user.is_superadmin', true)
            ->where('auth.user.is_admin', true));
    });

    it('removes super admin access together with the role', function (): void {
        $user = User::factory()->create(['is_superadmin' => true]);
        $user->roles()->attach([$this->superRole->id, $this->adminRole->id]);

        $this->actingAs($this->superadmin)->put("/admin/users/{$user->id}", [
            'name' => $user->name,
            'email' => $user->email,
            'roles' => [$this->adminRole->id],
        ])->assertSessionHasNoErrors();

        expect($user->fresh()->is_superadmin)->toBeFalse();
        $this->actingAs($user->fresh())->get('/admin/dashboard')->assertOk();
        $this->actingAs($user->fresh())->get('/admin/questions')->assertForbidden();
    });

    it('lets only a super admin give the super admin role', function (): void {
        $admin = User::factory()->create();
        $admin->roles()->attach($this->adminRole);
        $target = User::factory()->create();

        $this->actingAs($admin)->put("/admin/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'roles' => [$this->superRole->id],
        ])->assertSessionHasErrors(['roles' => __('roles.super_admin_only')]);

        expect($target->fresh()->is_superadmin)->toBeFalse()
            ->and($target->fresh()->roles()->count())->toBe(0);
    });

    it('does not let a super admin remove their own super admin role', function (): void {
        $this->actingAs($this->superadmin)->put("/admin/users/{$this->superadmin->id}", [
            'name' => $this->superadmin->name,
            'email' => $this->superadmin->email,
            'roles' => [$this->adminRole->id],
        ])->assertSessionHasErrors(['roles' => __('roles.keep_own_super_admin')]);

        expect($this->superadmin->fresh()->is_superadmin)->toBeTrue();
    });

    it('syncs the super admin flag with the role in the migration', function (): void {
        $flagOnly = User::factory()->create(['is_superadmin' => true]);
        $roleOnly = User::factory()->create(['is_superadmin' => false]);
        $roleOnly->roles()->attach($this->superRole);
        Schema::drop('permission_user');

        (require database_path('migrations/2026_10_23_090001_create_permission_user_table.php'))->up();

        expect($roleOnly->fresh()->is_superadmin)->toBeTrue()
            ->and($flagOnly->roles()->where('slug', Role::SUPER_ADMIN)->exists())->toBeTrue();
    });
});

describe('permission overrides', function (): void {
    beforeEach(function (): void {
        $module = Module::query()->create(['name' => 'Quiz', 'slug' => 'quiz-test', 'is_active' => true]);
        $this->viaRole = Permission::query()->create(['name' => 'View Quiz', 'slug' => 'quiz-test-view', 'module_id' => $module->id]);
        $this->extra = Permission::query()->create(['name' => 'Delete Quiz', 'slug' => 'quiz-test-delete', 'module_id' => $module->id]);
        $this->guruRole = Role::query()->firstOrCreate(['slug' => Role::TEACHER], ['name' => 'Guru']);
        $this->guruRole->permissions()->syncWithoutDetaching([$this->viaRole->id]);
    });

    it('gives a user a permission directly on top of their roles', function (): void {
        $user = User::factory()->create();
        $user->roles()->attach($this->guruRole);

        $this->actingAs($this->superadmin)->get("/admin/users/{$user->id}/edit")->assertInertia(fn (Assert $page) => $page
            ->where('canOverridePermissions', true)
            ->where('userPermissions', [])
            ->has('modules'));

        expect($user->hasPermission('quiz-test-delete'))->toBeFalse();

        $this->actingAs($this->superadmin)->put("/admin/users/{$user->id}", [
            'name' => $user->name,
            'email' => $user->email,
            'roles' => [$this->guruRole->id],
            'permissions' => [$this->extra->id],
        ])->assertSessionHasNoErrors();

        $user->refresh();
        expect($user->hasPermission('quiz-test-delete'))->toBeTrue()
            ->and($user->hasPermission('quiz-test-view'))->toBeTrue()
            ->and($user->permissionSlugs())->toContain('quiz-test-view', 'quiz-test-delete');

        $this->actingAs($this->superadmin)->put("/admin/users/{$user->id}", [
            'name' => $user->name,
            'email' => $user->email,
            'roles' => [$this->guruRole->id],
            'permissions' => [],
        ]);
        expect($user->fresh()->hasPermission('quiz-test-delete'))->toBeFalse();
    });

    it('ignores permission overrides sent by a plain admin', function (): void {
        $admin = User::factory()->create();
        $admin->roles()->attach($this->adminRole);
        $user = User::factory()->create();

        $this->actingAs($admin)->get("/admin/users/{$user->id}/edit")->assertInertia(fn (Assert $page) => $page
            ->where('canOverridePermissions', false));

        $this->actingAs($admin)->put("/admin/users/{$user->id}", [
            'name' => $user->name,
            'email' => $user->email,
            'roles' => [],
            'permissions' => [$this->extra->id],
        ])->assertSessionHasNoErrors();

        expect($user->fresh()->directPermissions()->count())->toBe(0);
    });
});

describe('profile page', function (): void {
    it('shows the player own data', function (): void {
        $user = User::factory()->create(['name' => 'Rani Putri', 'email' => 'rani@example.com']);
        PlayerProfile::factory()->for($user)->create(['nickname' => 'Rani', 'grade' => 5, 'school_name' => 'SDN 1 Bogor', 'birth_date' => now()->subYears(11)->toDateString()]);
        $user->pointLedgers()->create(['points' => 80, 'reason' => 'sky-quiz:sky', 'event_id' => 'p-1']);

        $this->actingAs($user)->get('/profile')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('user/profile')
            ->where('account.name', 'Rani Putri')
            ->where('account.email', 'rani@example.com')
            ->where('player.nickname', 'Rani')
            ->where('player.school_name', 'SDN 1 Bogor')
            ->where('player.age', 11)
            ->where('stats.points', 80)
            ->where('needsCurrentPassword', true)
            ->missing('account.password'));
    });

    it('requires sign in', function (): void {
        $this->get('/profile')->assertRedirect('/login');
    });

    it('updates the name', function (): void {
        $user = User::factory()->create(['name' => 'Lama']);

        $this->actingAs($user)->patch('/profile', ['name' => '  Nama   Baru  '])->assertSessionHasNoErrors();
        expect($user->fresh()->name)->toBe('Nama Baru');

        $this->actingAs($user)->patch('/profile', ['name' => ''])->assertSessionHasErrors('name');
        $this->actingAs($user)->patch('/profile', ['name' => 'x', 'email' => 'other@example.com'])->assertSessionHasErrors('name');
        expect($user->fresh()->email)->not->toBe('other@example.com');
    });

    it('changes the password with the current one', function (): void {
        $user = User::factory()->create(['password' => Hash::make('Lama12345'), 'password_updated_at' => now()->subMonth()]);

        $this->actingAs($user)->put('/profile/password', [
            'current_password' => 'salah123',
            'password' => 'Baru12345',
            'password_confirmation' => 'Baru12345',
        ])->assertSessionHasErrors('current_password');

        $this->actingAs($user)->put('/profile/password', [
            'current_password' => 'Lama12345',
            'password' => 'Baru12345',
            'password_confirmation' => 'Beda12345',
        ])->assertSessionHasErrors('password');

        $this->actingAs($user)->put('/profile/password', [
            'current_password' => 'Lama12345',
            'password' => 'Baru12345',
            'password_confirmation' => 'Baru12345',
        ])->assertSessionHasNoErrors();

        expect(Hash::check('Baru12345', $user->fresh()->password))->toBeTrue()
            ->and($user->fresh()->password_updated_at->isToday())->toBeTrue();
    });

    it('lets a Google account set its first password without the current one', function (): void {
        $user = User::factory()->create(['password_updated_at' => null]);
        $user->connectedAccounts()->create(['provider' => 'google', 'provider_id' => 'g-1', 'email' => $user->email]);

        $this->actingAs($user)->get('/profile')->assertInertia(fn (Assert $page) => $page
            ->where('needsCurrentPassword', false)
            ->where('account.connected.0.provider', 'google'));

        $this->actingAs($user)->put('/profile/password', [
            'password' => 'Pertama123',
            'password_confirmation' => 'Pertama123',
        ])->assertSessionHasNoErrors();

        expect(Hash::check('Pertama123', $user->fresh()->password))->toBeTrue();

        $this->actingAs($user->fresh())->put('/profile/password', [
            'password' => 'Kedua12345',
            'password_confirmation' => 'Kedua12345',
        ])->assertSessionHasErrors('current_password');
    });
});

describe('question bank', function (): void {
    it('marks played questions with their correct and wrong counts and filters them', function (): void {
        $played = Question::factory()->create(['subject' => 'math', 'times_answered' => 10, 'times_correct' => 7]);
        $fresh = Question::factory()->create(['subject' => 'math', 'times_answered' => 0, 'times_correct' => 0]);

        $this->actingAs($this->superadmin)->get('/admin/questions?subject=math&status=played')->assertInertia(fn (Assert $page) => $page
            ->has('questions.data', 1)
            ->where('questions.data.0.id', $played->id)
            ->where('questions.data.0.times_answered', 10)
            ->where('questions.data.0.times_correct', 7));

        $this->actingAs($this->superadmin)->get('/admin/questions?subject=math&status=unplayed')->assertInertia(fn (Assert $page) => $page
            ->where('questions.data', fn ($rows) => collect($rows)->pluck('id')->contains($fresh->id) && ! collect($rows)->pluck('id')->contains($played->id)));
    });
});
