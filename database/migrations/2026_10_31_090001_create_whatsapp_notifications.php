<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * WhatsApp number + opt-in on the account, and a delivery log of every
     * WhatsApp message sent through the GOWA container.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('whatsapp_number', 20)->nullable()->after('locale');
            $table->boolean('whatsapp_notifications')->default(true)->after('whatsapp_number');
            $table->timestamp('whatsapp_welcomed_at')->nullable()->after('whatsapp_notifications');
        });

        Schema::create('whatsapp_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event', 50);
            $table->string('phone', 20);
            $table->text('body');
            $table->string('status', 12)->default('queued');
            $table->string('provider_message_id', 100)->nullable();
            $table->string('error', 500)->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_messages');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['whatsapp_number', 'whatsapp_notifications', 'whatsapp_welcomed_at']);
        });
    }
};
