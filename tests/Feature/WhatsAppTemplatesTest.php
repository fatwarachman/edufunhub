<?php

use App\Jobs\SendWhatsAppMessage;
use App\Models\User;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\WhatsAppNotifier;
use App\Services\WhatsApp\WhatsAppSettings;
use App\Services\WhatsApp\WhatsAppTemplates;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config([
        'scout.driver' => 'null',
        'whatsapp.base_url' => 'http://gowa.test',
        'whatsapp.username' => 'efh',
        'whatsapp.password' => 'secret',
        'whatsapp.device_id' => 'edufunhub',
    ]);
    Http::preventStrayRequests();
    Http::fake(['gowa.test/*' => Http::response(['code' => 'SUCCESS', 'results' => ['is_connected' => true, 'is_logged_in' => true, 'jid' => '6281111222333:1@s.whatsapp.net']])]);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create(['locale' => 'id']);
});

function templatePlayer(string $locale = 'id', string $nickname = 'Ana', string $number = '6281234567890'): User
{
    $user = User::factory()->create(['name' => $nickname.' Lestari', 'locale' => $locale, 'whatsapp_number' => $number]);
    $user->playerProfile()->create(['grade' => 5, 'nickname' => $nickname, 'birth_date' => '2015-03-01', 'school_name' => 'SD Ceria']);

    return $user->fresh();
}

test('only super admins can edit templates', function (): void {
    $payload = ['templates' => ['id' => 'Halo :name', 'en' => 'Hi :name']];

    $this->put('/admin/whatsapp/templates/welcome', $payload)->assertRedirect('/login');
    $this->actingAs(User::factory()->create())->put('/admin/whatsapp/templates/welcome', $payload)->assertForbidden();
    $this->actingAs(User::factory()->create())->delete('/admin/whatsapp/templates/welcome')->assertForbidden();
});

test('the settings page lists editable templates with their defaults', function (): void {
    $this->actingAs($this->admin)->get('/admin/whatsapp')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('admin/whatsapp')
        ->has('templates', 4)
        ->where('templates.welcome.placeholders', ['name', 'app', 'url'])
        ->where('templates.welcome.templates.id.custom', false)
        ->where('templates.welcome.templates.id.text', __('whatsapp.events.welcome', [], 'id'))
        ->where('templates.friend_request.templates.en.default', __('whatsapp.events.friend_request', [], 'en'))
        ->missing('templates.ability_analysis')
        ->where('templateMaxLength', 2000));
});

test('a saved template is used for the player language and logged', function (): void {
    Queue::fake();
    app(WhatsAppSettings::class)->save(true, ['welcome' => true, 'ability_analysis' => true, 'friend_request' => true, 'teacher_request' => true]);

    $this->actingAs($this->admin)->put('/admin/whatsapp/templates/friend_request', ['templates' => [
        'id' => "Hai *:name*!\n:from mau jadi temanmu: :link",
        'en' => 'Hey :name, :from on :app wants to be friends: :link',
    ]])->assertSessionHasNoErrors()->assertSessionHas('success', __('whatsapp.flash.template_saved'));

    $notifier = app(WhatsAppNotifier::class);
    $id = $notifier->notify(templatePlayer('id'), 'friend_request', ['from' => 'Budi', 'link' => 'https://efh.test/friends']);

    expect($id->body)->toBe("Hai *Ana*!\nBudi mau jadi temanmu: https://efh.test/friends");

    $english = templatePlayer('en', 'Cara', '6281299990000');
    $en = $notifier->notify($english, 'friend_request', ['from' => 'Budi', 'link' => 'https://efh.test/friends']);

    expect($en->body)->toBe('Hey Cara, Budi on '.config('app.name').' wants to be friends: https://efh.test/friends');
    $this->assertDatabaseHas('activity_log', ['description' => 'Updated WhatsApp message template']);

    $this->actingAs($this->admin)->get('/admin/whatsapp')->assertInertia(fn (Assert $page) => $page
        ->where('templates.friend_request.templates.id.custom', true)
        ->where('templates.friend_request.templates.en.custom', true)
        ->where('templates.welcome.templates.id.custom', false));
});

test('a text equal to the default keeps only the other language custom', function (): void {
    $templates = app(WhatsAppTemplates::class);

    $this->actingAs($this->admin)->put('/admin/whatsapp/templates/welcome', ['templates' => [
        'id' => $templates->default('welcome', 'id'),
        'en' => 'Welcome :name to :app',
    ]])->assertSessionHasNoErrors();

    $admin = $templates->forAdmin();
    expect($admin['welcome']['templates']['id']['custom'])->toBeFalse()
        ->and($admin['welcome']['templates']['en']['custom'])->toBeTrue()
        ->and($templates->render('welcome', 'en', ['name' => 'Ana', 'app' => 'EFH']))->toBe('Welcome Ana to EFH');
});

test('reset brings back the default text', function (): void {
    $templates = app(WhatsAppTemplates::class);
    $templates->save('welcome', ['id' => 'Halo :name', 'en' => 'Hi :name']);

    $this->actingAs($this->admin)->delete('/admin/whatsapp/templates/welcome')
        ->assertSessionHas('success', __('whatsapp.flash.template_reset'));

    expect($templates->template('welcome', 'id'))->toBe($templates->default('welcome', 'id'));
    $this->assertDatabaseHas('activity_log', ['description' => 'Reset WhatsApp message template']);
});

test('the test message uses the custom template', function (): void {
    Queue::fake();
    app(WhatsAppTemplates::class)->save('test', ['id' => 'Uji koneksi :app OK', 'en' => 'Connection test :app OK']);

    $this->actingAs($this->admin)->post('/admin/whatsapp/test', ['phone' => '081234567890'])->assertSessionHasNoErrors();

    expect(WhatsAppMessage::query()->where('event', WhatsAppMessage::TEST_EVENT)->value('body'))->toBe('Uji koneksi '.config('app.name').' OK');
    Queue::assertPushed(SendWhatsAppMessage::class, 1);
});

test('templates are validated', function (array $templates, array $errors): void {
    $this->actingAs($this->admin)->put('/admin/whatsapp/templates/welcome', ['templates' => $templates])
        ->assertSessionHasErrors($errors);

    expect(app(WhatsAppTemplates::class)->forAdmin()['welcome']['templates']['id']['custom'])->toBeFalse();
})->with([
    'missing language' => [['id' => 'Halo :name'], ['templates.en']],
    'empty text' => [['id' => '   ', 'en' => 'Hi'], ['templates.id']],
    'unknown placeholder' => [['id' => 'Halo :name dari :from', 'en' => 'Hi :name'], ['templates.id']],
    'too long' => [['id' => str_repeat('a', 2001), 'en' => 'Hi'], ['templates.id']],
]);

test('unknown or generated events cannot be edited', function (string $event): void {
    $this->actingAs($this->admin)->put("/admin/whatsapp/templates/{$event}", ['templates' => ['id' => 'x', 'en' => 'x']])->assertNotFound();
    $this->actingAs($this->admin)->delete("/admin/whatsapp/templates/{$event}")->assertNotFound();
})->with(['ability_analysis', 'nope']);

test('placeholder values are not replaced twice and longest keys win', function (): void {
    $templates = app(WhatsAppTemplates::class);
    $templates->save('teacher_request', ['id' => ':name / :note / :from', 'en' => ':name']);

    expect($templates->render('teacher_request', 'id', ['name' => 'Ana', 'note' => 'pakai :from', 'from' => 'Budi']))
        ->toBe('Ana / pakai :from / Budi');
});
