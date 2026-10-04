<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per game page opened: which device class, operating system and
     * browser the player used. Guests are stored without a user.
     */
    public function up(): void
    {
        Schema::create('game_accesses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('game_key', 60);
            $table->string('device_type', 20);
            $table->string('os', 30);
            $table->string('browser', 30);
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('accessed_at');
            $table->timestamps();
            $table->index('accessed_at');
            $table->index(['user_id', 'accessed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_accesses');
    }
};
