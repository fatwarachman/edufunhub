<?php

/**
 * Production runs behind Cloudflare Tunnel and an nginx gateway; redirects must
 * keep the public https scheme and host forwarded by the proxy.
 */
it('uses the forwarded https scheme for redirects behind the gateway', function (): void {
    $this->withServerVariables(['REMOTE_ADDR' => '172.18.0.5'])
        ->withHeaders([
            'X-Forwarded-Proto' => 'https',
            'X-Forwarded-Host' => 'edufunhub.com',
            'X-Forwarded-Port' => '443',
        ])
        ->get('/portal')
        ->assertRedirect('https://edufunhub.com/login');
});

it('ignores forwarded headers from untrusted public addresses', function (): void {
    $response = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])
        ->withHeaders(['X-Forwarded-Proto' => 'https', 'X-Forwarded-Host' => 'evil.example'])
        ->get('/portal');

    expect($response->headers->get('Location'))->not->toContain('evil.example');
});
