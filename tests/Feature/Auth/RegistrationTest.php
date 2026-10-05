<?php

test('registration screen can be rendered', function () {
    $response = $this->get(route('register'));

    $response->assertStatus(200);
});

test('new users can register', function () {
    $response = $this->post(route('register.store'), [
        'name' => 'Test User',
        'email' => 'test@example.com',
        'birth_date' => now()->subYears(10)->toDateString(),
        'school_name' => 'SDN 1 Bogor',
        'password' => 'password',
        'password_confirmation' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('portal', absolute: false));
});

test('new users start in Indonesian', function () {
    $this->post(route('register.store'), [
        'name' => 'Pemain Baru',
        'email' => 'baru@example.com',
        'birth_date' => now()->subYears(9)->toDateString(),
        'school_name' => 'SDN 2 Bogor',
        'password' => 'password',
        'password_confirmation' => 'password',
    ]);

    expect(\App\Models\User::query()->where('email', 'baru@example.com')->value('locale'))->toBe('id');

    $this->get('/dashboard')->assertInertia(fn (\Inertia\Testing\AssertableInertia $page) => $page->where('locale', 'id'));
});

test('the users table defaults to Indonesian', function () {
    $id = \Illuminate\Support\Facades\DB::table('users')->insertGetId([
        'name' => 'Raw', 'email' => 'raw@example.com', 'password' => 'x', 'created_at' => now(), 'updated_at' => now(),
    ]);

    expect(\Illuminate\Support\Facades\DB::table('users')->where('id', $id)->value('locale'))->toBe('id');
});
