<?php

use App\Models\PlayerProfile;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create(['name' => 'Admin Root', 'email' => 'root@admin.test']);

    $this->rani = User::factory()->create(['name' => 'Rani Putri', 'email' => 'rani@sekolah.test', 'whatsapp_number' => '6281234567890']);
    PlayerProfile::factory()->for($this->rani)->create(['nickname' => 'Kancil', 'school_name' => 'SMK Negeri 1 Bogor']);

    $this->budi = User::factory()->create(['name' => 'Budi Santoso', 'email' => 'budi@contoh.test', 'whatsapp_number' => '6287700011122']);
    PlayerProfile::factory()->for($this->budi)->create(['nickname' => 'Elang', 'school_name' => 'SD Harapan Bangsa']);
});

/** @return list<int> */
function userSearchIds(string $query): array
{
    $ids = [];
    test()->actingAs(test()->admin)->get('/admin/users?'.$query)->assertOk()
        ->assertInertia(function (Assert $page) use (&$ids): void {
            $page->component('admin/users/index');
            $ids = collect($page->toArray()['props']['users']['data'])->pluck('id')->all();
        });

    return $ids;
}

it('searches every field by default', function (string $search, string $who): void {
    expect(userSearchIds('search='.urlencode($search)))->toBe([$this->{$who}->id]);
})->with([
    'name' => ['Rani Put', 'rani'],
    'nickname' => ['Elang', 'budi'],
    'school' => ['Negeri 1 Bogor', 'rani'],
    'email' => ['budi@contoh', 'budi'],
    'stored phone' => ['6281234567', 'rani'],
    'local phone' => ['0877-0001', 'budi'],
    'international phone' => ['+62 812 3456', 'rani'],
]);

it('limits the search to the chosen field', function (): void {
    expect(userSearchIds('search=SMK&search_by=school'))->toBe([$this->rani->id])
        ->and(userSearchIds('search=SMK&search_by=name'))->toBe([])
        ->and(userSearchIds('search=sekolah&search_by=email'))->toBe([$this->rani->id])
        ->and(userSearchIds('search=sekolah&search_by=school'))->toBe([])
        ->and(userSearchIds('search=Budi&search_by=name'))->toBe([$this->budi->id])
        ->and(userSearchIds('search=0812&search_by=phone'))->toBe([$this->rani->id])
        ->and(userSearchIds('search=Rani&search_by=phone'))->toBe([]);
});

it('falls back to every field for an unknown field and keeps the filter', function (): void {
    expect(userSearchIds('search=Bogor&search_by=password'))->toBe([$this->rani->id]);

    $this->actingAs($this->admin)->get('/admin/users?search=Bogor&search_by=school')
        ->assertInertia(fn (Assert $page) => $page
            ->where('filters.search', 'Bogor')
            ->where('filters.search_by', 'school')
            ->where('users.data.0.whatsapp_number', '6281234567890'));
});

it('treats like wildcards literally', function (): void {
    expect(userSearchIds('search='.urlencode('%')))->toBe([])
        ->and(userSearchIds('search=_'))->toBe([]);
});
