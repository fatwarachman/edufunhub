<?php

namespace App\Services;

use Illuminate\Http\Request;

/**
 * Remembers the game page (shared room link, PIN join) a player wanted to
 * open before signing in or completing their details, so they land back in
 * that room afterwards. Only relative game paths on this site are accepted,
 * which keeps the return URL from becoming an open redirect.
 */
class GameReturnUrl
{
    public const SESSION_KEY = 'game_return_url';

    private const PATTERN = '#^/(games/[a-z-]+(/join/[0-9]{6})?|arena/[a-z-]+(/[0-9]{6})?|play/[a-z-]+(/[0-9]{6})?|join/[0-9]{6})/?$#';

    /** Store the current request when it is a game page. */
    public function remember(Request $request): void
    {
        $path = $this->safePath($request->getRequestUri());

        if ($path !== null && $request->isMethod('GET') && $request->hasSession()) {
            $request->session()->put(self::SESSION_KEY, $path);
        }
    }

    /** Take (and forget) the stored game path, or a safe game path from a full intended URL. */
    public function pull(Request $request, ?string $intended = null): ?string
    {
        $stored = $request->hasSession() ? $request->session()->pull(self::SESSION_KEY) : null;

        return $this->safePath(is_string($stored) ? $stored : null) ?? $this->safePath($intended);
    }

    /**
     * Relative game path with an optional `pin` query, or null. Absolute
     * URLs are accepted only for this app's own host.
     */
    public function safePath(?string $url): ?string
    {
        if ($url === null || $url === '' || strlen($url) > 200) {
            return null;
        }

        $parts = parse_url($url);
        if ($parts === false) {
            return null;
        }

        if (isset($parts['scheme']) || isset($parts['host'])) {
            $appHost = parse_url((string) request()->getSchemeAndHttpHost(), PHP_URL_HOST);
            if (! in_array($parts['scheme'] ?? '', ['http', 'https'], true) || ($parts['host'] ?? null) !== $appHost) {
                return null;
            }
        }

        $path = $parts['path'] ?? '';
        if (! str_starts_with($path, '/') || str_starts_with($path, '//') || ! preg_match(self::PATTERN, $path)) {
            return null;
        }

        parse_str($parts['query'] ?? '', $query);
        $pin = $query['pin'] ?? null;

        return is_string($pin) && preg_match('/^[0-9]{6}$/', $pin) ? $path.'?pin='.$pin : $path;
    }
}
