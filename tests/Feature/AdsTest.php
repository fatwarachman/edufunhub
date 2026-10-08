<?php

use App\Models\AdCampaign;
use App\Models\AdCreative;
use App\Models\AdDailyStat;
use App\Models\AdEvent;
use App\Models\AdPlacementSetting;
use App\Models\Advertiser;
use App\Models\CharacterItem;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Services\Ads\AdServer;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

/** A real 1x1 PNG, so image validation works without the GD extension. */
function fakePng(string $name): UploadedFile
{
    return UploadedFile::fake()->createWithContent($name, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
}

function adsAdmin(): User
{
    return User::factory()->create(['is_superadmin' => true]);
}

function adsPlayer(int $grade = 4): User
{
    $user = User::factory()->withPlayerDetails()->create();
    PlayerProfile::query()->where('user_id', $user->id)->update(['grade' => $grade]);

    return $user->refresh();
}

/** @return array<string, array<string, mixed>> */
function servedAds(User $user, string $game = 'quiz-duel'): array
{
    return app(AdServer::class)->forGame($game, $user);
}

beforeEach(function () {
    Storage::fake('public');
});

it('restricts the ad manager to superadmins', function () {
    $this->actingAs(adsPlayer())->get('/admin/ads')->assertForbidden();
    $this->actingAs(adsAdmin())->get('/admin/ads')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('admin/ads/index')->has('inventory', count(config('ads.placements'))));
});

it('creates advertisers with a logo and campaigns with flight data', function () {
    $admin = adsAdmin();

    $this->actingAs($admin)->post('/admin/ads/advertisers', [
        'name' => 'PT Susu Ceria',
        'brand' => 'Susu Ceria',
        'website' => 'https://susuceria.example',
        'is_active' => true,
        'logo' => fakePng('logo.png'),
    ])->assertRedirect('/admin/ads?tab=advertisers');

    $advertiser = Advertiser::query()->sole();
    expect($advertiser->logo_path)->toStartWith('ads/logos/')
        ->and($advertiser->logo_url)->toStartWith('/ads/media/logos/');
    Storage::disk('public')->assertExists($advertiser->logo_path);

    $this->actingAs($admin)->post('/admin/ads/campaigns', [
        'advertiser_id' => $advertiser->id,
        'name' => 'Back to school',
        'status' => 'draft',
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->addDays(29)->toDateString(),
        'pricing_model' => 'flat',
        'contract_value' => 7500000,
        'max_impressions' => 100000,
        'weight' => 7,
        'target_games' => ['quiz-duel', 'sky-quiz'],
        'grade_min' => 1,
        'grade_max' => 6,
    ])->assertSessionHasNoErrors();

    $campaign = AdCampaign::query()->sole();
    expect($campaign->target_games)->toBe(['quiz-duel', 'sky-quiz'])
        ->and($campaign->contract_value)->toBe(7500000)
        ->and($campaign->created_by)->toBe($admin->id);
});

it('validates campaign dates, games and grades', function () {
    $advertiser = Advertiser::factory()->create();

    $this->actingAs(adsAdmin())->post('/admin/ads/campaigns', [
        'advertiser_id' => $advertiser->id,
        'name' => 'Bad',
        'status' => 'active',
        'starts_on' => now()->toDateString(),
        'ends_on' => now()->subDay()->toDateString(),
        'pricing_model' => 'barter',
        'contract_value' => 0,
        'weight' => 11,
        'target_games' => ['not-a-game'],
        'grade_min' => 6,
        'grade_max' => 3,
    ])->assertSessionHasErrors(['ends_on', 'pricing_model', 'weight', 'target_games.0', 'grade_max']);
});

it('validates creatives by type, size and placement', function () {
    $campaign = AdCampaign::factory()->create();
    $url = "/admin/ads/campaigns/{$campaign->id}/creatives";
    $admin = adsAdmin();

    $this->actingAs($admin)->post($url, [
        'type' => 'logo', 'name' => 'No file', 'size' => 'leaderboard',
        'placements' => ['arena.board'], 'display_seconds' => 8,
    ])->assertSessionHasErrors(['image', 'placements']);

    $this->actingAs($admin)->post($url, [
        'type' => 'motto', 'name' => 'Empty', 'placements' => ['jingle.win'], 'display_seconds' => 8,
        'click_url' => 'http://insecure.example',
    ])->assertSessionHasErrors(['motto', 'placements.0', 'click_url']);

    $this->actingAs($admin)->post($url, [
        'type' => 'jingle', 'name' => 'Too long', 'placements' => ['jingle.start'], 'display_seconds' => 8,
        'audio' => UploadedFile::fake()->create('jingle.mp3', 100, 'audio/mpeg'), 'audio_seconds' => 40,
    ])->assertSessionHasErrors(['audio_seconds']);

    $this->actingAs($admin)->post($url, [
        'type' => 'logo', 'name' => 'SVG', 'size' => 'badge', 'placements' => ['arena.board'], 'display_seconds' => 8,
        'image' => UploadedFile::fake()->create('logo.svg', 4, 'image/svg+xml'),
    ])->assertSessionHasErrors(['image']);

    expect(AdCreative::query()->count())->toBe(0);
});

it('stores logo, jingle and sponsored item creatives', function () {
    $campaign = AdCampaign::factory()->create();
    $item = CharacterItem::query()->firstOrFail();
    $url = "/admin/ads/campaigns/{$campaign->id}/creatives";
    $admin = adsAdmin();

    $this->actingAs($admin)->post($url, [
        'type' => 'logo', 'name' => 'Badge', 'size' => 'badge', 'placements' => ['arena.board', 'arena.sidebar'],
        'display_seconds' => 8, 'click_url' => 'https://brand.example', 'is_active' => true,
        'image' => fakePng('badge.png'),
    ])->assertSessionHasNoErrors();
    $this->actingAs($admin)->post($url, [
        'type' => 'jingle', 'name' => 'Win jingle', 'placements' => ['jingle.win'], 'display_seconds' => 8,
        'audio_seconds' => 5, 'is_active' => true, 'audio' => UploadedFile::fake()->create('win.mp3', 120, 'audio/mpeg'),
    ])->assertSessionHasNoErrors();
    $this->actingAs($admin)->post($url, [
        'type' => 'item', 'name' => 'Branded hat', 'placements' => ['shop.item'], 'display_seconds' => 8,
        'character_item_id' => $item->id, 'is_active' => true,
    ])->assertSessionHasNoErrors();

    expect(AdCreative::query()->pluck('type')->all())->toBe(['logo', 'jingle', 'item'])
        ->and($item->refresh()->advertiser_id)->toBe($campaign->advertiser_id);
    Storage::disk('public')->assertExists(AdCreative::query()->where('type', 'jingle')->value('audio_path'));
});

it('only activates campaigns that have an active creative', function () {
    $admin = adsAdmin();
    $campaign = AdCampaign::factory()->create(['status' => 'draft']);

    $this->actingAs($admin)->patch("/admin/ads/campaigns/{$campaign->id}/status", ['status' => 'active'])
        ->assertSessionHas('error');
    expect($campaign->refresh()->status)->toBe('draft');

    AdCreative::query()->create([
        'ad_campaign_id' => $campaign->id, 'type' => 'motto', 'name' => 'M', 'placements' => ['arena.header'],
        'motto' => 'Hi', 'display_seconds' => 8, 'is_active' => true,
    ]);
    $this->actingAs($admin)->patch("/admin/ads/campaigns/{$campaign->id}/status", ['status' => 'active'])
        ->assertSessionHas('success');
    expect($campaign->refresh()->status)->toBe('active');
});

it('serves live campaigns into every game page through the game middleware', function () {
    AdCampaign::factory()->withCreative()->create();
    $player = adsPlayer();

    foreach (['quiz-duel', 'sky-quiz', 'knowledge-train', 'crossword', 'snakes-and-ladders', 'market-math', 'flag-quest', 'port-sorter', 'turbo-trivia', 'block-battle'] as $game) {
        $this->actingAs($player)->get('/games/'.$game)->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('adGame', $game)
                ->where('ads', function ($ads) {
                    $header = collect($ads)->get('arena.header');

                    return $header['type'] === 'motto'
                        && $header['motto'] === 'Sarapan sehat, belajar semangat!'
                        && $header['has_link'] === true
                        && ! array_key_exists('click_url', $header)
                        && is_string($header['serve']);
                }));
    }
});

it('skips campaigns outside their flight, paused, untargeted or over cap', function () {
    $player = adsPlayer(grade: 9);

    AdCampaign::factory()->withCreative()->create(['status' => 'paused']);
    AdCampaign::factory()->withCreative()->create(['starts_on' => now()->addDay(), 'ends_on' => now()->addDays(5)]);
    AdCampaign::factory()->withCreative()->create(['starts_on' => now()->subDays(10), 'ends_on' => now()->subDay()]);
    AdCampaign::factory()->withCreative()->create(['target_games' => ['sky-quiz']]);
    AdCampaign::factory()->withCreative()->create(['grade_min' => 1, 'grade_max' => 6]);
    AdCampaign::factory()->withCreative()->create(['advertiser_id' => Advertiser::factory()->create(['is_active' => false])->id]);
    AdCampaign::factory()->withCreative(['is_active' => false])->create();
    $capped = AdCampaign::factory()->withCreative()->create(['max_impressions' => 5]);
    AdDailyStat::query()->create([
        'day' => now()->subDay()->toDateString(), 'ad_creative_id' => $capped->creatives()->value('id'),
        'ad_campaign_id' => $capped->id, 'placement' => 'arena.header', 'game_key' => 'quiz-duel', 'impressions' => 5,
    ]);
    $daily = AdCampaign::factory()->withCreative()->create(['daily_max_impressions' => 3]);
    AdDailyStat::query()->create([
        'day' => now()->toDateString(), 'ad_creative_id' => $daily->creatives()->value('id'),
        'ad_campaign_id' => $daily->id, 'placement' => 'arena.result', 'game_key' => 'sky-quiz', 'impressions' => 3,
    ]);

    expect(servedAds($player))->toBe([]);

    AdCampaign::factory()->withCreative()->create(['target_games' => ['quiz-duel'], 'grade_min' => 7, 'grade_max' => 9]);
    expect(servedAds($player))->toHaveKeys(['arena.header', 'arena.result']);
});

it('only fills placements with creatives of a fitting type and size', function () {
    $campaign = AdCampaign::factory()->create();
    AdCreative::query()->create([
        'ad_campaign_id' => $campaign->id, 'type' => 'logo', 'name' => 'Leaderboard', 'size' => 'leaderboard',
        'placements' => ['arena.header', 'arena.board'], 'image_path' => 'ads/images/aaaaaaaaaaaa.png', 'display_seconds' => 8, 'is_active' => true,
    ]);
    AdCreative::query()->create([
        'ad_campaign_id' => $campaign->id, 'type' => 'jingle', 'name' => 'Start', 'placements' => ['jingle.start'],
        'audio_path' => 'ads/audio/bbbbbbbbbbbb.mp3', 'audio_seconds' => 4, 'display_seconds' => 8, 'is_active' => true,
    ]);

    $ads = servedAds(adsPlayer());

    expect(array_keys($ads))->toEqualCanonicalizing(['arena.header', 'jingle.start'])
        ->and($ads['jingle.start']['audio_url'])->toBe('/ads/media/audio/bbbbbbbbbbbb.mp3')
        ->and($ads['jingle.start']['moment'])->toBe('start');
});

it('tracks impressions once per serve and rolls them up daily', function () {
    $campaign = AdCampaign::factory()->withCreative()->create();
    $player = adsPlayer();
    $serve = servedAds($player)['arena.header']['serve'];

    $this->actingAs($player)->postJson('/ads/track', ['serve' => $serve, 'type' => 'impression'])->assertOk();
    $this->actingAs($player)->postJson('/ads/track', ['serve' => $serve, 'type' => 'impression'])->assertOk();

    expect(AdEvent::query()->count())->toBe(1)
        ->and(AdDailyStat::query()->where('ad_campaign_id', $campaign->id)->sum('impressions'))->toBe(1)
        ->and(AdEvent::query()->value('game_key'))->toBe('quiz-duel');
});

it('rejects forged, foreign and expired serve tokens', function () {
    AdCampaign::factory()->withCreative()->create();
    $player = adsPlayer();
    $serve = servedAds($player)['arena.header']['serve'];
    [$payload] = explode('.', $serve);

    $this->actingAs($player)->postJson('/ads/track', ['serve' => $payload.'.'.str_repeat('0', 64), 'type' => 'impression'])->assertStatus(422);
    $this->actingAs(adsPlayer())->postJson('/ads/track', ['serve' => $serve, 'type' => 'impression'])->assertStatus(422);
    $this->actingAs($player)->postJson('/ads/track', ['serve' => $serve, 'type' => 'click'])->assertUnprocessable();

    $this->travel(config('ads.serve_ttl') + 60)->seconds();
    $this->actingAs($player)->postJson('/ads/track', ['serve' => $serve, 'type' => 'impression'])->assertStatus(422);

    expect(AdEvent::query()->count())->toBe(0);
});

it('records clicks and redirects to the https click url', function () {
    AdCampaign::factory()->withCreative()->create();
    $player = adsPlayer();
    $serve = servedAds($player)['arena.result']['serve'];

    $this->actingAs($player)->get('/ads/click?s='.urlencode($serve))->assertRedirect('https://example.com/promo');
    $this->actingAs($player)->get('/ads/click?s=forged')->assertNotFound();

    expect(AdEvent::query()->where('type', 'click')->count())->toBe(1);
});

it('shows sponsors on character shop items', function () {
    $campaign = AdCampaign::factory()->create();
    $item = CharacterItem::query()->firstOrFail();
    AdCreative::query()->create([
        'ad_campaign_id' => $campaign->id, 'type' => 'item', 'name' => 'Hat', 'placements' => ['shop.item'],
        'character_item_id' => $item->id, 'motto' => 'Topi juara', 'display_seconds' => 8, 'is_active' => true,
    ]);

    $this->actingAs(adsPlayer())->get('/character')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('items', fn ($items) => collect($items)->firstWhere('id', $item->id)['sponsor']['motto'] === 'Topi juara'
                && collect($items)->where('sponsor', '!=', null)->count() === 1));
});

it('streams stored ad media and rejects path traversal', function () {
    Storage::disk('public')->put('ads/images/abcdefghijkl.png', 'png-bytes');

    $this->get('/ads/media/images/abcdefghijkl.png')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
    $this->get('/ads/media/images/missing00000.png')->assertNotFound();
    $this->get('/ads/media/../../.env')->assertNotFound();
    $this->get('/ads/media/images/abcdefghijkl.php')->assertNotFound();
});

it('shows a campaign report with creatives and breakdowns', function () {
    $campaign = AdCampaign::factory()->withCreative()->create();
    AdDailyStat::query()->create([
        'day' => now()->toDateString(), 'ad_creative_id' => $campaign->creatives()->value('id'),
        'ad_campaign_id' => $campaign->id, 'placement' => 'arena.header', 'game_key' => 'sky-quiz', 'impressions' => 40, 'clicks' => 2,
    ]);

    $this->actingAs(adsAdmin())->get("/admin/ads/campaigns/{$campaign->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('admin/ads/campaign')
            ->where('campaign.stats.impressions', 40)
            ->where('campaign.stats.clicks', 2)
            ->has('creatives', 1)
            ->where('report.games.0.game', 'sky-quiz')
            ->where('report.placements.0.placement', 'arena.header'));
});

it('blocks deleting advertisers that still run campaigns', function () {
    $campaign = AdCampaign::factory()->create(['status' => 'active']);

    $this->actingAs(adsAdmin())->delete("/admin/ads/advertisers/{$campaign->advertiser_id}")->assertSessionHas('error');
    expect(Advertiser::query()->count())->toBe(1);
});

it('hides every ad when ads are disabled globally', function () {
    AdCampaign::factory()->withCreative()->create();
    $player = adsPlayer();
    expect(servedAds($player))->not->toBe([]);

    $this->actingAs(adsAdmin())->patch('/admin/ads/settings/global', ['enabled' => false])->assertSessionHas('success');

    expect(servedAds($player))->toBe([])
        ->and(app(AdServer::class)->sponsoredItems($player))->toBe([]);
    $this->actingAs($player)->get('/games/quiz-duel')->assertInertia(fn (Assert $page) => $page->where('ads', []));

    $this->actingAs(adsAdmin())->patch('/admin/ads/settings/global', ['enabled' => true]);
    expect(servedAds($player))->not->toBe([]);
});

it('hides ads for excluded users only', function () {
    AdCampaign::factory()->withCreative()->create();
    $excluded = adsPlayer();
    $other = adsPlayer();

    $this->actingAs(adsAdmin())->patch("/admin/ads/users/{$excluded->id}", ['ads_disabled' => true])->assertSessionHas('success');

    expect($excluded->refresh()->ads_disabled)->toBeTrue()
        ->and(servedAds($excluded))->toBe([])
        ->and(servedAds($other))->not->toBe([]);

    $this->actingAs(adsAdmin())->get('/admin/ads?tab=settings')->assertInertia(fn (Assert $page) => $page
        ->where('controls.excluded_count', 1)
        ->where('controls.excluded_users.0.id', $excluded->id));
});

it('restricts ad delivery controls to superadmins', function () {
    $player = adsPlayer();

    $this->actingAs($player)->patch('/admin/ads/settings/global', ['enabled' => false])->assertForbidden();
    $this->actingAs($player)->patch("/admin/ads/users/{$player->id}", ['ads_disabled' => true])->assertForbidden();
    $this->actingAs($player)->put('/admin/ads/settings/placements', ['placements' => []])->assertForbidden();
    $this->actingAs($player)->getJson('/admin/ads/settings/users?q=qa')->assertForbidden();

    expect($player->refresh()->ads_disabled)->toBeFalse();
});

it('serves a rotating placement with several creatives and a static one with one', function () {
    $campaign = AdCampaign::factory()->create();
    foreach (['Satu', 'Dua', 'Tiga'] as $motto) {
        AdCreative::query()->create([
            'ad_campaign_id' => $campaign->id, 'type' => 'motto', 'name' => $motto, 'motto' => $motto,
            'placements' => ['arena.header', 'arena.result'], 'display_seconds' => 8, 'is_active' => true,
        ]);
    }
    $rules = collect(AdPlacementSetting::resolved())->map(fn (array $r) => $r)->all();
    $rules['arena.header'] = ['is_enabled' => true, 'mode' => 'rotate', 'rotate_seconds' => 6, 'max_creatives' => 2];
    $rules['arena.loading']['is_enabled'] = false;

    $this->actingAs(adsAdmin())->put('/admin/ads/settings/placements', ['placements' => $rules])->assertSessionHas('success');

    $ads = servedAds(adsPlayer());

    expect($ads['arena.header']['mode'])->toBe('rotate')
        ->and($ads['arena.header']['rotate_seconds'])->toBe(6)
        ->and($ads['arena.header']['items'])->toHaveCount(2)
        ->and(collect($ads['arena.header']['items'])->pluck('serve')->unique())->toHaveCount(2)
        ->and($ads['arena.result']['mode'])->toBe('static')
        ->and($ads['arena.result'])->not->toHaveKey('items')
        ->and($ads)->not->toHaveKey('arena.loading');
});

it('validates placement rules and keeps jingles static', function () {
    $admin = adsAdmin();
    $rules = AdPlacementSetting::resolved();

    $bad = $rules;
    $bad['arena.header'] = ['is_enabled' => true, 'mode' => 'carousel', 'rotate_seconds' => 1, 'max_creatives' => 50];
    $this->actingAs($admin)->put('/admin/ads/settings/placements', ['placements' => $bad])
        ->assertSessionHasErrors(['placements.arena.header.mode', 'placements.arena.header.rotate_seconds', 'placements.arena.header.max_creatives']);

    $rules['jingle.win']['mode'] = 'rotate';
    $this->actingAs($admin)->put('/admin/ads/settings/placements', ['placements' => $rules])->assertSessionHas('success');
    expect(AdPlacementSetting::resolved()['jingle.win']['mode'])->toBe('static');
});

it('reports reach, frequency, CTR, devices, grades and hours', function () {
    $campaign = AdCampaign::factory()->withCreative()->create();
    $viewers = [adsPlayer(grade: 3), adsPlayer(grade: 3), adsPlayer(grade: 8)];
    $agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';

    foreach ($viewers as $i => $viewer) {
        $ads = app(AdServer::class)->forGame('sky-quiz', $viewer, 'mobile');
        $this->actingAs($viewer)->withHeader('User-Agent', $agent)->postJson('/ads/track', ['serve' => $ads['arena.header']['serve'], 'type' => 'impression'])->assertOk();
        $this->actingAs($viewer)->postJson('/ads/track', ['serve' => $ads['arena.result']['serve'], 'type' => 'impression'])->assertOk();
        if ($i === 0) {
            $this->actingAs($viewer)->get('/ads/click?s='.urlencode($ads['arena.result']['serve']))->assertRedirect();
        }
    }

    $this->actingAs(adsAdmin())->get("/admin/ads/campaigns/{$campaign->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('report.audience.reach', 3)
            ->where('report.audience.frequency', 2)
            ->where('report.audience.unique_clickers', 1)
            ->where('report.devices.0.device', 'mobile')
            ->where('report.devices.0.impressions', 6)
            ->where('report.grades.0.grade', '3')
            ->where('report.grades.0.impressions', 4)
            ->where('report.grades.0.clicks', 1)
            ->where('report.placements', fn ($rows) => collect($rows)->firstWhere('placement', 'arena.result')['ctr'] === 33.33)
            ->where('report.frequency_buckets.1.users', 3)
            ->has('report.hours', 24)
            ->where('report.hours', fn ($hours) => collect($hours)->sum('impressions') === 6));
});

it('sends the device from the game page into tracking', function () {
    AdCampaign::factory()->withCreative()->create();
    $player = adsPlayer();

    $page = $this->actingAs($player)->withHeader('User-Agent', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')
        ->get('/games/quiz-duel');
    $serve = $page->viewData('page')['props']['ads']['arena.header']['serve'];
    $this->actingAs($player)->postJson('/ads/track', ['serve' => $serve, 'type' => 'impression'])->assertOk();

    expect(AdEvent::query()->value('device'))->toBe('mobile')
        ->and(AdEvent::query()->value('grade'))->toBe(4);
});
