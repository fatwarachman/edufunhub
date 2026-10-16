<?php

use App\Models\User;

it('stores the exact page a signed in user is viewing', function (): void {
    $teacher = User::factory()->create();

    $this->actingAs($teacher)
        ->postJson('/current-page', ['path' => '/teacher/classrooms/12?tab=live', 'label' => 'Ruang Kelas IPA - EduFunHub'])
        ->assertOk();

    expect($teacher->refresh())
        ->current_page_path->toBe('/teacher/classrooms/12?tab=live')
        ->current_page_label->toBe('Ruang Kelas IPA - EduFunHub')
        ->last_seen_at->not->toBeNull();
});

it('drops secret looking query parameters from the stored page', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/current-page', ['path' => '/reset?token=abc&signature=x&tab=games', 'label' => "Reset\npage"])
        ->assertOk();

    expect($user->refresh())
        ->current_page_path->toBe('/reset?tab=games')
        ->current_page_label->toBe('Reset page');
});

it('rejects guests and invalid paths', function (): void {
    $this->postJson('/current-page', ['path' => '/dashboard', 'label' => 'Dashboard'])->assertUnauthorized();

    $this->actingAs(User::factory()->create())
        ->postJson('/current-page', ['path' => 'https://evil.test', 'label' => 'x'])
        ->assertUnprocessable();
});
