<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('broadcast_messages', function (Blueprint $table) {
            $table->unsignedInteger('recipients')->default(0)->after('target_segment');
        });

        Schema::table('notifications', function (Blueprint $table) {
            $table->index(['notifiable_type', 'notifiable_id', 'type', 'read_at'], 'notifications_feed_index');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex('notifications_feed_index');
        });

        Schema::table('broadcast_messages', function (Blueprint $table) {
            $table->dropColumn('recipients');
        });
    }
};
