<?php

namespace App\Services;

/**
 * Classifies a request's device from its User-Agent, preferring the
 * User-Agent Client Hints (Sec-CH-UA-Mobile / Sec-CH-UA-Platform) when the
 * browser sends them. iPadOS Safari reports itself as macOS desktop, so it is
 * counted as desktop; no server-side signal distinguishes it.
 */
class DeviceDetector
{
    public const TYPES = ['mobile', 'tablet', 'desktop'];

    private const BOT_PATTERN = '/bot|crawl|spider|slurp|facebookexternalhit|curl|wget|python-requests|go-http-client|httpclient|uptime|monitor/i';

    private const PLATFORM_HINTS = [
        'android' => 'Android',
        'ios' => 'iOS',
        'windows' => 'Windows',
        'macos' => 'macOS',
        'linux' => 'Linux',
        'chrome os' => 'ChromeOS',
        'chromeos' => 'ChromeOS',
    ];

    public function isBot(?string $userAgent): bool
    {
        $userAgent = trim((string) $userAgent);

        return $userAgent === '' || preg_match(self::BOT_PATTERN, $userAgent) === 1;
    }

    /**
     * @return array{device_type: string, os: string, browser: string}
     */
    public function detect(?string $userAgent, ?string $mobileHint = null, ?string $platformHint = null): array
    {
        $ua = (string) $userAgent;
        $os = $this->platformFromHint($platformHint) ?? $this->os($ua);

        return [
            'device_type' => $this->deviceType($ua, $mobileHint, $os),
            'os' => $os,
            'browser' => $this->browser($ua),
        ];
    }

    private function deviceType(string $ua, ?string $mobileHint, string $os): string
    {
        if (preg_match('/iPad|Tablet|Kindle|Silk|PlayBook|Nexus (7|9|10)/i', $ua) === 1
            || ($os === 'Android' && stripos($ua, 'Mobile') === false && $mobileHint !== '?1')) {
            return 'tablet';
        }

        if ($mobileHint === '?1' || preg_match('/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini|BlackBerry|IEMobile/i', $ua) === 1) {
            return 'mobile';
        }

        return 'desktop';
    }

    private function os(string $ua): string
    {
        return match (true) {
            str_contains($ua, 'Windows Phone') => 'Windows Phone',
            str_contains($ua, 'Android') => 'Android',
            preg_match('/iPhone|iPad|iPod/', $ua) === 1 => 'iOS',
            str_contains($ua, 'CrOS') => 'ChromeOS',
            str_contains($ua, 'Macintosh') || str_contains($ua, 'Mac OS X') => 'macOS',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Linux') || str_contains($ua, 'X11') => 'Linux',
            default => 'Other',
        };
    }

    private function browser(string $ua): string
    {
        return match (true) {
            str_contains($ua, 'Edg') => 'Edge',
            str_contains($ua, 'OPR/') || str_contains($ua, 'Opera') => 'Opera',
            str_contains($ua, 'SamsungBrowser') => 'Samsung Internet',
            str_contains($ua, 'Firefox') || str_contains($ua, 'FxiOS') => 'Firefox',
            str_contains($ua, 'Chrome') || str_contains($ua, 'CriOS') => 'Chrome',
            str_contains($ua, 'Safari') => 'Safari',
            default => 'Other',
        };
    }

    private function platformFromHint(?string $platformHint): ?string
    {
        $platform = strtolower(trim((string) $platformHint, " \t\""));

        return self::PLATFORM_HINTS[$platform] ?? null;
    }
}
