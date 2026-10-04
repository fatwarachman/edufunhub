<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Activitylog\Models\Activity;

class UserController extends Controller
{
    /**
     * Paginated user list with search, role filter, and sort.
     */
    public function index(Request $request): Response
    {
        $query = User::query()
            ->with(['roles', 'playerProfile:id,user_id,birth_date,school_name'])
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

        return Inertia::render('admin/users/index', [
            'users' => $query->paginate(20)->withQueryString(),
            'roles' => Role::query()->select('id', 'name', 'slug')->get(),
            'filters' => $request->only(['search', 'role', 'sort', 'direction']),
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
     * Show user detail with roles and recent activity log.
     */
    public function show(User $user): Response
    {
        $user->load(['roles', 'playerProfile:id,user_id,birth_date,school_name,grade']);

        $activityLog = Activity::query()
            ->where('subject_type', User::class)
            ->where('subject_id', $user->id)
            ->latest()
            ->limit(50)
            ->get();

        return Inertia::render('admin/users/show', [
            'user' => $user,
            'activity' => $activityLog,
        ]);
    }

    /**
     * Show form to edit an existing user.
     */
    public function edit(User $user): Response
    {
        $user->load('roles');

        return Inertia::render('admin/users/edit', [
            'user' => $user,
            'roles' => Role::query()->select('id', 'name', 'slug')->get(),
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

        return redirect()->route('admin.users.index')
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
