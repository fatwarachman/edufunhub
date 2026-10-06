<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('screen_time_daily', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('area', 40);
            $table->unsignedInteger('seconds')->default(0);
            $table->unique(['user_id', 'date', 'area']);
            $table->index('date');
        });

        Schema::create('screen_time_sessions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('area', 40);
            $table->dateTime('started_at');
            $table->dateTime('ended_at');
            $table->unsignedInteger('seconds')->default(0);
            $table->index(['user_id', 'started_at']);
            $table->index('started_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('screen_time_sessions');
        Schema::dropIfExists('screen_time_daily');
    }
};
