<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ActivityLogPresenter;
use App\Services\UserActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Activitylog\Models\Activity;

class ActivityLogController extends Controller
{
    /** Who performed an entry: a player, an admin or the system. */
    public const SCOPES = ['users', 'admin', 'system'];

    /** Player event properties shown in the summary and the detail view. */
    private const DISPLAY_KEYS = ['game_key', 'mission', 'points', 'correct', 'wrong', 'badge', 'device', 'ip_address'];

    public function __construct(private ActivityLogPresenter $presenter) {}

    /**
     * Paginated activity log: what players do in the app (sign in, open and
     * finish games, earn badges), admin changes and system events.
     */
    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'user_id', 'event', 'scope', 'date_from', 'date_to']);
        $playerIds = User::query()->withTrashed()->where('is_superadmin', false)->select('id');

        $logs = Activity::query()
            ->with(['causer' => fn ($query) => $query->withTrashed()])
            ->tap(fn (Builder $query) => UserActivity::withoutHeartbeats($query))
            ->when($filters['search'] ?? null, fn (Builder $q, string $v) => $q->where('description', 'like', '%'.addcslashes($v, '%_\\').'%'))
            ->when($filters['user_id'] ?? null, fn (Builder $q, string $v) => $q->where(fn (Builder $q) => $q
                ->where(fn (Builder $q) => $q->where('causer_type', User::class)->where('causer_id', (int) $v))
                ->orWhere(fn (Builder $q) => $q->where('subject_type', User::class)->where('subject_id', (int) $v))))
            ->when($filters['event'] ?? null, fn (Builder $q, string $v) => $q->where('event', $v))
            ->when(($filters['scope'] ?? null) === 'users', fn (Builder $q) => $q->where('causer_type', User::class)->whereIn('causer_id', $playerIds))
            ->when(($filters['scope'] ?? null) === 'admin', fn (Builder $q) => $q->whereNotNull('causer_id')
                ->where(fn (Builder $q) => $q->where('causer_type', '!=', User::class)->orWhereNotIn('causer_id', $playerIds)))
            ->when(($filters['scope'] ?? null) === 'system', fn (Builder $q) => $q->whereNull('causer_id'))
            ->when($filters['date_from'] ?? null, fn (Builder $q, string $v) => $q->where('created_at', '>=', $v))
            ->when($filters['date_to'] ?? null, fn (Builder $q, string $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->latest('id')
            ->paginate(25)
            ->withQueryString();

        $this->presenter->preload($logs->getCollection());

        $logs = $logs->through(fn (Activity $activity): array => [
            'id' => $activity->id,
            'log_name' => $activity->log_name ?? 'default',
            'description' => $activity->description,
            'event' => $activity->event,
            'scope' => $this->scope($activity),
            'causer' => $this->causer($activity),
            'subject' => $activity->log_name === UserActivity::LOG_NAME ? null : $this->presenter->subject($activity),
            'changed_fields' => $this->presenter->changedFields($activity),
            'properties' => UserActivity::displayProperties($activity),
            'created_at' => $activity->created_at?->toIso8601String(),
        ]);

        return Inertia::render('admin/activity-log', [
            'logs' => $logs,
            'users' => User::query()->select('id', 'name', 'email')->orderBy('name')->get(),
            'filters' => (object) $filters,
            'eventTypes' => Activity::query()->whereNotNull('event')->distinct()->orderBy('event')->pluck('event')->values(),
            'scopes' => self::SCOPES,
        ]);
    }

    /**
     * Full detail of one entry for the admin modal: actor, subject, client
     * and a field-by-field diff with secrets masked.
     */
    public function show(Request $request, Activity $activity): JsonResponse
    {
        $activity->load(['causer' => fn ($query) => $query->withTrashed()]);
        $this->presenter->preload([$activity]);

        return response()->json([
            'id' => $activity->id,
            'log_name' => $activity->log_name ?? 'default',
            'description' => $activity->description,
            'event' => $activity->event,
            'scope' => $this->scope($activity),
            'causer' => $this->causer($activity),
            'subject' => $activity->log_name === UserActivity::LOG_NAME ? null : $this->presenter->subject($activity, $request->user()),
            'changed_fields' => $this->presenter->changedFields($activity),
            'diff' => $this->presenter->diff($activity),
            'diff_mode' => $this->presenter->diffMode($activity),
            'properties' => UserActivity::displayProperties($activity),
            'extra' => array_values(array_filter(
                $this->presenter->extraProperties($activity),
                fn (array $row): bool => ! in_array($row['key'], self::DISPLAY_KEYS, true),
            )),
            'ip_address' => $activity->properties?->get('ip_address'),
            'device' => $activity->properties?->get('device'),
            'batch_uuid' => $activity->batch_uuid,
            'created_at' => $activity->created_at?->toIso8601String(),
        ]);
    }

    private function scope(Activity $activity): string
    {
        if ($activity->causer_id === null) {
            return 'system';
        }

        return $activity->causer instanceof User && ! $activity->causer->is_superadmin ? 'users' : 'admin';
    }

    /** @return array{id: ?int, name: ?string, email: ?string, deleted_id?: int}|null */
    private function causer(Activity $activity): ?array
    {
        if ($activity->causer instanceof User) {
            return ['id' => $activity->causer->id, 'name' => $activity->causer->name, 'email' => $activity->causer->email];
        }

        return $activity->causer_id !== null ? ['id' => null, 'name' => null, 'email' => null, 'deleted_id' => (int) $activity->causer_id] : null;
    }
}
