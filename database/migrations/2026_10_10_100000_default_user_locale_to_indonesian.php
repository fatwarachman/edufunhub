<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Indonesian is the default UI language. The starter kit defaulted
 * users.locale to "en", so every account opened in English after login.
 * Accounts still on that untouched default move to Indonesian; players can
 * switch to English again from their profile settings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('locale', 10)->default('id')->change();
        });

        DB::table('users')->where('locale', 'en')->update(['locale' => 'id']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('locale', 10)->default('en')->change();
        });
    }
};
