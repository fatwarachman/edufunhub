<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * First-login profile wizard. Accounts that already exist are treated as
     * done so only newly registered users see the wizard.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('profile_completed_at')->nullable()->after('onboarded_at');
        });

        DB::table('users')->whereNull('profile_completed_at')->update(['profile_completed_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('profile_completed_at');
        });
    }
};
