<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;

test('participant role assignment reuses the existing role and is idempotent', function (): void {
    $role = Role::query()->where('slug', Role::PARTICIPANT)->sole();
    $user = User::factory()->create();

    $user->assignParticipantRole();
    $user->assignParticipantRole();

    expect(Role::query()->where('slug', Role::PARTICIPANT)->count())->toBe(1)
        ->and($user->roles()->pluck('roles.id')->all())->toBe([$role->id]);
});

test('participant migration renames siswa and backfills roleless non admin users', function (): void {
    $migration = require database_path('migrations/2026_10_04_010502_assign_default_participant_role.php');
    Role::query()->where('slug', Role::PARTICIPANT)->delete();
    $siswa = Role::factory()->create(['slug' => 'siswa', 'name' => 'Siswa']);
    $admin = Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']);
    $roleless = User::factory()->create();
    $superadmin = User::factory()->create(['is_superadmin' => true]);
    $existingAdmin = User::factory()->create();
    $existingAdmin->roles()->attach($admin);

    $migration->up();
    $migration->up();

    expect($siswa->fresh()->slug)->toBe(Role::PARTICIPANT)
        ->and($roleless->roles()->pluck('slug')->all())->toBe([Role::PARTICIPANT])
        ->and($superadmin->roles()->count())->toBe(0)
        ->and($existingAdmin->roles()->pluck('slug')->all())->toBe(['admin'])
        ->and(DB::table('role_user')->where('user_id', $roleless->id)->count())->toBe(1);
});
