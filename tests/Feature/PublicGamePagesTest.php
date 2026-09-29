<?php

use Inertia\Testing\AssertableInertia as Assert;

it('serves public learning games without login', function (string $url, string $component) {
    $this->withoutVite();
    $this->get($url)->assertOk()->assertInertia(fn (Assert $page) => $page->component($component));
})->with([
    ['/', 'welcome'],
    ['/gamelist', 'games/index'],
    ['/games/snakes-and-ladders', 'games/snakes-and-ladders'],
    ['/games/sky-quiz', 'games/sky-quiz'],
]);
