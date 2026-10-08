<?php

use App\Models\Friendship;
use App\Models\User;
use App\Notifications\PlayerNotification;
use App\Services\Chat\ChatServiceClient;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;

const FRIENDS_CHAT_SECRET = 'friends-test-chat-secret-with-32-chars!!';

beforeEach(function (): void {
    config(['chat-service.secret' => FRIENDS_CHAT_SECRET, 'chat-service.publish_url' => 'http://chat.test/internal/publish']);
    Http::fake(['chat.test/*' => Http::response(['delivered' => 1])]);
    $this->withoutVite();
});

function friendPlayer(string $name = 'Player'): User
{
    $user = User::factory()->create(['name' => $name]);
    $user->playerProfile()->create(['grade' => 5, 'nickname' => $name, 'birth_date' => '2015-03-01', 'school_name' => 'SD Ceria']);

    return $user->fresh();
}

describe('requests', function (): void {
    it('sends a request, notifies the other player and pushes a live event', function (): void {
        [$ana, $budi] = [friendPlayer('Ana'), friendPlayer('Budi')];

        $this->actingAs($ana)->post('/friends', ['user_id' => $budi->id])->assertSessionHasNoErrors();

        $friendship = Friendship::query()->sole();
        expect($friendship->status)->toBe(Friendship::PENDING)
            ->and($friendship->requester_id)->toBe($ana->id)
            ->and($budi->unreadNotifications()->where('data->kind', 'friend')->count())->toBe(1);

        Http::assertSent(function ($request) use ($budi): bool {
            $body = json_decode($request->body(), true);

            return $body['users'] === [$budi->id]
                && $body['event']['t'] === 'friend'
                && $body['event']['action'] === 'request'
                && $body['event']['user']['name'] === 'Ana'
                && ! array_key_exists('email', $body['event']['user']);
        });
    });

    it('accepts, notifies the requester and lists both as friends', function (): void {
        [$ana, $budi] = [friendPlayer('Ana'), friendPlayer('Budi')];
        $friendship = Friendship::factory()->create(['requester_id' => $ana->id, 'addressee_id' => $budi->id]);
        $budi->notify(PlayerNotification::system('friend', 'player_notifications.friend_request', ['name' => 'Ana']));

        $this->actingAs($budi)->post("/friends/{$friendship->id}/accept")->assertSessionHasNoErrors();

        expect($friendship->fresh()->status)->toBe(Friendship::ACCEPTED)
            ->and($ana->unreadNotifications()->where('data->key', 'player_notifications.friend_accepted')->count())->toBe(1)
            ->and($budi->unreadNotifications()->where('data->kind', 'friend')->count())->toBe(0);

        $this->actingAs($ana)->get('/friends')->assertInertia(fn (Assert $page) => $page
            ->component('friends/index')
            ->has('friends', 1)
            ->where('friends.0.user.name', 'Budi')
            ->missing('friends.0.user.email')
            ->has('incoming', 0)
            ->has('outgoing', 0));
    });

    it('turns a request back into a friendship when both asked', function (): void {
        [$ana, $budi] = [friendPlayer('Ana'), friendPlayer('Budi')];
        Friendship::factory()->create(['requester_id' => $budi->id, 'addressee_id' => $ana->id]);

        $this->actingAs($ana)->post('/friends', ['user_id' => $budi->id])->assertSessionHasNoErrors();

        expect(Friendship::query()->sole()->status)->toBe(Friendship::ACCEPTED);
    });

    it('rejects adding yourself, duplicates and friends again', function (): void {
        [$ana, $budi] = [friendPlayer('Ana'), friendPlayer('Budi')];

        $this->actingAs($ana)->post('/friends', ['user_id' => $ana->id])->assertSessionHasErrors(['user_id' => __('friends.self')]);
        $this->post('/friends', ['user_id' => $budi->id])->assertSessionHasNoErrors();
        $this->post('/friends', ['user_id' => $budi->id])->assertSessionHasErrors(['user_id' => __('friends.already_sent')]);

        Friendship::query()->update(['status' => Friendship::ACCEPTED]);
        $this->post('/friends', ['user_id' => $budi->id])->assertSessionHasErrors(['user_id' => __('friends.already_friends')]);
        $this->post('/friends', ['user_id' => 999999])->assertSessionHasErrors('user_id');
    });

    it('only lets the addressee accept or decline', function (): void {
        [$ana, $budi, $cici] = [friendPlayer('Ana'), friendPlayer('Budi'), friendPlayer('Cici')];
        $friendship = Friendship::factory()->create(['requester_id' => $ana->id, 'addressee_id' => $budi->id]);

        $this->actingAs($ana)->post("/friends/{$friendship->id}/accept")->assertNotFound();
        $this->actingAs($cici)->post("/friends/{$friendship->id}/decline")->assertNotFound();
        $this->actingAs($cici)->delete("/friends/{$friendship->id}")->assertNotFound();

        $this->actingAs($budi)->post("/friends/{$friendship->id}/decline")->assertSessionHasNoErrors();
        expect(Friendship::query()->count())->toBe(0);
    });

    it('lets the requester cancel and either side remove a friend', function (): void {
        [$ana, $budi] = [friendPlayer('Ana'), friendPlayer('Budi')];
        $pending = Friendship::factory()->create(['requester_id' => $ana->id, 'addressee_id' => $budi->id]);

        $this->actingAs($budi)->delete("/friends/{$pending->id}")->assertSessionHasErrors('friendship');
        $this->actingAs($ana)->delete("/friends/{$pending->id}")->assertSessionHasNoErrors();
        expect(Friendship::query()->count())->toBe(0);

        $friends = Friendship::factory()->accepted()->create(['requester_id' => $ana->id, 'addressee_id' => $budi->id]);
        $this->actingAs($budi)->delete("/friends/{$friends->id}")->assertSessionHasNoErrors();
        expect(Friendship::query()->count())->toBe(0);
    });

    it('caps open requests', function (): void {
        $ana = friendPlayer('Ana');
        foreach (range(1, Friendship::MAX_PENDING_SENT) as $i) {
            Friendship::factory()->create(['requester_id' => $ana->id, 'addressee_id' => friendPlayer("P{$i}")->id]);
        }

        $this->actingAs($ana)->post('/friends', ['user_id' => friendPlayer('Late')->id])
            ->assertSessionHasErrors(['user_id' => __('friends.pending_limit', ['max' => Friendship::MAX_PENDING_SENT])]);
    });
});

describe('search and page', function (): void {
    it('finds players with their relation and never their email', function (): void {
        [$ana, $budi, $bunga] = [friendPlayer('Ana'), friendPlayer('Budi'), friendPlayer('Bunga')];
        Friendship::factory()->create(['requester_id' => $ana->id, 'addressee_id' => $budi->id]);

        $people = $this->actingAs($ana)->getJson('/friends/search?q=bu')->assertOk()->json('people');

        expect(collect($people)->pluck('relation', 'name')->all())->toBe(['Budi' => 'sent', 'Bunga' => 'none'])
            ->and($people[0])->not->toHaveKey('email');
        $this->getJson('/friends/search?q=b')->assertOk()->assertJson(['people' => []]);
    });

    it('shares the pending request count and needs a login', function (): void {
        [$ana, $budi] = [friendPlayer('Ana'), friendPlayer('Budi')];
        Friendship::factory()->create(['requester_id' => $ana->id, 'addressee_id' => $budi->id]);

        $this->actingAs($budi)->get('/friends?tab=requests')->assertInertia(fn (Assert $page) => $page
            ->where('tab', 'requests')
            ->where('pendingFriends', 1)
            ->has('incoming', 1)
            ->where('incoming.0.user.name', 'Ana'));

        auth()->logout();
        $this->get('/friends')->assertRedirect('/login');
    });

    it('keeps working when the chat service is not configured', function (): void {
        config(['chat-service.secret' => '']);
        [$ana, $budi] = [friendPlayer('Ana'), friendPlayer('Budi')];

        $this->actingAs($ana)->post('/friends', ['user_id' => $budi->id])->assertSessionHasNoErrors();
        expect(app(ChatServiceClient::class)->isConfigured())->toBeFalse()
            ->and(Friendship::query()->count())->toBe(1);
    });
});

describe('header and popups', function (): void {
    it('groups the signed-in header into parent menus with children', function (): void {
        $nav = file_get_contents(resource_path('js/components/site-nav.tsx'));
        $menu = file_get_contents(resource_path('js/components/nav-menu.tsx'));
        $css = file_get_contents(resource_path('css/edu-nav.css'));

        expect($nav)->toContain("labelKey: 'nav.social'")
            ->and($nav)->toContain("labelKey: 'nav.account'")
            ->and($nav)->toContain("href: '/friends'")
            ->and($menu)->toContain('aria-expanded={open}')
            ->and($menu)->toContain('inert={!open}')
            ->and($css)->toContain('.edu-nav-section-panel')
            ->and($css)->toContain('grid-template-rows: 0fr');
    });

    it('holds friend popups while a game is running', function (): void {
        $live = file_get_contents(resource_path('js/components/friend-live.tsx'));
        $app = file_get_contents(resource_path('js/app.tsx'));

        expect($live)->toContain('const notice = inGame ? null : (queue[0] ?? null);')
            ->and($app)->toContain('<FriendLive />');
    });

    it('has every friends text in Indonesian and English', function (): void {
        $id = json_decode(file_get_contents(resource_path('js/locales/id-player.json')), true);
        $en = json_decode(file_get_contents(resource_path('js/locales/en-player.json')), true);

        expect(array_keys(Arr::dot($id['friends'])))->toBe(array_keys(Arr::dot($en['friends'])))
            ->and(array_keys($id['friendNotice']))->toBe(array_keys($en['friendNotice']))
            ->and($id['nav']['friends'])->toBe('Teman')
            ->and($en['nav']['social'])->toBe('Social');
    });
});
