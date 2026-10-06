<?php

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\Question;
use App\Models\Role;
use App\Models\User;
use App\Services\LandingStats;
use Illuminate\Support\Facades\Cache;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    Cache::forget(LandingStats::CACHE_KEY);
});

/**
 * @param  array<string, mixed>  $profile
 */
function landingPlayer(string $name, int $points, array $profile = [], ?string $earnedAt = null): User
{
    $user = User::factory()->create(['name' => $name, 'email' => str($name)->slug().'@landing-stats.test']);
    PlayerProfile::factory()->for($user)->create(array_merge(['grade' => 5, 'school_name' => 'SDN 1 Bogor'], $profile));

    if ($points > 0) {
        $ledger = PointLedger::factory()->for($user)->create(['points' => $points]);
        if ($earnedAt !== null) {
            $ledger->forceFill(['created_at' => $earnedAt])->save();
        }
        GameHistory::factory()->for($user)->create(['points' => $points, 'correct' => 4, 'wrong' => 1]);
    }

    return $user;
}

it('serves public landing stats without login', function (): void {
    landingPlayer('Budi Santoso', 300, ['nickname' => null, 'school_name' => 'SDN 1 Bogor', 'grade' => 4]);
    landingPlayer('Siti Aminah', 500, ['nickname' => 'Siti Juara', 'school_name' => ' sdn 1 bogor ', 'grade' => 5]);
    landingPlayer('Rina Wati', 0, ['school_name' => 'SMP 2 Depok']);
    Question::factory()->count(3)->create(['is_active' => true]);
    Question::factory()->create(['is_active' => false]);

    $response = $this->getJson('/landing/stats')->assertOk()->assertJsonStructure([
        'stats' => ['players', 'schools', 'games', 'plays', 'answers', 'questions'],
        'leaderboards' => ['week' => [['rank', 'name', 'school', 'grade', 'points']], 'all'],
        'podium',
        'schools' => [['rank', 'name', 'players', 'points']],
        'playsByGame',
        'generatedAt',
    ]);

    $response->assertJsonPath('stats.players', 3)
        ->assertJsonPath('stats.schools', 2)
        ->assertJsonPath('stats.games', collect(config('game-catalog.categories'))->sum(fn (array $c): int => count($c['games'])))
        ->assertJsonPath('stats.plays', 2)
        ->assertJsonPath('stats.answers', 10)
        ->assertJsonPath('stats.questions', Question::query()->active()->count())
        ->assertJsonPath('leaderboards.all.0.name', 'Siti Juara')
        ->assertJsonPath('leaderboards.all.0.points', 500)
        ->assertJsonPath('leaderboards.all.1.name', 'Budi')
        ->assertJsonPath('leaderboards.all.1.grade', 4)
        ->assertJsonPath('podium.0.rank', 1)
        ->assertJsonPath('schools.0.players', 2)
        ->assertJsonPath('schools.0.points', 800)
        ->assertJsonPath('playsByGame.sky-quiz', 2);

    expect($response->json('schools'))->toHaveCount(1);
});

it('never exposes emails, ids or full names', function (): void {
    $user = landingPlayer('Budi Santoso Wijaya', 300, ['nickname' => null]);

    $body = $this->getJson('/landing/stats')->assertOk()->getContent();

    expect($body)->not->toContain($user->email)
        ->not->toContain('Santoso')
        ->not->toContain('"userId"')
        ->not->toContain('"user_id"')
        ->not->toContain('"id"')
        ->not->toContain('"email"');
    expect(array_keys($this->getJson('/landing/stats')->json('leaderboards.all.0')))->toBe(['rank', 'name', 'school', 'grade', 'points']);
});

it('excludes superadmins, admin roles and disabled users', function (): void {
    landingPlayer('Pemain Asli', 100);
    $super = landingPlayer('Super Boss', 9000);
    $super->forceFill(['is_superadmin' => true])->save();
    $disabled = landingPlayer('Diblokir Orang', 8000);
    $disabled->forceFill(['disabled_at' => now()])->save();
    $admin = landingPlayer('Admin Role', 7000);
    $admin->roles()->attach(Role::query()->firstOrCreate(['slug' => 'admin'], ['name' => 'Admin'])->id);

    $json = $this->getJson('/landing/stats')->assertOk()->json();

    expect($json['stats']['players'])->toBe(1)
        ->and($json['stats']['plays'])->toBe(1)
        ->and(collect($json['leaderboards']['all'])->pluck('name')->all())->toBe(['Pemain'])
        ->and($json['schools'][0]['points'])->toBe(100);
});

it('ranks the weekly board by points earned in the last 7 days only', function (): void {
    landingPlayer('Lama Sekali', 900, earnedAt: now()->subDays(20)->toDateTimeString());
    landingPlayer('Baru Saja', 50);

    $json = $this->getJson('/landing/stats')->json();

    expect(collect($json['leaderboards']['week'])->pluck('name')->all())->toBe(['Baru'])
        ->and(collect($json['leaderboards']['all'])->pluck('name')->all())->toBe(['Lama', 'Baru']);
});

it('caches the snapshot', function (): void {
    landingPlayer('Pertama Kali', 100);
    $this->getJson('/landing/stats')->assertJsonPath('stats.players', 1);

    landingPlayer('Kedua Kali', 200);
    $this->getJson('/landing/stats')->assertJsonPath('stats.players', 1);

    Cache::forget(LandingStats::CACHE_KEY);
    $this->getJson('/landing/stats')->assertJsonPath('stats.players', 2);
});

it('throttles the endpoint at 60 requests per minute', function (): void {
    foreach (range(1, 60) as $ignored) {
        $this->getJson('/landing/stats')->assertOk();
    }

    $this->getJson('/landing/stats')->assertStatus(429);
});

it('wires the landing pages to the live stats endpoint', function (): void {
    $landing = file_get_contents(public_path('new-landing/index.html'));
    $games = file_get_contents(public_path('new-landing/games.html'));

    expect($landing)->toContain("'/landing/stats'")
        ->toContain('data-testid="landing-live-stats"')
        ->toContain('prefers-reduced-motion: reduce')
        ->and($games)->toContain("'/landing/stats'");
});
