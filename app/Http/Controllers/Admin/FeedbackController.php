<?php

namespace App\Http\Controllers\Admin;

use App\Enums\FeedbackStatus;
use App\Enums\FeedbackType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateFeedbackStatusRequest;
use App\Models\Feedback;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Review player feedback: filter by type/status/text and move entries
 * through new → in progress → resolved / dismissed.
 */
class FeedbackController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = array_filter([
            'type' => is_string($request->query('type')) ? $request->query('type') : null,
            'status' => is_string($request->query('status')) ? $request->query('status') : null,
            'search' => is_string($request->query('search')) ? trim($request->query('search')) : null,
        ], fn (?string $value): bool => $value !== null && $value !== '');

        $types = [...FeedbackType::values(), 'experience'];

        $feedback = Feedback::query()
            ->with('user:id,name,email')
            ->when(in_array($filters['type'] ?? null, $types, true), fn (Builder $q) => $q->where('type', $filters['type']))
            ->when(in_array($filters['status'] ?? null, FeedbackStatus::values(), true), fn (Builder $q) => $q->where('status', $filters['status']))
            ->when($filters['search'] ?? null, function (Builder $q, string $search): void {
                $like = '%'.addcslashes(mb_substr($search, 0, 100), '%_\\').'%';
                $q->where(fn (Builder $q) => $q
                    ->where('message', 'like', $like)
                    ->orWhereHas('user', fn (Builder $u) => $u->where('name', 'like', $like)->orWhere('email', 'like', $like)));
            })
            ->latest('id')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Feedback $item): array => [
                'id' => $item->id,
                'type' => $item->type,
                'status' => $item->status,
                'message' => (string) $item->message,
                'page_url' => $item->page_url,
                'user_agent' => $item->user_agent,
                'game' => $item->metadata['game'] ?? null,
                'may_contact' => (bool) ($item->metadata['may_contact'] ?? false),
                'rating' => $item->metadata['rating'] ?? null,
                'user' => $item->user ? ['id' => $item->user->id, 'name' => $item->user->name, 'email' => $item->user->email] : null,
                'created_at' => $item->created_at?->toIso8601String(),
                'updated_at' => $item->updated_at?->toIso8601String(),
            ]);

        $counts = Feedback::query()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->map(fn (mixed $total): int => (int) $total);

        return Inertia::render('admin/feedback/index', [
            'feedback' => $feedback,
            'filters' => (object) $filters,
            'types' => $types,
            'statuses' => FeedbackStatus::values(),
            'counts' => [
                'total' => (int) $counts->sum(),
                ...collect(FeedbackStatus::values())->mapWithKeys(fn (string $status): array => [$status => $counts->get($status, 0)])->all(),
            ],
        ]);
    }

    public function update(UpdateFeedbackStatusRequest $request, Feedback $feedback): RedirectResponse
    {
        $feedback->update(['status' => $request->validated('status')]);

        return back()->with('success', __('feedback.flash.updated'));
    }
}
