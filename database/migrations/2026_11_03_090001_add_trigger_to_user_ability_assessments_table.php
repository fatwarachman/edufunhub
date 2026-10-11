<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_ability_assessments', function (Blueprint $table): void {
            $table->string('trigger', 16)->default('manual')->after('requested_by');
            $table->date('trigger_day')->nullable()->after('trigger');
            $table->unsignedSmallInteger('trigger_index')->nullable()->after('trigger_day');
            $table->unsignedInteger('trigger_answered')->nullable()->after('trigger_index');

            $table->unique(['user_id', 'trigger_day', 'trigger_index'], 'ability_assessments_auto_milestone_unique');
        });
    }

    public function down(): void
    {
        Schema::table('user_ability_assessments', function (Blueprint $table): void {
            $table->dropUnique('ability_assessments_auto_milestone_unique');
            $table->dropColumn(['trigger', 'trigger_day', 'trigger_index', 'trigger_answered']);
        });
    }
};
