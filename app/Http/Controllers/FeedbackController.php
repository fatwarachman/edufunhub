<?php

namespace App\Http\Controllers;

use App\Enums\FeedbackType;
use App\Http\Requests\StoreFeedbackRequest;
use App\Models\Feedback;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Player feedback page: send a report (bug, idea, wrong question …) and
 * follow the review status of earlier reports. Players only ever see their
 * own entries.
 */
class FeedbackController extends Controller
{
    public function index(Request $request): Response
    {
        $history = $request->user()->feedback()
            ->latest('id')
            ->limit(20)
            ->get(['id', 'type', 'status', 'message', 'metadata', 'created_at', 'updated_at'])
            ->map(fn (Feedback $feedback): array => [
                'id' => $feedback->id,
                'type' => $feedback->type,
                'status' => $feedback->status,
                'message' => Str::limit((string) $feedback->message, 280),
                'game' => $feedback->metadata['game'] ?? null,
                'created_at' => $feedback->created_at?->toIso8601String(),
                'updated_at' => $feedback->updated_at?->toIso8601String(),
            ]);

        return Inertia::render('feedback/index', [
            'types' => FeedbackType::values(),
            'games' => $this->games(),
            'referrer' => $this->referrer($request),
            'history' => $history,
        ]);
    }

    public function store(StoreFeedbackRequest $request): RedirectResponse
    {
        $request->user()->feedback()->create([
            'type' => $request->validated('type'),
            'message' => $request->validated('message'),
            'status' => 'new',
            'page_url' => $request->validated('page_url'),
            'user_agent' => Str::limit((string) $request->userAgent(), 250, ''),
            'metadata' => [
                'game' => $request->validated('game'),
                'may_contact' => (bool) $request->validated('may_contact'),
            ],
        ]);

        return to_route('feedback.index')->with('success', __('feedback.flash.sent'));
    }

    /**
     * Catalog games for the optional "related game" select.
     *
     * @return list<array{key: string, titleKey: string}>
     */
    private function games(): array
    {
        return collect((array) config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => $category['games'] ?? [])
            ->map(fn (array $game): array => ['key' => $game['key'], 'titleKey' => $game['titleKey']])
            ->unique('key')
            ->values()
            ->all();
    }

    /**
     * Same-site page the player came from, used to prefill the page field.
     */
    private function referrer(Request $request): ?string
    {
        $referer = $request->headers->get('referer');

        if (! is_string($referer) || $referer === '') {
            return null;
        }

        $parts = parse_url($referer);

        if (! is_array($parts) || ($parts['host'] ?? null) !== $request->getHost()) {
            return null;
        }

        $path = ($parts['path'] ?? '/').(isset($parts['query']) ? '?'.$parts['query'] : '');

        if ($path === '/feedback' || str_starts_with($path, '/feedback?') || str_starts_with($path, '/feedback/')) {
            return null;
        }

        return Str::limit($path, 255, '');
    }
}
