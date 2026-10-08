<?php

use App\Models\Friendship;
use App\Models\User;
use App\Services\Chat\ChatServiceClient;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

const ONLINE_CHAT_SECRET = 'online-players-test-chat-secret-32-chars';

beforeEach(function (): void {
    config([
        'chat-service.secret' => ONLINE_CHAT_SECRET,
        'chat-service.publish_url' => 'http://chat.test/internal/publish',
        'chat-service.online_url' => 'http://chat.test/internal/online',
    ]);
    Cache::flush();
    $this->withoutVite();
});

function onlinePlayer(string $nickname, array $attributes = []): User
{
    $user = User::factory()->create(['name' => $nickname.' Full', 'locale' => 'id', ...$attributes]);
    $user->playerProfile()->create(['grade' => 5, 'nickname' => $nickname, 'birth_date' => '2015-03-01', 'school_name' => 'SD Ceria']);

    return $user->fresh();
}

function fakeOnline(array $ids): void
{
    Http::fake([
        'chat.test/internal/online' => Http::response(['users' => $ids]),
        'chat.test/*' => Http::response(['delivered' => 1]),
    ]);
}

describe('chat client', function (): void {
    it('signs the online lookup and returns the user ids', function (): void {
        fakeOnline([3, 7, 7, 0]);

        expect(app(ChatServiceClient::class)->onlineUserIds())->toBe([3, 7]);

        Http::assertSent(function (Request $request): bool {
            $stamp = $request->header('X-Chat-Timestamp')[0];

            return $request->method() === 'GET'
                && $request->header('X-Chat-Signature')[0] === hash_hmac('sha256', $stamp.'.', ONLINE_CHAT_SECRET);
        });
    });

    it('returns null when the service is off or failing', function (): void {
        Http::fake(['chat.test/*' => Http::response('down', 503)]);
        expect(app(ChatServiceClient::class)->onlineUserIds())->toBeNull();

        config(['chat-service.secret' => '']);
        expect(app(ChatServiceClient::class)->onlineUserIds())->toBeNull();
    });
});

describe('dashboard counter', function (): void {
    it('shows how many players are online as a deferred prop', function (): void {
        [$me, $other, $offline] = [onlinePlayer('Ana'), onlinePlayer('Budi'), onlinePlayer('Cici')];
        $disabled = onlinePlayer('Dodi', ['disabled_at' => now()]);
        $noProfile = User::factory()->create();
        fakeOnline([$me->id, $other->id, $disabled->id, $noProfile->id]);

        $this->actingAs($me)->get(route('dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('user/dashboard')
            ->missing('onlineCount')
            ->loadDeferredProps('online', fn (Assert $reload) => $reload->where('onlineCount', 2)));
    });

    it('falls back to recent activity when the chat service is unreachable', function (): void {
        Http::fake(['chat.test/*' => Http::response('down', 503)]);
        $me = onlinePlayer('Ana');
        onlinePlayer('Budi')->forceFill(['last_seen_at' => now()->subMinutes(2)])->save();
        onlinePlayer('Cici')->forceFill(['last_seen_at' => now()->subHour()])->save();

        $this->actingAs($me)->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('online', fn (Assert $reload) => $reload->where('onlineCount', 2)));
    });
});

describe('online players page', function (): void {
    it('lists online players with the viewer first and no private data', function (): void {
        [$me, $friend, $stranger] = [onlinePlayer('Ana'), onlinePlayer('Budi'), onlinePlayer('Cici')];
        onlinePlayer('Dodi');
        Friendship::query()->create(['requester_id' => $me->id, 'addressee_id' => $friend->id, 'status' => Friendship::ACCEPTED]);
        fakeOnline([$stranger->id, $friend->id, $me->id]);

        $this->actingAs($me)->get(route('players.online'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('players/online')
            ->where('source', 'live')
            ->where('pagination.total', 3)
            ->has('players', 3)
            ->where('players.0.id', $me->id)
            ->where('players.0.isMe', true)
            ->where('players.0.relation', 'self')
            ->where('players.0.name', 'Ana')
            ->missing('players.0.email')
            ->where('players', fn ($players): bool => collect($players)->firstWhere('id', $friend->id)['relation'] === 'friends'
                && collect($players)->firstWhere('id', $stranger->id)['relation'] === 'none'));
    });

    it('paginates the list', function (): void {
        $me = onlinePlayer('Ana');
        $ids = collect(range(1, 25))->map(fn (int $i): int => onlinePlayer("P{$i}")->id)->push($me->id)->all();
        fakeOnline($ids);

        $this->actingAs($me)->get(route('players.online', ['page' => 2]))->assertInertia(fn (Assert $page) => $page
            ->where('pagination.current_page', 2)
            ->where('pagination.last_page', 2)
            ->where('pagination.total', 26)
            ->has('players', 2));
    });

    it('marks the recent-activity fallback', function (): void {
        config(['chat-service.secret' => '']);
        $me = onlinePlayer('Ana');
        $me->forceFill(['last_seen_at' => now()])->save();

        $this->actingAs($me)->get(route('players.online'))->assertInertia(fn (Assert $page) => $page
            ->where('source', 'recent')
            ->where('pagination.total', 1));
    });

    it('is for signed-in players only', function (): void {
        $this->get(route('players.online'))->assertRedirect(route('login'));
    });

    it('wires the dashboard counter, avatar links and the chat button', function (): void {
        $dashboard = file_get_contents(resource_path('js/pages/user/dashboard.tsx'));
        $online = file_get_contents(resource_path('js/pages/players/online.tsx'));
        $show = file_get_contents(resource_path('js/pages/players/show.tsx'));

        expect($dashboard)->toContain('href="/players/online"')->toContain('data="onlineCount"')
            ->and($online)->toContain('href={`/players/${player.id}`}')->toContain('<PlayerAvatar')
            ->and($show)->toContain('<ChatButton')->toContain('player-page-chat');
    });

    it('ships matching id and en keys', function (): void {
        $id = json_decode(file_get_contents(resource_path('js/locales/id-player.json')), true);
        $en = json_decode(file_get_contents(resource_path('js/locales/en-player.json')), true);

        expect(array_keys(Arr::dot($id['onlinePlayers'])))->toBe(array_keys(Arr::dot($en['onlinePlayers'])))
            ->and(array_keys(Arr::dot($id['playerDash']['online'])))->toBe(array_keys(Arr::dot($en['playerDash']['online'])));
    });
});

it('opens a direct chat from the player page', function (): void {
    fakeOnline([]);
    [$me, $other] = [onlinePlayer('Ana'), onlinePlayer('Budi')];

    $this->actingAs($me)->postJson(route('chat.direct'), ['user_id' => $other->id])
        ->assertCreated()
        ->assertJsonPath('conversation.type', 'direct');
});
