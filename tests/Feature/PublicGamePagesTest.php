<?php

use Inertia\Testing\AssertableInertia as Assert;

it('serves the static landing page at the root without login', function () {
    $this->get('/')->assertOk();

    expect(file_exists(public_path('new-landing/index.html')))->toBeTrue();
});

it('serves public learning games without login', function (string $url, string $component) {
    $this->withoutVite();
    $this->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page->component($component));
})->with([
    ['/gamelist', 'games/index'],
    ['/games/snakes-and-ladders', 'games/snakes-and-ladders'],
    ['/games/sky-quiz', 'games/sky-quiz'],
]);
