<?php

use App\Models\CharacterItem;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => $this->withoutVite());

it('removes a taken off item from the saved look and every preview', function (): void {
    $user = User::factory()->create();
    $user->playerProfile()->create(['grade' => 5, 'birth_date' => '2015-03-01', 'school_name' => 'SD QA']);
    $cap = CharacterItem::query()->where('key', 'cap')->first() ?? CharacterItem::factory()->create(['key' => 'cap', 'slot' => 'hat', 'price' => 0]);

    $this->actingAs($user)->patch('/character', ['color' => 'amber', 'gender' => 'boy', 'skin' => 'light', 'hair_color' => 'brown', 'equipped' => ['hat' => $cap->id]])
        ->assertSessionHasNoErrors();
    expect($user->playerProfile()->first()->equipped)->toBe(['hat' => $cap->id]);

    $this->patch('/character', ['color' => 'amber', 'gender' => 'boy', 'skin' => 'light', 'hair_color' => 'brown', 'equipped' => ['hat' => null]])
        ->assertSessionHasNoErrors();

    $this->get('/character')->assertInertia(fn (Assert $page) => $page
        ->where('character.items', [])
        ->where('equipped', []));
});

it('refreshes the character page after browser back and lets the worn item be tapped off', function (): void {
    $page = file_get_contents(resource_path('js/pages/user/character.tsx'));
    $hook = file_get_contents(resource_path('js/hooks/use-fresh-on-history.ts'));

    expect($page)->toContain("['character', 'equipped', 'owned', 'balance']")
        ->and($page)->toContain('useFreshOnHistory(')
        ->and($page)->toContain('? toggleWear(item)')
        ->and($hook)->toContain("window.addEventListener('popstate'")
        ->and($hook)->toContain('router.reload(');
});
