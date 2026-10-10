<?php

namespace App\Services\WhatsApp;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * REST client for GOWA (go-whatsapp-web-multidevice v9) in its own container.
 * All calls are scoped to one device slot (`X-Device-Id`). The QR image is
 * fetched server-side and returned as a data URI, so the browser never talks
 * to the container.
 */
class GowaClient
{
    public function configured(): bool
    {
        return trim((string) config('whatsapp.base_url')) !== '';
    }

    /** Create the device slot when the server does not know it yet. */
    public function ensureDevice(): void
    {
        $devices = (array) ($this->call(fn (PendingRequest $http): Response => $http->get('/devices'))['results'] ?? []);

        if (collect($devices)->contains(fn (mixed $device): bool => is_array($device) && ($device['id'] ?? null) === $this->deviceId())) {
            return;
        }

        $this->call(fn (PendingRequest $http): Response => $http->post('/devices', ['device_id' => $this->deviceId()]));
    }

    /**
     * @return array{connected: bool, logged_in: bool, jid: ?string}
     */
    public function status(): array
    {
        $this->ensureDevice();
        $results = (array) ($this->call(fn (PendingRequest $http): Response => $http->get('/app/status'))['results'] ?? []);
        $jid = (string) ($results['jid'] ?? '');

        return [
            'connected' => (bool) ($results['is_connected'] ?? false),
            'logged_in' => (bool) ($results['is_logged_in'] ?? false),
            'jid' => $jid !== '' ? $jid : null,
        ];
    }

    /**
     * Start a QR login.
     *
     * @return array{qr: string, duration: int}
     */
    public function loginQr(): array
    {
        $this->ensureDevice();
        $results = (array) ($this->call(fn (PendingRequest $http): Response => $http->get('/app/login'))['results'] ?? []);
        $link = (string) ($results['qr_link'] ?? '');
        $path = parse_url($link, PHP_URL_PATH);

        if (! is_string($path) || ! str_starts_with($path, '/statics/')) {
            throw new RuntimeException(__('whatsapp.errors.no_qr'));
        }

        $image = $this->request()->get($path);
        if (! $image->successful() || ! str_starts_with((string) $image->header('Content-Type'), 'image/')) {
            throw new RuntimeException(__('whatsapp.errors.no_qr'));
        }

        return [
            'qr' => 'data:image/png;base64,'.base64_encode($image->body()),
            'duration' => max(10, (int) ($results['qr_duration'] ?? 30)),
        ];
    }

    /** Pairing code login (enter the code on the phone instead of scanning). */
    public function loginCode(string $phone): string
    {
        $this->ensureDevice();
        $results = (array) ($this->call(fn (PendingRequest $http): Response => $http->get('/app/login-with-code', ['phone' => $phone]))['results'] ?? []);
        $code = (string) ($results['pair_code'] ?? '');

        if ($code === '') {
            throw new RuntimeException(__('whatsapp.errors.no_code'));
        }

        return $code;
    }

    public function logout(): void
    {
        $this->call(fn (PendingRequest $http): Response => $http->get('/app/logout'));
    }

    public function reconnect(): void
    {
        $this->call(fn (PendingRequest $http): Response => $http->get('/app/reconnect'));
    }

    /** @return ?string provider message id */
    public function sendText(string $phone, string $message): ?string
    {
        $results = (array) ($this->call(fn (PendingRequest $http): Response => $http->post('/send/message', [
            'phone' => PhoneNumber::jid($phone),
            'message' => $message,
        ]))['results'] ?? []);

        $id = (string) ($results['message_id'] ?? '');

        return $id !== '' ? $id : null;
    }

    public function deviceId(): string
    {
        return (string) config('whatsapp.device_id');
    }

    /**
     * @param  callable(PendingRequest): Response  $send
     * @return array<string, mixed>
     *
     * @throws RuntimeException
     */
    private function call(callable $send): array
    {
        if (! $this->configured()) {
            throw new RuntimeException(__('whatsapp.errors.not_configured'));
        }

        try {
            $response = $send($this->request());
        } catch (ConnectionException) {
            throw new RuntimeException(__('whatsapp.errors.unreachable'));
        }

        $body = (array) $response->json();
        $code = (string) ($body['code'] ?? $response->status());

        if ($code === 'AUTHENTICATION_ERROR') {
            throw new RuntimeException(__('whatsapp.errors.not_logged_in'));
        }
        if ($response->status() === 401) {
            throw new RuntimeException(__('whatsapp.errors.unauthorized'));
        }
        if (! $response->successful() || ($body['code'] ?? 'SUCCESS') !== 'SUCCESS') {
            $message = trim((string) ($body['message'] ?? ''));

            throw new RuntimeException(__('whatsapp.errors.gateway', ['message' => $message !== '' ? mb_substr($message, 0, 200) : $code]));
        }

        return $body;
    }

    private function request(): PendingRequest
    {
        $http = Http::baseUrl(rtrim((string) config('whatsapp.base_url'), '/'))
            ->timeout((float) config('whatsapp.timeout'))
            ->acceptJson()
            ->withHeaders(['X-Device-Id' => $this->deviceId()]);

        $user = (string) config('whatsapp.username');

        return $user !== '' ? $http->withBasicAuth($user, (string) config('whatsapp.password')) : $http;
    }
}
