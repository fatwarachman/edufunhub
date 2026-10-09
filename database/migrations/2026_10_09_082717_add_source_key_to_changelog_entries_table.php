<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Changelog entries recorded in database/data/changelog.php carry a stable
 * source key (`<version>:<key>`) so `changelog:sync` can upsert them, and
 * every entry gets optional English copy next to the Indonesian title/body.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('changelog_entries', function (Blueprint $table): void {
            $table->string('source_key', 120)->nullable()->unique()->after('id');
            $table->string('title_en')->nullable()->after('title');
            $table->text('body_en')->nullable()->after('body');
        });
    }

    public function down(): void
    {
        Schema::table('changelog_entries', function (Blueprint $table): void {
            $table->dropUnique(['source_key']);
            $table->dropColumn(['source_key', 'title_en', 'body_en']);
        });
    }
};
