<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_badges', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('badge', 40);
            $table->timestamp('earned_at');
            $table->timestamps();

            $table->unique(['user_id', 'badge']);
            $table->index('badge');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_badges');
    }
};
