<?php

/**
 * @return array{0: string, 1: string}
 */
function landingHeaderAndFooter(string $file): array
{
    $html = file_get_contents(public_path('new-landing/'.$file));
    $header = substr($html, strpos($html, '<header'), strpos($html, '</header>') - strpos($html, '<header'));
    $footer = substr($html, strpos($html, '<footer'), strpos($html, '</footer>') - strpos($html, '<footer'));

    return [$header, $footer];
}

it('serves the about page with the owner message', function (): void {
    $response = $this->get('/about');

    $response->assertOk();

    $html = file_get_contents(public_path('new-landing/about.html'));

    expect($html)->toContain('<title>Tentang EduFunHub')
        ->and($html)->toContain('Aplikasi ini aku buat sebagai hadiah dan rasa sayang untuk anak anakku, dan semua anak agar bisa bermain sambil belajar dan screentime nya lebih bermanfaat. Terimakasih juga untuk istriku tercinta atas segala doa dan dukungannya')
        ->and($html)->toContain('href="/register" class="btn btn-primary"');
});

it('names the about route', function (): void {
    expect(route('about', absolute: false))->toBe('/about');
});

it('drops the sign in button from the landing headers and links the about page in the footer', function (string $file): void {
    [$header, $footer] = landingHeaderAndFooter($file);

    expect($header)->not->toContain('href="/login"')
        ->and($header)->not->toContain('>Masuk<')
        ->and($header)->toContain('href="/register" class="btn btn-primary">Mulai Main</a>')
        ->and($footer)->toContain('href="/about"')
        ->and($footer)->toContain('Tentang EduFunHub');
})->with(['index.html', 'games.html', 'about.html']);
