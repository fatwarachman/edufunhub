<?php

use App\Models\User;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Session;
use Inertia\Testing\AssertableInertia as Assert;

it('allows guests to update their locale preference in the session', function () {
    // Assert initial state mapping
    expect(Session::get('locale'))->toBeNull();
    expect(App::getLocale())->toBe('id');

    $response = $this->patch('/locale', [
        'locale' => 'fr',
    ]);

    $response->assertRedirect();

    // Assert session was updated
    expect(Session::get('locale'))->toBe('fr');
});

it('allows authenticated users to update their locale in session and database', function () {
    $user = User::factory()->create([
        'locale' => 'en',
    ]);

    $this->actingAs($user);

    $response = $this->patch('/locale', [
        'locale' => 'es',
    ]);

    $response->assertRedirect();

    // Assert session updated
    expect(Session::get('locale'))->toBe('es');

    // Assert database updated
    $user->refresh();
    expect($user->locale)->toBe('es');
});

it('rejects invalid locales', function () {
    $response = $this->patch('/locale', [
        'locale' => 'invalid-locale',
    ]);

    $response->assertSessionHasErrors(['locale']);

    // Assert session was NOT updated
    expect(Session::get('locale'))->toBeNull();
});

it('redirects back to the previous page', function () {
    $response = $this->from('/some-previous-page')->patch('/locale', [
        'locale' => 'ar',
    ]);

    $response->assertRedirect('/some-previous-page');
    expect(Session::get('locale'))->toBe('ar');
});

it('defaults new accounts to Indonesian and keeps a saved choice', function () {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $user = User::factory()->create();
    expect($user->refresh()->locale)->toBe('id');

    $this->actingAs($user)->get('/dashboard')
        ->assertInertia(fn (Assert $page) => $page->where('locale', 'id'));

    $this->patch('/locale', ['locale' => 'en'])->assertRedirect();

    $this->get('/character')
        ->assertInertia(fn (Assert $page) => $page->where('locale', 'en'));
    expect($user->refresh()->locale)->toBe('en');
});

it('requires a locale value', function () {
    $this->actingAs(User::factory()->create())
        ->patch('/locale', [])
        ->assertSessionHasErrors(['locale']);
});

it('ships matching language toggle copy in Indonesian and English', function () {
    $indonesian = json_decode(file_get_contents(resource_path('js/locales/id-player.json')), true)['language'];
    $english = json_decode(file_get_contents(resource_path('js/locales/en-player.json')), true)['language'];

    expect(array_keys($indonesian))->toBe(array_keys($english))
        ->and(array_filter($indonesian))->toHaveCount(count($indonesian))
        ->and(array_filter($english))->toHaveCount(count($english));
});

it('translates every admin panel string to Indonesian', function () {
    $catalog = json_decode(file_get_contents(resource_path('js/locales/id-admin.json')), true);
    $files = collect([
        ...glob(resource_path('js/pages/admin/{,*/}*.tsx'), GLOB_BRACE),
        ...glob(resource_path('js/components/admin/{,*/}*.tsx'), GLOB_BRACE),
        resource_path('js/layouts/admin-layout.tsx'),
    ]);

    $missing = $files->flatMap(function (string $file): array {
        preg_match_all('/\btr\(\s*(?:"((?:[^"\\\\]|\\\\.)*)"|\'((?:[^\'\\\\]|\\\\.)*)\')/', file_get_contents($file), $matches);

        return array_map(
            fn (string $double, string $single): string => stripcslashes($double !== '' ? $double : $single),
            $matches[1],
            $matches[2],
        );
    })->unique()->reject(fn (string $text): bool => isset($catalog[$text]));

    expect($files)->not->toBeEmpty()
        ->and($missing->values()->all())->toBe([])
        ->and(array_filter($catalog))->toHaveCount(count($catalog));
});
