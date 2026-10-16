<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Exact page each signed-in user is viewing (admin online list). No index:
 * the online list filters on last_seen_at, and a 2048 char column is too
 * long for a MariaDB composite key. Idempotent so a half-applied run
 * (columns created, index failed) can finish.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'current_page_path')) {
                $table->string('current_page_path', 2048)->nullable()->after('last_seen_at');
            }
            if (! Schema::hasColumn('users', 'current_page_label')) {
                $table->string('current_page_label', 160)->nullable()->after('current_page_path');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['current_page_path', 'current_page_label']);
        });
    }
};
