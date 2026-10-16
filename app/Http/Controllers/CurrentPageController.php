<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CurrentPageController extends Controller
{
    /**
     * Store authenticated user's current page without creating activity noise.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'path' => ['required', 'string', 'starts_with:/', 'max:2048'],
            'label' => ['required', 'string', 'max:160'],
        ]);

        $validated['path'] = $this->sanitizePath($validated['path']);
        $validated['label'] = trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $validated['label']));

        $user = $request->user();
        $now = now();

        if ($user->current_page_path !== $validated['path'] || $user->current_page_label !== $validated['label']) {
            $user->forceFill([
                'current_page_path' => $validated['path'],
                'current_page_label' => $validated['label'],
                'last_seen_at' => $now,
            ])->saveQuietly();
        } else {
            $user->forceFill(['last_seen_at' => $now])->saveQuietly();
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Keeps the path and safe query parameters, dropping anything that looks like a secret.
     */
    private function sanitizePath(string $path): string
    {
        $parts = parse_url($path);
        $clean = '/'.ltrim((string) ($parts['path'] ?? '/'), '/');

        parse_str((string) ($parts['query'] ?? ''), $query);
        $query = array_filter(
            $query,
            fn (mixed $value, int|string $name): bool => preg_match('/token|signature|expires|code|password|secret|key/i', (string) $name) !== 1,
            ARRAY_FILTER_USE_BOTH,
        );

        return mb_substr($query === [] ? $clean : $clean.'?'.http_build_query($query), 0, 2048);
    }
}
