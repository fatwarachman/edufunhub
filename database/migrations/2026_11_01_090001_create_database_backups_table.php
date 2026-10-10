<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * History of full database backups (manual and scheduled), stored on the
     * local disk and/or uploaded to a remote FTP server.
     */
    public function up(): void
    {
        Schema::create('database_backups', function (Blueprint $table): void {
            $table->id();
            $table->string('filename', 100);
            $table->string('disk_path', 191);
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('checksum', 64)->nullable();
            $table->string('destination', 10)->default('local');
            $table->string('status', 10)->default('running');
            $table->boolean('local_kept')->default(false);
            $table->boolean('remote_uploaded')->default(false);
            $table->string('remote_path', 255)->nullable();
            $table->text('error')->nullable();
            $table->string('trigger', 10)->default('manual');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['trigger', 'started_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('database_backups');
    }
};
