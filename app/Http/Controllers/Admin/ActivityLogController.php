<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ActivityLogController extends Controller
{
    /**
     * Paginated activity log — props aligned to frontend `activity-log.tsx`.
     *
     * Frontend expects:
     *   logs: PaginatedData<ActivityLog>
     *   users: User[]
     *   filters: { search, user_id, event, date_from, date_to }
     *   eventTypes: string[]
     */
    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'user_id', 'event', 'date_from', 'date_to']);

        $query = DB::table('activity_log')
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where('description', 'like', "%{$v}%"))
            ->when($filters['user_id'] ?? null, fn ($q, $v) => $q->where('causer_id', $v))
            ->when($filters['event'] ?? null, fn ($q, $v) => $q->where('log_name', $v))
            ->when($filters['date_from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($filters['date_to'] ?? null, fn ($q, $v) => $q->where('created_at', '<=', $v . ' 23:59:59'))
            ->orderByDesc('created_at');

        $logs = $query->paginate(25)->withQueryString();

        // Map to ActivityLog shape expected by the frontend
        $logs->getCollection()->transform(function (object $row): array {
            return [
                'id'           => $row->id,
                'log_name'     => $row->log_name ?? 'default',
                'description'  => $row->description,
                'subject_type' => $row->subject_type,
                'subject_id'   => $row->subject_id,
                'causer_type'  => $row->causer_type,
                'causer_id'    => $row->causer_id,
                'causer_name'  => null,
                'properties'   => json_decode($row->properties ?? '{}', true),
                'created_at'   => $row->created_at,
            ];
        });

        // Enrich causer names
        $causerIds = $logs->getCollection()
            ->pluck('causer_id')
            ->unique()
            ->filter()
            ->values();

        if ($causerIds->isNotEmpty()) {
            $names = User::query()->whereIn('id', $causerIds)->pluck('name', 'id');
            $logs->getCollection()->transform(function (array $row) use ($names): array {
                $row['causer_name'] = $names[$row['causer_id']] ?? null;
                return $row;
            });
        }

        $users = User::query()->select('id', 'name', 'email')->orderBy('name')->get();
        $eventTypes = DB::table('activity_log')->distinct()->pluck('log_name')->filter()->values();

        return Inertia::render('admin/activity-log', [
            'logs'       => $logs,
            'users'      => $users,
            'filters'    => (object) $filters,
            'eventTypes' => $eventTypes,
        ]);
    }
}
