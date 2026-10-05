<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-user ad opt-out, and the "Impersonate users" permission (granted
     * to the Super Admin role; other roles get it from the role editor).
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('ads_disabled')->default(false)->after('is_superadmin');
        });

        $module = DB::table('modules')->where('slug', 'user-management')->first();
        if ($module === null) {
            $moduleId = DB::table('modules')->insertGetId([
                'name' => 'User Management', 'slug' => 'user-management', 'icon' => 'users',
                'description' => 'Manage system users', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        } else {
            $moduleId = $module->id;
        }

        $permissionId = DB::table('permissions')->where('slug', 'user-impersonate')->value('id')
            ?? DB::table('permissions')->insertGetId([
                'name' => 'Impersonate User Management', 'slug' => 'user-impersonate', 'module_id' => $moduleId,
                'description' => 'Log in as another user (login as)', 'created_at' => now(), 'updated_at' => now(),
            ]);

        $superAdminRole = DB::table('roles')->where('slug', 'super-admin')->value('id');
        if ($superAdminRole && ! DB::table('role_permission')->where(['role_id' => $superAdminRole, 'permission_id' => $permissionId])->exists()) {
            DB::table('role_permission')->insert(['role_id' => $superAdminRole, 'permission_id' => $permissionId, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('slug', 'user-impersonate')->value('id');
        if ($permissionId) {
            DB::table('role_permission')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('ads_disabled');
        });
    }
};
