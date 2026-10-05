<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Advertising: advertisers buy campaigns; a campaign has creatives (logo,
     * motto, jingle, sponsored item) that the ad server places into game
     * slots. Impressions, clicks and jingle plays are logged per event and
     * rolled up per day for reports and contract caps.
     */
    public function up(): void
    {
        Schema::create('advertisers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('brand', 120)->nullable();
            $table->string('industry', 60)->nullable();
            $table->string('contact_name', 120)->nullable();
            $table->string('email', 160)->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('website', 255)->nullable();
            $table->string('tax_id', 40)->nullable();
            $table->text('address')->nullable();
            $table->text('notes')->nullable();
            $table->string('logo_path')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('ad_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('advertiser_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('status', 12)->default('draft')->index();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('pricing_model', 12)->default('flat');
            $table->unsignedBigInteger('contract_value')->default(0);
            $table->string('contract_number', 60)->nullable();
            $table->unsignedInteger('max_impressions')->nullable();
            $table->unsignedInteger('daily_max_impressions')->nullable();
            $table->unsignedTinyInteger('weight')->default(5);
            $table->json('target_games')->nullable();
            $table->unsignedTinyInteger('grade_min')->nullable();
            $table->unsignedTinyInteger('grade_max')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'starts_on', 'ends_on']);
        });

        Schema::create('ad_creatives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ad_campaign_id')->constrained()->cascadeOnDelete();
            $table->string('type', 10);
            $table->string('name', 120);
            $table->string('size', 20)->nullable();
            $table->json('placements');
            $table->string('image_path')->nullable();
            $table->string('audio_path')->nullable();
            $table->string('motto', 140)->nullable();
            $table->string('click_url', 255)->nullable();
            $table->string('background_color', 7)->nullable();
            $table->string('text_color', 7)->nullable();
            $table->unsignedSmallInteger('display_seconds')->default(8);
            $table->unsignedTinyInteger('audio_seconds')->nullable();
            $table->foreignId('character_item_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('ad_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ad_creative_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ad_campaign_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 12);
            $table->string('placement', 30);
            $table->string('game_key', 40)->nullable();
            $table->string('serve_id', 40);
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['serve_id', 'type']);
            $table->index(['ad_campaign_id', 'type', 'created_at']);
            $table->index(['ad_creative_id', 'type']);
        });

        Schema::create('ad_daily_stats', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->foreignId('ad_creative_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ad_campaign_id')->constrained()->cascadeOnDelete();
            $table->string('placement', 30);
            $table->string('game_key', 40)->default('');
            $table->unsignedInteger('impressions')->default(0);
            $table->unsignedInteger('clicks')->default(0);
            $table->unsignedInteger('plays')->default(0);

            $table->unique(['day', 'ad_creative_id', 'placement', 'game_key'], 'ad_daily_unique');
            $table->index(['ad_campaign_id', 'day']);
        });

        Schema::table('character_items', function (Blueprint $table) {
            $table->foreignId('advertiser_id')->nullable()->after('is_active')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('character_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('advertiser_id');
        });
        Schema::dropIfExists('ad_daily_stats');
        Schema::dropIfExists('ad_events');
        Schema::dropIfExists('ad_creatives');
        Schema::dropIfExists('ad_campaigns');
        Schema::dropIfExists('advertisers');
    }
};
