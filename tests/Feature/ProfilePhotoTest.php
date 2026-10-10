<?php

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    Storage::fake('public');
});

/** A real PNG of the given size without the GD extension (solid colour, stored rows). */
function profilePhotoPng(string $name, int $width, int $height): UploadedFile
{
    $chunk = fn (string $type, string $data): string => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
    $row = "\0".str_repeat("\xff\x99\x33", $width);
    $png = "\x89PNG\r\n\x1a\n"
        .$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0))
        .$chunk('IDAT', gzcompress(str_repeat($row, $height)))
        .$chunk('IEND', '');

    return UploadedFile::fake()->createWithContent($name, $png);
}

it('uploads a profile photo that the admin user page shows', function () {
    $player = User::factory()->create(['locale' => 'id']);

    $this->actingAs($player)
        ->post('/profile/photo', ['photo' => profilePhotoPng('me.png', 300, 300)])
        ->assertRedirect()
        ->assertSessionHas('success', 'Foto profil tersimpan.');

    $stored = $player->fresh()->getRawOriginal('avatar_url');
    expect($stored)->toMatch('#^avatars/[A-Za-z0-9]{40}\.png$#');
    Storage::disk('public')->assertExists($stored);

    $url = '/profile/photo/'.basename($stored);
    expect($player->fresh()->avatar_url)->toBe($url);

    $this->actingAs($player)->get('/profile')
        ->assertInertia(fn (Assert $page) => $page->where('account.avatar_url', $url));

    $admin = User::factory()->create(['is_superadmin' => true]);
    $this->actingAs($admin)->get("/admin/users/{$player->id}")
        ->assertInertia(fn (Assert $page) => $page->where('user.avatar_url', $url));

    expect($player->fresh()->toArray()['avatar_url'])->toBe($url);
    $this->actingAs($admin)->get('/admin/users?search='.urlencode($player->email))
        ->assertInertia(fn (Assert $page) => $page->where('users.data.0.avatar_url', $url));

    $this->actingAs($admin)->get($url)
        ->assertOk()
        ->assertHeader('X-Content-Type-Options', 'nosniff');
});

it('replaces the old photo file when a new one is uploaded', function () {
    $player = User::factory()->create();
    $this->actingAs($player)->post('/profile/photo', ['photo' => profilePhotoPng('a.png', 200, 200)]);
    $first = $player->fresh()->getRawOriginal('avatar_url');

    $this->actingAs($player)->post('/profile/photo', ['photo' => profilePhotoPng('b.png', 200, 200)]);
    $second = $player->fresh()->getRawOriginal('avatar_url');

    expect($second)->not->toBe($first);
    Storage::disk('public')->assertMissing($first);
    Storage::disk('public')->assertExists($second);
});

it('removes the profile photo', function () {
    $player = User::factory()->create();
    $this->actingAs($player)->post('/profile/photo', ['photo' => profilePhotoPng('a.png', 200, 200)]);
    $path = $player->fresh()->getRawOriginal('avatar_url');

    $this->actingAs($player)->delete('/profile/photo')->assertRedirect();

    expect($player->fresh()->avatar_url)->toBeNull();
    Storage::disk('public')->assertMissing($path);
});

it('rejects files that are not small raster images', function (UploadedFile $file) {
    $player = User::factory()->create(['locale' => 'en']);

    $this->actingAs($player)
        ->post('/profile/photo', ['photo' => $file])
        ->assertSessionHasErrors('photo');

    expect($player->fresh()->avatar_url)->toBeNull();
})->with([
    'svg' => fn () => UploadedFile::fake()->createWithContent('x.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    'pdf' => fn () => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf'),
    'too big' => fn () => UploadedFile::fake()->create('big.png', 3000, 'image/png'),
    'too small' => fn () => profilePhotoPng('tiny.png', 20, 20),
]);

it('requires sign-in for photos', function () {
    $this->post('/profile/photo')->assertRedirect();
    $this->get('/profile/photo/'.str_repeat('a', 40).'.jpg')->assertRedirect();
});

it('does not serve paths outside the avatar folder', function () {
    $player = User::factory()->create();

    $this->actingAs($player)->get('/profile/photo/..%2F.env')->assertNotFound();
    $this->actingAs($player)->get('/profile/photo/'.str_repeat('a', 40).'.jpg')->assertNotFound();
});
