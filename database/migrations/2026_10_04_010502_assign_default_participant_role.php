<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Rename the legacy "siswa" role to "peserta" and give every existing
     * non-admin user without a role the participant role.
     */
    public function up(): void
    {
        $now = now();

        if (! DB::table('roles')->where('slug', 'peserta')->exists()) {
            if (DB::table('roles')->where('slug', 'siswa')->exists()) {
                DB::table('roles')->where('slug', 'siswa')->update([
                    'name' => 'Peserta',
                    'slug' => 'peserta',
                    'description' => 'Memainkan game edukasi',
                    'updated_at' => $now,
                ]);
            } else {
                DB::table('roles')->insert([
                    'name' => 'Peserta',
                    'slug' => 'peserta',
                    'description' => 'Memainkan game edukasi',
                    'is_system' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        $participantRoleId = DB::table('roles')->where('slug', 'peserta')->value('id');

        DB::table('users')
            ->where('is_superadmin', false)
            ->whereNotExists(fn ($query) => $query->select(DB::raw(1))
                ->from('role_user')
                ->whereColumn('role_user.user_id', 'users.id'))
            ->orderBy('id')
            ->pluck('id')
            ->chunk(500)
            ->each(fn ($userIds) => DB::table('role_user')->insert(
                $userIds->map(fn (int $userId): array => [
                    'role_id' => $participantRoleId,
                    'user_id' => $userId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->values()->all()
            ));
    }

    /**
     * Restore the legacy role name; participant assignments are kept.
     */
    public function down(): void
    {
        if (! DB::table('roles')->where('slug', 'siswa')->exists()) {
            DB::table('roles')->where('slug', 'peserta')->update([
                'name' => 'Siswa',
                'slug' => 'siswa',
                'description' => 'Mengikuti quiz dan duel',
                'updated_at' => now(),
            ]);
        }
    }
};
