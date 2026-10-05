<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-placement serving rules (enabled, static or rotating) and audience
     * fields on raw ad events for campaign analytics.
     */
    public function up(): void
    {
        Schema::create('ad_placement_settings', function (Blueprint $table) {
            $table->id();
            $table->string('placement', 30)->unique();
            $table->boolean('is_enabled')->default(true);
            $table->string('mode', 10)->default('static');
            $table->unsignedSmallInteger('rotate_seconds')->default(10);
            $table->unsignedTinyInteger('max_creatives')->default(4);
            $table->timestamps();
        });

        Schema::table('ad_events', function (Blueprint $table) {
            $table->string('device', 10)->nullable()->after('game_key');
            $table->unsignedTinyInteger('grade')->nullable()->after('device');
            $table->index(['ad_campaign_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::table('ad_events', function (Blueprint $table) {
            $table->dropIndex(['ad_campaign_id', 'user_id']);
            $table->dropColumn(['device', 'grade']);
        });
        Schema::dropIfExists('ad_placement_settings');
    }
};
