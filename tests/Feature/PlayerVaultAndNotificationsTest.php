<?php

use App\Models\BroadcastMessage;
use App\Models\CharacterItem;
use App\Models\PlayerProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\PlayerNotifications;
use Illuminate\Notifications\DatabaseNotification;
use Inertia\Testing\AssertableInertia as Assert;

const PLAYER_NOTICE_SECRET = 'player-notice-test-secret-with-32-chars!';

beforeEach(function (): void {
    config(['scout.driver' => 'null', 'game-service.secret' => PLAYER_NOTICE_SECRET]);
    $this->withoutVite();
});

function vaultPlayer(int $points = 0, string $locale = 'id', int $grade = 4): User
{
    $user = User::factory()->create(['locale' => $locale]);
    PlayerProfile::factory()->for($user)->create([
        'grade' => $grade,
        'birth_date' => now()->subYears(10)->toDateString(),
        'school_name' => 'SD Test',
    ]);
    if ($points > 0) {
        $user->pointLedgers()->create(['points' => $points, 'reason' => 'seed', 'event_id' => 'seed-'.$user->id]);
    }

    return $user;
}

function buyItem(User $user, string $key): CharacterItem
{
    $item = CharacterItem::query()->where('key', $key)->firstOrFail();
    test()->actingAs($user)->post("/character/items/{$item->id}/buy")->assertRedirect('/character');

    return $item;
}

/** @param  array<string, mixed>  $overrides */
function postNoticeResult(User $user, array $overrides = []): void
{
    $payload = array_replace([
        'event_id' => 'fq-'.$user->id.'-lakeside-'.random_int(1_000_000, 9_999_999),
        'user_id' => $user->id,
        'game_key' => 'flag-quest',
        'mission' => 'lakeside',
        'grade' => 4,
        'points' => 50,
        'correct' => 5,
        'wrong' => 1,
        'duration_seconds' => 120,
        'completed_at' => now()->toIso8601String(),
    ], $overrides);
    $body = json_encode($payload);
    $timestamp = now()->getTimestamp();

    test()->call('POST', '/api/internal/game-results', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_X_GAME_TIMESTAMP' => (string) $timestamp,
        'HTTP_X_GAME_SIGNATURE' => hash_hmac('sha256', $timestamp.'.'.$body, PLAYER_NOTICE_SECRET),
    ], $body)->assertCreated();
}

describe('vault', function (): void {
    it('keeps bought items in the vault on the dashboard', function (): void {
        $user = vaultPlayer(400);
        $hat = buyItem($user, 'wizard-hat');

        $this->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('user/dashboard')
            ->has('vault', 1)
            ->where('vault.0.key', 'wizard-hat')
            ->where('vault.0.slot', 'hat')
            ->where('vault.0.name', $hat->name('id'))
            ->where('vault.0.price_paid', $hat->price)
            ->where('vault.0.equipped', false)
            ->where('vault.0.retired', false));
    });

    it('shows an empty vault for players who bought nothing', function (): void {
        $this->actingAs(vaultPlayer())->get('/dashboard')
            ->assertInertia(fn (Assert $page) => $page->where('vault', []));
    });

    it('wears an item from the vault, then takes it off, then wears it again', function (): void {
        $user = vaultPlayer(400);
        $hat = buyItem($user, 'wizard-hat');

        $this->post("/vault/{$hat->id}/wear")->assertRedirect()->assertSessionHas('success');
        expect($user->playerProfile->fresh()->equipped)->toBe(['hat' => $hat->id])
            ->and($user->playerProfile->fresh()->accessory)->toBe('cap');

        $this->post("/vault/{$hat->id}/wear")->assertRedirect();
        expect($user->playerProfile->fresh()->equipped)->toBe([])
            ->and($user->playerProfile->fresh()->accessory)->toBe('none');

        $this->post("/vault/{$hat->id}/wear")->assertRedirect();
        $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page
            ->where('vault.0.equipped', true)
            ->where('character.items.hat.style', $hat->style));
    });

    it('swaps the worn item in the same slot', function (): void {
        $user = vaultPlayer(1000);
        $wizard = buyItem($user, 'wizard-hat');
        $crown = buyItem($user, 'royal-crown');

        $this->post("/vault/{$wizard->id}/wear");
        $this->post("/vault/{$crown->id}/wear");

        expect($user->playerProfile->fresh()->equipped)->toBe(['hat' => $crown->id]);
    });

    it('refuses to wear an item the player does not own', function (): void {
        $user = vaultPlayer(400);
        $hat = CharacterItem::query()->where('key', 'wizard-hat')->firstOrFail();

        $this->actingAs($user)->post("/vault/{$hat->id}/wear")->assertSessionHasErrors('item');
        expect($user->playerProfile->fresh()->equipped)->toBeEmpty();
    });

    it('keeps retired items usable for players who own them', function (): void {
        $user = vaultPlayer(400);
        $hat = buyItem($user, 'wizard-hat');
        $hat->update(['is_active' => false]);

        $this->post("/vault/{$hat->id}/wear")->assertRedirect()->assertSessionHasNoErrors();
        $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page
            ->where('vault.0.retired', true)
            ->where('vault.0.equipped', true));

        $this->patch('/character', [
            'color' => 'amber',
            'gender' => 'boy',
            'skin' => 'light',
            'hair_color' => 'brown',
            'equipped' => ['hat' => $hat->id],
        ])->assertSessionHasNoErrors();
    });

    it('requires login for the vault', function (): void {
        $this->post('/vault/1/wear')->assertRedirect(route('login'));
    });
});

describe('player notifications', function (): void {
    it('notifies the player after buying an item', function (): void {
        $user = vaultPlayer(400);
        $hat = buyItem($user, 'wizard-hat');

        $feed = $this->getJson('/notifications')->assertOk()->json();

        expect($feed['unread'])->toBe(1)
            ->and($feed['items'][0]['kind'])->toBe('item')
            ->and($feed['items'][0]['title'])->toBe('Item baru di brankas')
            ->and($feed['items'][0]['body'])->toContain($hat->name('id'))
            ->and($feed['items'][0]['url'])->toBe('/dashboard#vault')
            ->and($feed['items'][0]['read'])->toBeFalse();
    });

    it('translates system notifications into the player language', function (): void {
        $user = vaultPlayer(400, 'en');
        buyItem($user, 'wizard-hat');

        expect($this->getJson('/notifications')->json('items.0.title'))->toBe('New item in your vault');
    });

    it('notifies points and level up after a finished game', function (): void {
        config(['game-catalog.points_per_level' => 200]);
        $user = vaultPlayer(180);

        postNoticeResult($user, ['points' => 50]);

        $items = collect($this->actingAs($user)->getJson('/notifications')->json('items'));

        expect($items->firstWhere('kind', 'points')['title'])->toBe('+50 poin!')
            ->and($items->firstWhere('kind', 'level')['title'])->toBe('Naik ke level 2!');
    });

    it('only notifies points when the level stays the same', function (): void {
        config(['game-catalog.points_per_level' => 200]);
        $user = vaultPlayer(20);

        postNoticeResult($user, ['points' => 50]);

        $kinds = $user->notifications()->get()->pluck('data.kind');

        expect($kinds->reject(fn (string $kind): bool => $kind === 'badge')->values()->all())->toBe(['points'])
            ->and($kinds->all())->toContain('badge');
    });

    it('does not notify for games without points', function (): void {
        $user = vaultPlayer();

        postNoticeResult($user, ['points' => 0, 'correct' => 0, 'wrong' => 3]);

        expect($user->notifications()->get()->pluck('data.kind')->reject(fn (string $kind): bool => $kind === 'badge')->count())->toBe(0);
    });

    it('notifies the player when the teacher role changes', function (): void {
        $admin = User::factory()->create(['is_superadmin' => true, 'email_verified_at' => now()]);
        $user = vaultPlayer();

        $this->actingAs($admin)->patch("/admin/users/{$user->id}/teacher")->assertRedirect();
        $this->travel(1)->minutes();
        $this->actingAs($admin)->patch("/admin/users/{$user->id}/teacher")->assertRedirect();

        $items = $this->actingAs($user)->getJson('/notifications')->json('items');
        expect(array_column($items, 'title'))->toBe(['Akses guru dicabut', 'Kamu sekarang guru']);
    });

    it('marks one and then all notifications as read', function (): void {
        $user = vaultPlayer(1000);
        buyItem($user, 'wizard-hat');
        buyItem($user, 'royal-crown');
        $first = $user->notifications()->firstOrFail();

        $this->postJson("/notifications/{$first->id}/read")->assertOk()->assertJson(['unread' => 1]);
        $this->postJson('/notifications/read')->assertOk()->assertJson(['unread' => 0]);

        expect($user->unreadNotifications()->count())->toBe(0);
    });

    it('cannot read another player notification', function (): void {
        $owner = vaultPlayer(400);
        buyItem($owner, 'wizard-hat');
        $notice = $owner->notifications()->firstOrFail();

        $this->actingAs(vaultPlayer())->postJson("/notifications/{$notice->id}/read")->assertNotFound();
        expect($notice->fresh()->read_at)->toBeNull();
    });

    it('shares the unread count with every page', function (): void {
        $user = vaultPlayer(400);
        buyItem($user, 'wizard-hat');

        $this->get('/portal')->assertInertia(fn (Assert $page) => $page->where('unreadNotifications', 1));
    });

    it('requires login for the feed', function (): void {
        $this->getJson('/notifications')->assertUnauthorized();
    });

    it('drops unsafe links when showing a notification', function (): void {
        $user = vaultPlayer();
        $user->notifications()->create([
            'id' => (string) str()->uuid(),
            'type' => 'player',
            'data' => ['kind' => 'admin', 'title' => 'Hi', 'body' => 'x', 'url' => 'javascript:alert(1)'],
        ]);

        expect($this->actingAs($user)->getJson('/notifications')->json('items.0.url'))->toBeNull();
    });
});

describe('admin notifications', function (): void {
    beforeEach(function (): void {
        $this->admin = User::factory()->create(['is_superadmin' => true, 'email_verified_at' => now()]);
    });

    it('shows the notification page to superadmins only', function (): void {
        $this->actingAs($this->admin)->get('/admin/notifications')->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('admin/notifications')
                ->where('audiences', PlayerNotifications::AUDIENCES)
                ->has('counts.players'));

        $this->actingAs(vaultPlayer())->get('/admin/notifications')->assertForbidden();
    });

    it('sends a manual notification to one grade', function (): void {
        $gradeFour = vaultPlayer(grade: 4);
        $gradeFive = vaultPlayer(grade: 5);

        $this->actingAs($this->admin)->post('/admin/notifications', [
            'title' => 'Kuis spesial',
            'body' => 'Main TTS sekarang!',
            'url' => '/games/crossword',
            'audience' => 'grade',
            'grade' => 4,
        ])->assertRedirect()->assertSessionHas('success');

        expect($gradeFour->notifications()->count())->toBe(1)
            ->and($gradeFive->notifications()->count())->toBe(0);

        $message = BroadcastMessage::query()->latest('id')->firstOrFail();
        expect($message->target_segment)->toBe('player:grade:4')
            ->and($message->recipients)->toBe(1)
            ->and($message->sent_at)->not->toBeNull();

        $feed = $this->actingAs($gradeFour)->getJson('/notifications')->json('items.0');
        expect($feed)->toMatchArray([
            'kind' => 'admin',
            'title' => 'Kuis spesial',
            'body' => 'Main TTS sekarang!',
            'url' => '/games/crossword',
        ]);
    });

    it('sends to teachers only', function (): void {
        $teacher = vaultPlayer();
        $teacher->roles()->attach(Role::query()->firstOrCreate(['slug' => Role::TEACHER], ['name' => 'Guru', 'is_system' => true])->id);
        $player = vaultPlayer();

        $this->actingAs($this->admin)->post('/admin/notifications', [
            'title' => 'Rapat guru',
            'body' => 'Besok jam 9.',
            'audience' => 'teachers',
        ])->assertSessionHas('success');

        expect($teacher->notifications()->count())->toBe(1)
            ->and($player->notifications()->count())->toBe(0);
    });

    it('validates the notification', function (array $data, string $field): void {
        $this->actingAs($this->admin)->post('/admin/notifications', array_replace([
            'title' => 'Hi',
            'body' => 'Hello',
            'audience' => 'players',
        ], $data))->assertSessionHasErrors($field);

        expect(DatabaseNotification::query()->count())->toBe(0);
    })->with([
        'missing title' => [['title' => ''], 'title'],
        'long body' => [['body' => str_repeat('a', 501)], 'body'],
        'unknown audience' => [['audience' => 'everyone-ever'], 'audience'],
        'grade without number' => [['audience' => 'grade'], 'grade'],
        'javascript link' => [['url' => 'javascript:alert(1)'], 'url'],
        'protocol relative link' => [['url' => '//evil.test'], 'url'],
        'plain http link' => [['url' => 'http://example.com'], 'url'],
    ]);

    it('forbids regular users from sending', function (): void {
        $this->actingAs(vaultPlayer())->post('/admin/notifications', [
            'title' => 'Hi', 'body' => 'x', 'audience' => 'all',
        ])->assertForbidden();
    });
});

describe('pwa', function (): void {
    it('ships a valid web app manifest with icons', function (): void {
        $manifest = json_decode((string) file_get_contents(public_path('manifest.webmanifest')), true, flags: JSON_THROW_ON_ERROR);

        expect($manifest['display'])->toBe('standalone')
            ->and($manifest['start_url'])->toStartWith('/dashboard')
            ->and(collect($manifest['icons'])->pluck('sizes')->all())->toContain('192x192', '512x512')
            ->and(collect($manifest['icons'])->pluck('purpose')->all())->toContain('maskable');

        foreach ($manifest['icons'] as $icon) {
            expect(file_exists(public_path(ltrim($icon['src'], '/'))))->toBeTrue();
        }
        expect(file_exists(public_path('sw.js')))->toBeTrue()
            ->and(file_exists(public_path('offline.html')))->toBeTrue();
    });

    it('links the manifest from every page', function (): void {
        $this->actingAs(vaultPlayer())->get('/dashboard')->assertOk()
            ->assertSee('<link rel="manifest" href="/manifest.webmanifest">', false)
            ->assertSee('<meta name="theme-color" content="#ffd93d">', false);
    });
});
