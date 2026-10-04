<?php

use App\Models\User;

beforeEach(function (): void {
    $this->withoutVite();
});

test('legal pages are publicly accessible to guests', function (string $path, string $component): void {
    $this->get($path)
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component($component));
})->with([
    'privacy' => ['/privacy', 'legal/privacy'],
    'terms' => ['/terms', 'legal/terms'],
]);

test('legal pages are accessible to signed in users', function (string $path): void {
    $this->actingAs(User::factory()->create())->get($path)->assertOk();
})->with(['/privacy', '/terms']);

test('landing page links to legal pages', function (): void {
    $html = file_get_contents(public_path('new-landing/index.html'));

    expect($html)->toContain('href="/privacy"')->toContain('href="/terms"');
});
