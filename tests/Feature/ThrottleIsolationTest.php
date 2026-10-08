<?php

use App\Models\User;

beforeEach(fn () => $this->withoutVite());

it('gives every throttled route its own counter', function (): void {
    $unnamed = [];
    foreach (['web', 'admin', 'api'] as $file) {
        preg_match_all("/'throttle:(\\d+),(\\d+)(,[^']*)?'/", file_get_contents(base_path("routes/{$file}.php")), $matches, PREG_SET_ORDER);
        foreach ($matches as $match) {
            if (($match[3] ?? '') === '') {
                $unnamed[] = $file.': '.$match[0];
            }
        }
    }

    expect($unnamed)->toBe([]);
});

it('does not block the ability analysis after other throttled requests', function (): void {
    $admin = User::factory()->superadmin()->create();
    $player = User::factory()->create();
    $player->playerProfile()->create(['grade' => 5]);

    foreach (range(1, 12) as $i) {
        $this->actingAs($admin)->postJson('/screen-time/beat', []);
    }

    $response = $this->actingAs($admin)->post("/admin/users/{$player->id}/ability-assessments");

    expect($response->status())->not->toBe(429);
});
