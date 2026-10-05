<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Models\GameHistory;
use App\Models\ImpersonationLog;
use App\Models\Role;
use App\Models\User;
use App\Services\GameAnalytics;
use App\Services\MatchHistory;
use App\Services\PlayerNotifications;
use App\Services\UserAnalytics;
use Illuminate\Http\RedirectResponse;
use App\Services\PlayerBadges;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    /**
     * Paginated user list with search, role filter, and sort.
     */
    public function index(Request $request, PlayerBadges $badges): Response
    {
        $query = User::query()
            ->with(['roles', 'playerProfile:id,user_id,birth_date,school_name'])
            ->withExists(['connectedAccounts as signed_up_with_google' => fn ($q) => $q->where('provider', 'google')])
            ->when(in_array($request->signup, ['google', 'email'], true), function ($q) use ($request): void {
                $method = $request->signup === 'google' ? 'whereHas' : 'whereDoesntHave';
                $q->{$method}('connectedAccounts', fn ($accounts) => $accounts->where('provider', 'google'));
            })
            ->when($request->search, function ($q, string $search): void {
                $q->where(function ($q) use ($search): void {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->when($request->role, function ($q, string $roleSlug): void {
                $q->whereHas('roles', fn ($r) => $r->where('slug', $roleSlug));
            })
            ->when($request->sort, function ($q, string $sort) use ($request): void {
                $direction = $request->direction === 'desc' ? 'desc' : 'asc';
                $allowed = ['name', 'email', 'created_at', 'last_seen_at'];
                if (in_array($sort, $allowed, true)) {
                    $q->orderBy($sort, $direction);
                }
            }, function ($q): void {
                $q->orderByDesc('created_at');
            });

        $users = $query->paginate(20)->withQueryString();
        $earned = $badges->earnedFor($users->getCollection()->pluck('id')->all());
        $users->getCollection()->each(fn (User $user) => $user->setAttribute('badges', $earned[$user->id] ?? []));

        return Inertia::render('admin/users/index', [
            'users' => $users,
            'roles' => Role::query()->select('id', 'name', 'slug')->get(),
            'filters' => (object) $request->only(['search', 'role', 'signup', 'sort', 'direction']),
            'canImpersonate' => $request->user()->hasPermission(ImpersonationController::PERMISSION)
                && ! $request->session()->has('impersonated_by'),
            'viewerIsSuperadmin' => (bool) $request->user()->is_superadmin,
        ]);
    }

    /**
     * Show form to create a new user.
     */
    public function create(): Response
    {
        return Inertia::render('admin/users/create', [
            'roles' => Role::query()->select('id', 'name', 'slug')->get(),
        ]);
    }

    /**
     * Validate and persist a new user, then assign roles.
     */
    public function store(StoreUserRequest $request): RedirectResponse
    {
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => $request->password,
            'email_verified_at' => now(),
            'locale' => config('app.locale'),
        ]);

        if ($request->filled('roles')) {
            $user->roles()->sync($request->roles);
        }

        activity()
            ->causedBy($request->user())
            ->performedOn($user)
            ->log('Created user');

        return redirect()->route('admin.users.index')
            ->with('success', 'User created successfully.');
    }

    /**
     * Assign or remove the teacher (guru) role. Only teachers see Ruang Guru.
     */
    public function toggleTeacher(Request $request, User $user, PlayerNotifications $notifications): RedirectResponse
    {
        abort_unless((bool) $request->user()?->is_superadmin, 403);

        $role = Role::query()->firstOrCreate(
            ['slug' => Role::TEACHER],
            ['name' => 'Guru', 'description' => 'Membuat dan mengelola quiz untuk kelas', 'is_system' => true],
        );
        $isTeacher = $user->roles()->whereKey($role->id)->exists();
        $isTeacher ? $user->roles()->detach($role->id) : $user->roles()->attach($role->id);

        activity()->causedBy($request->user())->performedOn($user)->log($isTeacher ? 'Removed teacher role' : 'Assigned teacher role');
        $notifications->notify(
            $user,
            'teacher',
            $isTeacher ? 'player_notifications.teacher_revoked' : 'player_notifications.teacher_granted',
            url: $isTeacher ? '/dashboard' : '/teacher/questions',
        );

        return back()->with('success', $isTeacher ? __('ai.teacher_removed', ['name' => $user->name]) : __('ai.teacher_assigned', ['name' => $user->name]));
    }

    /**
     * Show user detail with roles and recent activity log.
     */
    public function show(User $user, UserAnalytics $analytics, MatchHistory $matchHistory, PlayerBadges $badges): Response
    {
        $user->load(['roles', 'playerProfile', 'connectedAccounts:id,user_id,provider,created_at']);

        return Inertia::render('admin/users/show', [
            'user' => [
                ...$user->only(['id', 'name', 'email', 'avatar_url', 'is_superadmin', 'created_at', 'last_seen_at', 'email_verified_at', 'disabled_at', 'onboarded_at', 'password_updated_at', 'deleted_at']),
                'status' => $user->disabled_at ? 'suspended' : 'active',
                'two_factor_enabled' => $user->two_factor_confirmed_at !== null,
                'roles' => $user->roles->map(fn ($role): array => ['id' => $role->id, 'name' => $role->name, 'slug' => $role->slug])->all(),
                'is_teacher' => $user->roles->contains('slug', Role::TEACHER),
                'providers' => $user->connectedAccounts->map(fn ($account): array => ['provider' => $account->provider, 'linked_at' => $account->created_at?->toIso8601String()])->all(),
                'player_profile' => $user->playerProfile ? [
                    'nickname' => $user->playerProfile->nickname,
                    'grade' => $user->playerProfile->grade,
                    'birth_date' => $user->playerProfile->birth_date?->toDateString(),
                    'age' => $user->playerProfile->age,
                    'school_name' => $user->playerProfile->school_name,
                    'color' => $user->playerProfile->color,
                    'accessory' => $user->playerProfile->accessory,
                ] : null,
            ],
            ...$analytics->userDetail($user),
            'activityLog' => $analytics->activityFor($user),
            'badges' => collect($badges->summary($user))
                ->map(fn ($value, string $key) => $key === 'badges'
                    ? collect($value)->map(fn (array $badge): array => [...$badge, 'name' => __('badges.'.$badge['key'].'.name', [], 'en'), 'description' => __('badges.'.$badge['key'].'.description', [], 'en')])->all()
                    : $value)
                ->all(),
            'impersonationLogs' => ImpersonationLog::query()
                ->with('impersonator:id,name')
                ->where('impersonated_id', $user->id)
                ->latest('started_at')
                ->limit(10)
                ->get()
                ->map(fn (ImpersonationLog $log): array => [
                    'id' => $log->id,
                    'impersonator' => $log->impersonator?->name,
                    'ip_address' => $log->ip_address,
                    'started_at' => $log->started_at?->toIso8601String(),
                    'ended_at' => $log->ended_at?->toIso8601String(),
                ])->all(),
            'plays' => GameHistory::query()
                ->where('user_id', $user->id)
                ->latest('played_at')
                ->latest('id')
                ->paginate(15, ['id', 'game_key', 'mission', 'grade', 'points', 'correct', 'wrong', 'duration_seconds', 'played_at'], 'plays_page')
                ->withQueryString()
                ->through(fn (GameHistory $play): array => [
                    ...$play->only(['id', 'game_key', 'mission', 'grade', 'points', 'correct', 'wrong', 'duration_seconds']),
                    'accuracy' => $play->accuracy(),
                    'played_at' => $play->played_at->toIso8601String(),
                ]),
            'passPercent' => GameAnalytics::PASS_PERCENT,
            'matchHistory' => $matchHistory->forUser($user),
            'matches' => $matchHistory->matchesFor($user),
            'shop' => [
                'items' => $user->characterItems()->orderByPivot('created_at', 'desc')->get()->map(fn ($item): array => [
                    'id' => $item->id,
                    'name' => $item->name_en ?: $item->name_id,
                    'slot' => $item->slot,
                    'price_paid' => (int) $item->pivot->price_paid,
                    'bought_at' => $item->pivot->created_at?->toIso8601String(),
                ])->all(),
                'character' => $user->playerProfile?->character(),
            ],
        ]);
    }

    /**
     * Show form to edit an existing user.
     */
    public function edit(User $user): Response
    {
        $user->load('roles:id');

        return Inertia::render('admin/users/edit', [
            'user' => $user->only(['id', 'name', 'email', 'created_at', 'last_seen_at', 'email_verified_at', 'is_superadmin']),
            'roles' => Role::query()->select('id', 'name', 'slug', 'description', 'is_system')->orderBy('name')->get(),
            'userRoles' => $user->roles->pluck('id')->values(),
        ]);
    }

    /**
     * Validate and update an existing user, syncing roles.
     */
    public function update(UpdateUserRequest $request, User $user): RedirectResponse
    {
        $data = [
            'name' => $request->name,
            'email' => $request->email,
        ];

        if ($request->filled('password')) {
            $data['password'] = $request->password;
        }

        $user->update($data);

        if ($request->has('roles')) {
            $user->roles()->sync($request->roles ?? []);
        }

        activity()
            ->causedBy($request->user())
            ->performedOn($user)
            ->log('Updated user');

        return redirect()->route('admin.users.show', $user)
            ->with('success', 'User updated successfully.');
    }

    /**
     * Soft-delete a user. Superadmins and self cannot be deleted.
     */
    public function destroy(Request $request, User $user): RedirectResponse
    {
        if ($user->is_superadmin) {
            abort(403, 'Superadmin users cannot be deleted.');
        }

        if ($user->id === $request->user()->id) {
            abort(403, 'You cannot delete your own account.');
        }

        $user->delete();

        activity()
            ->causedBy($request->user())
            ->performedOn($user)
            ->log('Deleted user');

        return redirect()->route('admin.users.index')
            ->with('success', 'User deleted successfully.');
    }

    /**
     * Toggle access independently of email verification.
     */
    public function toggleStatus(Request $request, User $user): RedirectResponse
    {
        if ($user->is_superadmin) {
            abort(403, 'Superadmin status cannot be changed.');
        }

        $isCurrentlyActive = $user->disabled_at === null;

        $user->forceFill([
            'disabled_at' => $isCurrentlyActive ? now() : null,
        ])->save();

        $action = $isCurrentlyActive ? 'Deactivated user' : 'Activated user';

        activity()
            ->causedBy($request->user())
            ->performedOn($user)
            ->log($action);

        return back()->with('success', "User {$action} successfully.");
    }
}
