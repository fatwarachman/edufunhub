<?php

use Inertia\Testing\AssertableInertia as Assert;

it('serves the static landing page at the root without login', function () {
    $this->get('/')->assertOk();

    expect(file_exists(public_path('new-landing/index.html')))->toBeTrue();
});

it('serves the public game list without login', function () {
    $this->withoutVite();
    $this->get('/gamelist')->assertOk()->assertInertia(fn (Assert $page) => $page->component('games/index'));
});

it('sends guests from game pages to the login page', function (string $url) {
    $this->get($url)->assertRedirect(route('login'));
})->with(['/games/snakes-and-ladders', '/games/sky-quiz']);
