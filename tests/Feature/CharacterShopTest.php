<?php

use App\Models\CharacterItem;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Services\PlayerPortal;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
});

function shopPlayer(int $points = 0): User
{
    $user = User::factory()->withPlayerDetails()->create();
    if ($points > 0) {
        $user->pointLedgers()->create(['points' => $points, 'reason' => 'seed', 'event_id' => 'seed-'.$user->id]);
    }

    return $user;
}

it('seeds a shop with free starter items and priced gear for every slot', function (): void {
    $slots = CharacterItem::query()->distinct()->pluck('slot')->all();

    expect($slots)->toEqualCanonicalizing(CharacterItem::SLOTS)
        ->and(CharacterItem::query()->where('key', 'cap')->value('price'))->toBe(0)
        ->and(CharacterItem::query()->where('key', 'knight-sword')->value('price'))->toBeGreaterThan(0);
});

it('shows the builder with balance, owned items and the catalog', function (): void {
    $user = shopPlayer(200);

    $this->actingAs($user)->get('/character')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('user/character')
        ->where('balance', 200)
        ->where('owned', [])
        ->where('character.gender', 'boy')
        ->has('items', CharacterItem::query()->active()->count())
        ->where('options.slots', CharacterItem::SLOTS)
        ->where('options.genders', ['boy', 'girl']));
});

it('buys an item with points without lowering level points', function (): void {
    $user = shopPlayer(200);
    $sword = CharacterItem::query()->where('key', 'knight-sword')->firstOrFail();

    $this->actingAs($user)->post("/character/items/{$sword->id}/buy")->assertRedirect('/character');

    $portal = app(PlayerPortal::class);
    expect($user->characterItems()->pluck('character_items.id')->all())->toBe([$sword->id])
        ->and($portal->balance($user))->toBe(200 - $sword->price)
        ->and($portal->totalPoints($user))->toBe(200)
        ->and($user->pointLedgers()->where('points', -$sword->price)->exists())->toBeTrue();

    $this->get('/character')->assertInertia(fn (Assert $page) => $page
        ->where('balance', 200 - $sword->price)
        ->where('owned', [$sword->id]));
});

it('refuses purchases the player cannot afford, already owns, or that are hidden', function (): void {
    $user = shopPlayer(150);
    $crown = CharacterItem::query()->where('key', 'royal-crown')->firstOrFail();
    $wand = CharacterItem::query()->where('key', 'fairy-wand')->firstOrFail();

    $this->actingAs($user)->post("/character/items/{$crown->id}/buy")->assertSessionHasErrors(['item' => __('shop.not_enough_points')]);

    $this->post("/character/items/{$wand->id}/buy")->assertSessionHasNoErrors();
    $this->post("/character/items/{$wand->id}/buy")->assertSessionHasErrors(['item' => __('shop.already_owned')]);

    $hidden = CharacterItem::factory()->create(['price' => 1, 'is_active' => false]);
    $this->post("/character/items/{$hidden->id}/buy")->assertSessionHasErrors(['item' => __('shop.unavailable')]);

    expect(app(PlayerPortal::class)->balance($user))->toBe(150 - $wand->price)
        ->and($user->characterItems()->count())->toBe(1);
});

it('never takes the price from the request', function (): void {
    $user = shopPlayer(500);
    $item = CharacterItem::query()->where('key', 'battle-axe')->firstOrFail();

    $this->actingAs($user)->post("/character/items/{$item->id}/buy", ['price' => 0])->assertSessionHasErrors('price');

    expect($user->characterItems()->count())->toBe(0);
});

it('does not let free items be bought', function (): void {
    $user = shopPlayer(50);
    $cap = CharacterItem::query()->where('key', 'cap')->firstOrFail();

    $this->actingAs($user)->post("/character/items/{$cap->id}/buy")->assertSessionHasErrors(['item' => __('shop.already_owned')]);
});

it('saves gender, skin, hair and equips owned or free items per slot', function (): void {
    $user = shopPlayer(300);
    $hat = CharacterItem::query()->where('key', 'wizard-hat')->firstOrFail();
    $staff = CharacterItem::query()->where('key', 'magic-staff')->firstOrFail();
    $glasses = CharacterItem::query()->where('key', 'glasses')->firstOrFail();
    $this->actingAs($user)->post("/character/items/{$hat->id}/buy");

    $this->patch('/character', [
        'color' => 'violet', 'nickname' => 'Sari', 'gender' => 'girl', 'skin' => 'tan', 'hair_color' => 'pink',
        'equipped' => ['hat' => $hat->id, 'face' => $glasses->id, 'weapon' => null],
    ])->assertSessionHasNoErrors()->assertRedirect('/character');

    $profile = $user->playerProfile()->first();
    expect($profile->gender)->toBe('girl')
        ->and($profile->hair_color)->toBe('pink')
        ->and($profile->equipped)->toBe(['hat' => $hat->id, 'face' => $glasses->id])
        ->and($profile->accessory)->toBe('glasses');

    $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page
        ->where('character.gender', 'girl')
        ->where('character.items.hat', ['style' => 'wizard', 'color' => $hat->color])
        ->where('character.items.face.style', 'glasses'));

    $this->patch('/character', ['color' => 'violet', 'equipped' => ['weapon' => $staff->id]])
        ->assertSessionHasErrors(['equipped.weapon' => __('shop.not_owned')]);
});

it('rejects items in the wrong slot and invalid look values', function (string $field, mixed $value): void {
    $user = shopPlayer();
    $sword = CharacterItem::query()->where('key', 'wooden-sword')->firstOrFail();
    $payload = ['color' => 'amber', 'equipped' => ['hat' => null]];
    $payload = $field === 'wrong-slot'
        ? ['color' => 'amber', 'equipped' => ['hat' => $sword->id]]
        : array_replace($payload, [$field => $value]);

    $this->actingAs($user)->patch('/character', $payload)->assertSessionHasErrors();
    expect($user->playerProfile()->first()->equipped)->toBeNull();
})->with([
    'item in the wrong slot' => ['wrong-slot', null],
    'unknown gender' => ['gender', 'robot'],
    'unknown skin' => ['skin', 'green'],
    'unknown hair' => ['hair_color', 'rainbow'],
    'unknown slot' => ['equipped', ['tail' => 1]],
]);

it('keeps the old cap and glasses picker working', function (): void {
    $user = shopPlayer();

    $this->actingAs($user)->patch('/character', ['color' => 'teal', 'accessory' => 'cap'])->assertSessionHasNoErrors();

    $cap = CharacterItem::query()->where('key', 'cap')->value('id');
    expect($user->playerProfile()->first()->equipped)->toBe(['hat' => $cap]);
});

it('requires sign in to buy', function (): void {
    $item = CharacterItem::query()->firstOrFail();

    $this->post("/character/items/{$item->id}/buy")->assertRedirect('/login');
});

it('shows equipped items on the leaderboard', function (): void {
    $user = shopPlayer(500);
    $crown = CharacterItem::query()->where('key', 'royal-crown')->firstOrFail();
    $this->actingAs($user)->post("/character/items/{$crown->id}/buy");
    $this->patch('/character', ['color' => 'amber', 'equipped' => ['hat' => $crown->id]]);
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => 4]);

    $this->get('/portal')->assertInertia(fn (Assert $page) => $page
        ->where('leaderboard.0.points', 500)
        ->where('leaderboard.0.character.items.hat.style', 'crown'));
});

describe('admin', function (): void {
    beforeEach(function (): void {
        $this->admin = User::factory()->create(['is_superadmin' => true]);
    });

    it('lists items with owners, wearers and points spent', function (): void {
        $buyer = shopPlayer(500);
        $axe = CharacterItem::query()->where('key', 'battle-axe')->firstOrFail();
        $this->actingAs($buyer)->post("/character/items/{$axe->id}/buy");
        $this->patch('/character', ['color' => 'amber', 'equipped' => ['weapon' => $axe->id]]);

        $this->actingAs($this->admin)->get('/admin/character-items')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('admin/character-items/index')
            ->where('summary.purchases', 1)
            ->where('summary.buyers', 1)
            ->where('summary.points_spent', $axe->price)
            ->has('items', CharacterItem::query()->count())
            ->where('items', fn ($items) => collect($items)->firstWhere('key', 'battle-axe')['owners'] === 1
                && collect($items)->firstWhere('key', 'battle-axe')['wearing'] === 1
                && collect($items)->firstWhere('key', 'cap')['owners'] === null));

        $this->get('/admin/character-items?slot=weapon')->assertInertia(fn (Assert $page) => $page
            ->where('items', fn ($items) => collect($items)->every(fn ($item) => $item['slot'] === 'weapon')));
    });

    it('creates, reprices, hides and deletes items', function (): void {
        $this->actingAs($this->admin)->post('/admin/character-items', [
            'slot' => 'hat', 'style' => 'crown', 'color' => '#AA22CC', 'name_id' => 'Mahkota Ungu', 'name_en' => 'Purple Crown', 'price' => 350, 'is_active' => true,
        ])->assertRedirect('/admin/character-items');

        $item = CharacterItem::query()->where('name_id', 'Mahkota Ungu')->firstOrFail();
        expect($item->color)->toBe('#aa22cc')->and($item->price)->toBe(350);

        $this->put("/admin/character-items/{$item->id}", [...$item->only(['slot', 'style', 'color', 'name_id', 'name_en']), 'price' => 0, 'is_active' => true])->assertSessionHasNoErrors();
        expect($item->fresh()->price)->toBe(0);

        $this->patch("/admin/character-items/{$item->id}/toggle")->assertSessionHasNoErrors();
        expect($item->fresh()->is_active)->toBeFalse();

        $this->delete("/admin/character-items/{$item->id}")->assertRedirect('/admin/character-items');
        expect(CharacterItem::query()->find($item->id))->toBeNull();
    });

    it('validates item fields', function (array $override, string $field): void {
        $this->actingAs($this->admin)->post('/admin/character-items', array_replace([
            'slot' => 'weapon', 'style' => 'sword', 'name_id' => 'Pedang', 'price' => 10,
        ], $override))->assertSessionHasErrors($field);
    })->with([
        'style of another slot' => [['style' => 'crown'], 'style'],
        'negative price' => [['price' => -5], 'price'],
        'price too high' => [['price' => CharacterItem::MAX_PRICE + 1], 'price'],
        'bad colour' => [['color' => 'red'], 'color'],
        'unknown slot' => [['slot' => 'tail'], 'slot'],
        'missing name' => [['name_id' => ''], 'name_id'],
    ]);

    it('keeps owned items: deleting is refused, hiding is allowed', function (): void {
        $buyer = shopPlayer(500);
        $bow = CharacterItem::query()->where('key', 'hunter-bow')->firstOrFail();
        $this->actingAs($buyer)->post("/character/items/{$bow->id}/buy");

        $this->actingAs($this->admin)->delete("/admin/character-items/{$bow->id}")->assertSessionHas('error');
        expect($bow->fresh())->not->toBeNull();

        $this->patch("/admin/character-items/{$bow->id}/toggle");
        $buyer->playerProfile()->update(['equipped' => ['weapon' => $bow->id]]);
        expect($buyer->playerProfile()->first()->character()['items']['weapon']['style'])->toBe('bow');
    });

    it('shows a player\'s items on the user page', function (): void {
        $buyer = shopPlayer(500);
        $cape = CharacterItem::query()->where('key', 'hero-cape')->firstOrFail();
        $this->actingAs($buyer)->post("/character/items/{$cape->id}/buy");

        $this->actingAs($this->admin)->get("/admin/users/{$buyer->id}")->assertInertia(fn (Assert $page) => $page
            ->where('shop.items.0.name', 'Hero Cape')
            ->where('shop.items.0.price_paid', $cape->price)
            ->where('stats.points', 500)
            ->where('stats.spent_points', $cape->price)
            ->where('stats.balance', 500 - $cape->price));
    });

    it('is only for super admins', function (): void {
        $this->actingAs(shopPlayer())->get('/admin/character-items')->assertForbidden();
    });
});
