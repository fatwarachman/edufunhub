<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Direct (override) permissions per user, on top of their roles, and a
     * one-time sync between the "super-admin" role and the is_superadmin flag
     * (the role given from the user editor never set the flag before).
     */
    public function up(): void
    {
        Schema::create('permission_user', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['permission_id', 'user_id']);
        });

        $role = DB::table('roles')->where('slug', 'super-admin')->value('id');
        if ($role === null) {
            return;
        }

        $withRole = DB::table('role_user')->where('role_id', $role)->pluck('user_id');
        DB::table('users')->whereIn('id', $withRole)->update(['is_superadmin' => true]);

        $flagged = DB::table('users')->where('is_superadmin', true)->whereNotIn('id', $withRole)->pluck('id');
        foreach ($flagged as $userId) {
            DB::table('role_user')->insert(['role_id' => $role, 'user_id' => $userId, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('permission_user');
    }
};
