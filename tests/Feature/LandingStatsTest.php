<?php

use App\Models\CharacterItem;
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
        'stats' => ['players', 'schools', 'games', 'categories', 'plays', 'answers', 'questions', 'teachers', 'teacherQuestions', 'shopItems'],
        'catalog' => [['key', 'url', 'category', 'minPlayers', 'maxPlayers']],
        'shop',
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

it('caches the snapshot for at most one minute', function (): void {
    landingPlayer('Pertama Kali', 100);
    $this->getJson('/landing/stats')->assertJsonPath('stats.players', 1);

    landingPlayer('Kedua Kali', 200);
    $this->getJson('/landing/stats')->assertJsonPath('stats.players', 1);

    $this->travel(LandingStats::CACHE_SECONDS + 1)->seconds();
    $this->getJson('/landing/stats')->assertJsonPath('stats.players', 2);

    expect(LandingStats::CACHE_SECONDS)->toBeLessThanOrEqual(60);
});

it('lets browsers reuse the response for 30 seconds only', function (): void {
    expect($this->getJson('/landing/stats')->headers->get('Cache-Control'))->toContain('max-age=30');
});

it('mirrors the game catalog exactly, with player limits and relative urls', function (): void {
    $expected = collect(config('game-catalog.categories'))->flatMap(fn (array $category): array => collect($category['games'])
        ->map(fn (array $game): array => [
            'key' => $game['key'],
            'url' => route($game['route'], absolute: false),
            'category' => $category['key'],
            'minPlayers' => $game['min_players'],
            'maxPlayers' => $game['max_players'],
        ])->all())->values()->all();

    $json = $this->getJson('/landing/stats')->assertOk()->json();

    expect($json['catalog'])->toBe($expected)
        ->and($json['stats']['games'])->toBe(count($expected))
        ->and($json['stats']['categories'])->toBe(count(config('game-catalog.categories')))
        ->and(collect($json['catalog'])->pluck('key')->all())->toContain('crossword', 'floor-drop', 'snakes-and-ladders');
});

it('counts teachers and their active questions without staff or other sources', function (): void {
    $teacherRole = Role::query()->firstOrCreate(['slug' => Role::TEACHER], ['name' => 'Guru']);
    $teacher = landingPlayer('Guru Satu', 0);
    $teacher->roles()->attach($teacherRole->id);
    $staffTeacher = landingPlayer('Guru Admin', 0);
    $staffTeacher->forceFill(['is_superadmin' => true])->save();
    $staffTeacher->roles()->attach($teacherRole->id);

    Question::factory()->count(2)->create(['source' => 'teacher', 'created_by' => $teacher->id, 'is_active' => true]);
    Question::factory()->create(['source' => 'import', 'created_by' => $teacher->id, 'is_active' => false]);
    Question::factory()->create(['source' => 'seed', 'is_active' => true]);

    $json = $this->getJson('/landing/stats')->assertOk()->json();

    expect($json['stats']['teachers'])->toBe(1)
        ->and($json['stats']['teacherQuestions'])->toBe(2)
        ->and($json['stats']['questions'])->toBe(Question::query()->active()->count());
});

it('features the priciest active shop items with name, slot and price only', function (): void {
    CharacterItem::factory()->create(['name_id' => 'Mahkota Uji', 'slot' => 'hat', 'price' => 900]);
    CharacterItem::factory()->create(['name_id' => 'Sayap Uji', 'slot' => 'back', 'price' => 700]);
    CharacterItem::factory()->create(['name_id' => 'Item Nonaktif', 'price' => 5000, 'is_active' => false]);
    CharacterItem::factory()->free()->create(['name_id' => 'Item Gratis']);

    $json = $this->getJson('/landing/stats')->assertOk()->json();
    $active = CharacterItem::query()->active()->where('price', '>', 0)->count();

    expect($json['shop'][0])->toBe(['name' => 'Mahkota Uji', 'slot' => 'hat', 'price' => 900])
        ->and($json['shop'][1]['name'])->toBe('Sayap Uji')
        ->and(collect($json['shop'])->pluck('name')->all())->not->toContain('Item Nonaktif', 'Item Gratis')
        ->and(count($json['shop']))->toBeLessThanOrEqual(LandingStats::SHOP_FEATURED_LIMIT)
        ->and($json['stats']['shopItems'])->toBe($active);
});

it('serves an empty but well-formed snapshot on a fresh install', function (): void {
    $json = $this->getJson('/landing/stats')->assertOk()->json();

    expect($json['stats']['players'])->toBe(0)
        ->and($json['leaderboards']['all'])->toBe([])
        ->and($json['schools'])->toBe([])
        ->and($json['playsByGame'])->toBe([])
        ->and($json['catalog'])->not->toBeEmpty();
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

it('keeps invented figures out of the landing pages', function (string $file): void {
    $html = file_get_contents(public_path('new-landing/'.$file));
    $text = preg_replace(['#<style[\s\S]*?</style>#', '#<script[\s\S]*?</script>#', '#<svg[\s\S]*?</svg>#'], '', $html);
    $text = html_entity_decode(strip_tags($text));

    expect(preg_match_all('/\d{1,3}(?:\.\d{3})+\+?/', $text, $matches))->toBe(0, 'thousands figure: '.implode(', ', $matches[0] ?? []))
        ->and(preg_match('/\d+\+/', $text))->toBe(0)
        ->and(preg_match('/\d+\s*(?:[-–]\s*\d+\s*)?(?:pemain|siswa|soal|guru|pelajar|sekolah|pilihan)\b/iu', $text, $hit))->toBe(0, 'count claim: '.($hit[0] ?? ''))
        ->and(preg_match('/Rp\s*[1-9]/', $text))->toBe(0)
        ->and(preg_match('/\d+\s*Poin/i', $text))->toBe(0);
})->with(['index.html', 'games.html']);

it('lists every catalog game in the landing play menus', function (): void {
    $landing = file_get_contents(public_path('new-landing/index.html'));

    foreach (collect(config('game-catalog.categories'))->flatMap(fn (array $c): array => $c['games']) as $game) {
        $url = route($game['route'], absolute: false);
        expect(substr_count($landing, 'href="'.$url.'"'))->toBeGreaterThanOrEqual(2, $url.' missing from desktop or phone menu');
    }
});

it('renders live data with textContent and refreshes only while visible', function (string $file): void {
    $html = file_get_contents(public_path('new-landing/'.$file));
    preg_match_all('#<script>([\s\S]*?)</script>#', $html, $scripts);
    $live = collect($scripts[1])->first(fn (string $js): bool => str_contains($js, "'/landing/stats'"));

    expect($live)->toContain('REFRESH_MS = 60000')
        ->toContain("document.visibilityState === 'visible'")
        ->toContain('textContent')
        ->not->toMatch('/innerHTML\s*=\s*+(?!iconMarkup;)/');
})->with(['index.html', 'games.html']);
