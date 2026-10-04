<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Character shop: admin-managed items (hats, outfits, weapons, …) bought
     * with points, the items each player owns, and the look of the chibi
     * character (gender, skin, hair, equipped items per slot).
     */
    public function up(): void
    {
        Schema::create('character_items', function (Blueprint $table) {
            $table->id();
            $table->string('key', 60)->unique();
            $table->string('slot', 20)->index();
            $table->string('style', 30);
            $table->string('color', 7)->nullable();
            $table->string('name_id', 60);
            $table->string('name_en', 60)->nullable();
            $table->unsignedInteger('price')->default(0);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('character_item_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('character_item_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('price_paid');
            $table->timestamps();

            $table->unique(['user_id', 'character_item_id']);
        });

        Schema::table('player_profiles', function (Blueprint $table) {
            $table->string('gender', 5)->default('boy')->after('accessory');
            $table->string('skin', 10)->default('light')->after('gender');
            $table->string('hair_color', 10)->default('brown')->after('skin');
            $table->json('equipped')->nullable()->after('hair_color');
        });

        $now = now();
        $items = [
            ['cap', 'hat', 'cap', '#ffffff', 'Topi Pet', 'Cap', 0],
            ['flower-clip', 'hat', 'flower', '#ff7eb6', 'Jepit Bunga', 'Flower Clip', 60],
            ['ranger-hood', 'hat', 'hood', '#3f7d4e', 'Tudung Penjelajah', 'Ranger Hood', 90],
            ['wizard-hat', 'hat', 'wizard', '#27406e', 'Topi Penyihir', 'Wizard Hat', 120],
            ['knight-helmet', 'hat', 'helmet', '#8b95a5', 'Helm Ksatria', 'Knight Helmet', 150],
            ['gold-circlet', 'hat', 'circlet', '#f2c14e', 'Mahkota Kecil Emas', 'Gold Circlet', 180],
            ['viking-helmet', 'hat', 'horned', '#4a4f5c', 'Helm Bertanduk', 'Horned Helmet', 200],
            ['royal-crown', 'hat', 'crown', '#f2c14e', 'Mahkota Raja', 'Royal Crown', 300],
            ['tunic', 'outfit', 'tunic', null, 'Kaos Petualang', 'Adventurer Tunic', 0],
            ['leather-armor', 'outfit', 'leather', '#8a5a33', 'Baju Kulit', 'Leather Armor', 120],
            ['mage-robe', 'outfit', 'robe', '#5b3fa8', 'Jubah Penyihir', 'Mage Robe', 180],
            ['fairy-dress', 'outfit', 'dress', '#2bb5a3', 'Gaun Peri', 'Fairy Dress', 160],
            ['knight-armor', 'outfit', 'armor', '#3d6fd1', 'Zirah Ksatria', 'Knight Armor', 250],
            ['wooden-sword', 'weapon', 'sword', '#b07a43', 'Pedang Kayu', 'Wooden Sword', 50],
            ['fairy-wand', 'weapon', 'wand', '#ff7eb6', 'Tongkat Peri', 'Fairy Wand', 120],
            ['hunter-bow', 'weapon', 'bow', '#9a6233', 'Busur Pemburu', 'Hunter Bow', 130],
            ['magic-staff', 'weapon', 'staff', '#7a4f2a', 'Tongkat Sihir', 'Magic Staff', 140],
            ['knight-sword', 'weapon', 'sword', '#d7dde6', 'Pedang Ksatria', 'Knight Sword', 150],
            ['golden-spear', 'weapon', 'spear', '#f2c14e', 'Tombak Emas', 'Golden Spear', 160],
            ['spiked-mace', 'weapon', 'mace', '#8b95a5', 'Gada Berduri', 'Spiked Mace', 200],
            ['battle-axe', 'weapon', 'axe', '#c9ced6', 'Kapak Perang', 'Battle Axe', 220],
            ['round-shield', 'offhand', 'shield', '#c0392b', 'Perisai Bundar', 'Round Shield', 100],
            ['hero-cape', 'back', 'cape', '#d6453d', 'Jubah Pahlawan', 'Hero Cape', 90],
            ['fairy-wings', 'back', 'wings', '#9be7ff', 'Sayap Peri', 'Fairy Wings', 260],
            ['glasses', 'face', 'glasses', '#1d2238', 'Kacamata', 'Glasses', 0],
        ];

        foreach ($items as $index => [$key, $slot, $style, $color, $nameId, $nameEn, $price]) {
            DB::table('character_items')->insert([
                'key' => $key, 'slot' => $slot, 'style' => $style, 'color' => $color,
                'name_id' => $nameId, 'name_en' => $nameEn, 'price' => $price,
                'is_active' => true, 'sort_order' => $index, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        $ids = DB::table('character_items')->pluck('id', 'key');
        DB::table('player_profiles')->where('accessory', 'cap')->update(['equipped' => json_encode(['hat' => $ids['cap']])]);
        DB::table('player_profiles')->where('accessory', 'glasses')->update(['equipped' => json_encode(['face' => $ids['glasses']])]);
    }

    public function down(): void
    {
        Schema::table('player_profiles', function (Blueprint $table) {
            $table->dropColumn(['gender', 'skin', 'hair_color', 'equipped']);
        });
        Schema::dropIfExists('character_item_user');
        Schema::dropIfExists('character_items');
    }
};
