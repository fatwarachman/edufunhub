<?php

use App\Http\Middleware\EnsureSuperadmin;
use App\Http\Middleware\EnsureTeacher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

it('keeps feature search translations and destinations in sync', function (): void {
    $id = json_decode(file_get_contents(resource_path('js/locales/id-feature-search.json')), true, flags: JSON_THROW_ON_ERROR);
    $en = json_decode(file_get_contents(resource_path('js/locales/en-feature-search.json')), true, flags: JSON_THROW_ON_ERROR);

    expect(array_keys($id))->toBe(array_keys($en));
    expect(array_keys($id['features']))->toBe(array_keys($en['features']));

    foreach ($id['features'] as $key => $feature) {
        expect($feature['title'])->not->toBeEmpty();
        expect($en['features'][$key]['title'])->not->toBeEmpty();
        expect($feature['href'])->toBe($en['features'][$key]['href']);
        $route = Route::getRoutes()->match(Request::create($feature['href']));
        expect($route->methods())->toContain('GET');
        if ($feature['superadminOnly']) {
            expect($route->gatherMiddleware())->toContain(EnsureSuperadmin::class);
        }
        if ($feature['teacherOnly']) {
            expect($route->gatherMiddleware())->toContain(EnsureTeacher::class);
        }
    }
});

it('shares the navigation catalog between sidebar and feature search', function (): void {
    foreach (['layouts/admin-layout.tsx', 'components/search/admin-feature-search.tsx'] as $file) {
        expect(file_get_contents(resource_path('js/'.$file)))->toContain("from '@/lib/admin-navigation'");
    }
});
