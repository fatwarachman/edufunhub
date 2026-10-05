<?php

namespace App\Http\Controllers;

use App\Services\Ads\AdServer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Public ad endpoints used by game pages: media files, event tracking and
 * click-through redirects. Every call carries the signed serve token issued
 * when the page was rendered.
 */
class AdController extends Controller
{
    public function __construct(private AdServer $server) {}

    public function media(string $path): StreamedResponse
    {
        $full = 'ads/'.$path;
        abort_unless(Storage::disk('public')->exists($full), 404);

        return Storage::disk('public')->response($full, null, [
            'Cache-Control' => 'public, max-age=604800',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        ]);
    }

    public function track(Request $request): JsonResponse
    {
        $data = $request->validate([
            'serve' => ['required', 'string', 'max:600'],
            'type' => ['required', 'in:impression,play'],
        ]);

        $ok = $this->server->track($data['serve'], $data['type'], $request->user());

        return response()->json(['ok' => $ok], $ok ? 200 : 422);
    }

    public function click(Request $request): RedirectResponse
    {
        $serve = (string) $request->query('s', '');
        $url = $this->server->clickUrl($serve);
        abort_if($url === null, 404);
        $this->server->track($serve, 'click', $request->user());

        return redirect()->away($url);
    }
}
