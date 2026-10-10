<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One WhatsApp number per account. Existing duplicates keep the number on
     * the oldest account; the others lose it and must enter a new number in
     * the first-login wizard.
     */
    public function up(): void
    {
        $duplicates = DB::table('users')
            ->select('whatsapp_number', DB::raw('MIN(id) as keep_id'))
            ->whereNotNull('whatsapp_number')
            ->groupBy('whatsapp_number')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicates as $duplicate) {
            DB::table('users')
                ->where('whatsapp_number', $duplicate->whatsapp_number)
                ->where('id', '!=', $duplicate->keep_id)
                ->update(['whatsapp_number' => null, 'whatsapp_welcomed_at' => null, 'profile_completed_at' => null]);
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->unique('whatsapp_number');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['whatsapp_number']);
        });
    }
};
