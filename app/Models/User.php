<?php

namespace App\Models;

use App\Services\ProfilePhoto;
use Carbon\Carbon;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class User extends Authenticatable implements MustVerifyEmail
{
    /** A user counts as online when seen within this many minutes. */
    public const ONLINE_MINUTES = 15;

    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, \Laravel\Scout\Searchable, LogsActivity, Notifiable, SoftDeletes, TwoFactorAuthenticatable;

    /**
     * Get the indexable data array for the model.
     *
     * @return array<string, mixed>
     */
    public function toSearchableArray(): array
    {
        return [
            'id' => (int) $this->id,
            'name' => $this->name,
            'email' => $this->email,
        ];
    }

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'is_superadmin',
        'current_workspace_id',
        'locale',
        'onboarded_at',
        'avatar_url',
        'bio',
        'timezone',
        'date_format',
        'notification_preferences',
        'onboarding_checklist_dismissed_at',
        'tour_completed_at',
        'changelog_read_at',
        'experience_feedback_at',
        'password_updated_at',
        'last_seen_at',
    ];

    /**
     * The accessors to append to the model's array form.
     *
     * @var array
     */
    protected $appends = [
        'avatar_url',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'disabled_at' => 'datetime',
            'password' => 'hashed',
            'is_superadmin' => 'boolean',
            'ads_disabled' => 'boolean',
            'two_factor_confirmed_at' => 'datetime',
            'onboarded_at' => 'datetime',
            'profile_completed_at' => 'datetime',
            'notification_preferences' => 'array',
            'onboarding_checklist_dismissed_at' => 'datetime',
            'tour_completed_at' => 'datetime',
            'changelog_read_at' => 'datetime',
            'experience_feedback_at' => 'datetime',
            'password_updated_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'whatsapp_notifications' => 'boolean',
            'whatsapp_welcomed_at' => 'datetime',
        ];
    }

    /**
     * Determine whether the proactive experience survey should be offered to this user.
     */
    public function qualifiesForExperienceSurvey(): bool
    {
        if ($this->experience_feedback_at !== null || $this->created_at === null) {
            return false;
        }

        $afterDays = max(0, (int) config('feedback.experience_survey_after_days'));

        return $this->created_at->lte(now()->subDays($afterDays));
    }

    /** @return HasMany<Feedback, $this> */
    public function feedback(): HasMany
    {
        return $this->hasMany(Feedback::class);
    }

    /** @return HasOne<PlayerProfile, $this> */
    public function playerProfile(): HasOne
    {
        return $this->hasOne(PlayerProfile::class);
    }

    /** @return HasMany<PointLedger, $this> */
    public function pointLedgers(): HasMany
    {
        return $this->hasMany(PointLedger::class);
    }

    /** @return HasMany<GameHistory, $this> */
    /** @return HasMany<UserBadge, $this> */
    public function badges(): HasMany
    {
        return $this->hasMany(UserBadge::class);
    }

    public function gameHistories(): HasMany
    {
        return $this->hasMany(GameHistory::class);
    }

    /** Character shop items the user bought. @return BelongsToMany<CharacterItem, $this> */
    public function characterItems(): BelongsToMany
    {
        return $this->belongsToMany(CharacterItem::class)->withPivot('price_paid')->withTimestamps();
    }

    /** Seats the user took in recorded room and duel matches. @return HasMany<GameMatchPlayer, $this> */
    public function matchSeats(): HasMany
    {
        return $this->hasMany(GameMatchPlayer::class);
    }

    public function workspaces(): BelongsToMany
    {
        return $this->belongsToMany(Workspace::class, 'workspace_user')
            ->withPivot('role', 'permissions')
            ->withTimestamps();
    }

    /**
     * The global roles assigned to this user.
     *
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class)->withTimestamps();
    }

    /**
     * Saved a WhatsApp number, did not opt out and the account is active.
     */
    public function canReceiveWhatsApp(): bool
    {
        return $this->whatsapp_number !== null && $this->whatsapp_number !== ''
            && $this->whatsapp_notifications
            && $this->disabled_at === null;
    }

    /**
     * Whether the participant has provided date of birth and last school.
     */
    public function hasCompletePlayerDetails(): bool
    {
        return $this->playerProfile()
            ->whereNotNull('birth_date')
            ->whereNotNull('school_name')
            ->where('school_name', '!=', '')
            ->exists();
    }

    /**
     * Give a self-registered user the default participant role.
     */
    public function assignParticipantRole(): void
    {
        $role = Role::query()->firstOrCreate(
            ['slug' => Role::PARTICIPANT],
            ['name' => 'Peserta', 'description' => 'Memainkan game edukasi', 'is_system' => true],
        );

        $this->roles()->syncWithoutDetaching([$role->id]);
    }

    /**
     * Only users with the "guru" role open the teacher room (Ruang Guru).
     * Super admins manage questions from the admin panel instead.
     */
    public function isTeacher(): bool
    {
        return $this->hasRole(Role::TEACHER);
    }

    /**
     * Questions this user authored.
     *
     * @return HasMany<Question, $this>
     */
    public function authoredQuestions(): HasMany
    {
        return $this->hasMany(Question::class, 'created_by');
    }

    /**
     * Check whether this user has a given global role.
     */
    public function hasRole(string $slug): bool
    {
        return $this->roles()->where('slug', $slug)->exists();
    }

    /**
     * Permissions given to this user directly (override), on top of roles.
     *
     * @return BelongsToMany<Permission, $this>
     */
    public function directPermissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'permission_user')->withTimestamps();
    }

    /**
     * Admin panel access. With several roles the highest one counts: a super
     * admin is always an admin too.
     */
    public function isAdmin(): bool
    {
        return $this->is_superadmin || $this->hasRole(Role::ADMIN);
    }

    /**
     * Check whether this user has a given permission through their roles or
     * a direct (override) permission. Super admins have every permission.
     */
    public function hasPermission(string $slug): bool
    {
        return $this->is_superadmin
            || $this->directPermissions()->where('slug', $slug)->exists()
            || $this->roles()->whereHas('permissions', fn ($q) => $q->where('slug', $slug))->exists();
    }

    /**
     * Every permission slug the user holds (roles + direct overrides).
     *
     * @return list<string>
     */
    public function permissionSlugs(): array
    {
        if ($this->is_superadmin) {
            return Permission::query()->orderBy('slug')->pluck('slug')->all();
        }

        return Permission::query()
            ->where(fn ($query) => $query
                ->whereHas('roles', fn ($roles) => $roles->whereIn('roles.id', $this->roles()->select('roles.id')))
                ->orWhereIn('id', $this->directPermissions()->select('permissions.id')))
            ->orderBy('slug')
            ->pluck('slug')
            ->all();
    }

    /**
     * Replace the user's roles. The "super-admin" role and the is_superadmin
     * flag always move together, so a user given several roles gets the
     * highest one.
     *
     * @param  list<int>  $roleIds
     */
    public function syncRoles(array $roleIds): void
    {
        $this->roles()->sync($roleIds);

        $superadmin = Role::query()->whereKey($roleIds)->where('slug', Role::SUPER_ADMIN)->exists();
        if ($this->is_superadmin !== $superadmin) {
            $this->forceFill(['is_superadmin' => $superadmin])->save();
        }
    }

    /**
     * Get all workspaces owned by the user.
     */
    public function ownedWorkspaces(): HasMany
    {
        return $this->hasMany(Workspace::class, 'owner_id');
    }

    /**
     * Get all connected accounts for the user.
     */
    public function connectedAccounts(): HasMany
    {
        return $this->hasMany(ConnectedAccount::class);
    }

    /**
     * Get the user's login activity history.
     */
    public function loginActivities(): HasMany
    {
        return $this->hasMany(LoginActivity::class);
    }

    /**
     * Get the user's password change history.
     */
    public function passwordHistories(): HasMany
    {
        return $this->hasMany(PasswordHistory::class);
    }

    /**
     * Get the admin notes written about this user.
     */
    public function notes(): HasMany
    {
        return $this->hasMany(UserNote::class);
    }

    /**
     * Get the user's current workspace.
     */
    public function currentWorkspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class, 'current_workspace_id');
    }

    /**
     * Get the user's personal workspace.
     */
    public function personalWorkspace(): ?Workspace
    {
        return $this->ownedWorkspaces()->where('personal_workspace', true)->first();
    }

    /**
     * Switch the user's current workspace.
     */
    public function switchWorkspace(Workspace $workspace): bool
    {
        if (! $workspace->hasUser($this)) {
            return false;
        }

        $this->forceFill([
            'current_workspace_id' => $workspace->id,
        ])->save();

        return true;
    }

    /**
     * Mark the user as having completed onboarding.
     */
    public function completeOnboarding(): void
    {
        if ($this->onboarded_at !== null) {
            return;
        }

        $this->forceFill([
            'onboarded_at' => now(),
        ])->save();
    }

    /**
     * Get the user's avatar URL with fallback.
     */
    public function getAvatarUrlAttribute($value): ?string
    {
        return ProfilePhoto::url($value ?? $this->attributes['avatar_url'] ?? null);
    }

    /**
     * Determine if the user belongs to the given workspace.
     */
    public function belongsToWorkspace(Workspace $workspace): bool
    {
        return $this->workspaces()->where('workspace_id', $workspace->id)->exists();
    }

    /**
     * Get the user's role in a workspace.
     */
    public function roleInWorkspace(Workspace $workspace): ?string
    {
        $membership = $this->workspaces()->where('workspace_id', $workspace->id)->first();

        return $membership?->pivot->role;
    }

    /**
     * Determine if the user owns the given workspace.
     */
    public function ownsWorkspace(Workspace $workspace): bool
    {
        return $this->id === $workspace->owner_id;
    }

    public function userIsAdmin(Workspace $workspace): bool
    {
        $role = $this->roleInWorkspace($workspace);

        return in_array($role, [Workspace::ROLE_OWNER, Workspace::ROLE_ADMIN]);
    }

    /**
     * Determine if the user is a member (or higher) of the workspace.
     */
    public function userIsMember(Workspace $workspace): bool
    {
        $role = $this->roleInWorkspace($workspace);

        return in_array($role, [Workspace::ROLE_OWNER, Workspace::ROLE_ADMIN, Workspace::ROLE_MEMBER]);
    }

    /**
     * Determine if the user is a viewer of the workspace.
     */
    public function userIsViewer(Workspace $workspace): bool
    {
        return $this->roleInWorkspace($workspace) === Workspace::ROLE_VIEWER;
    }

    /**
     * Get normalized notification preferences with channel and category defaults.
     *
     * @return array{
     *     channels: array{email: bool, in_app: bool},
     *     categories: array{marketing: bool, security: bool, team: bool, billing: bool}
     * }
     */
    public function normalizedNotificationPreferences(): array
    {
        $defaults = [
            'channels' => [
                'email' => true,
                'in_app' => true,
            ],
            'categories' => [
                'marketing' => true,
                'security' => true,
                'team' => true,
                'billing' => true,
            ],
        ];

        $preferences = $this->notification_preferences ?? [];

        if (isset($preferences['channels']) || isset($preferences['categories'])) {
            return [
                'channels' => array_merge($defaults['channels'], $preferences['channels'] ?? []),
                'categories' => array_merge($defaults['categories'], $preferences['categories'] ?? []),
            ];
        }

        return [
            'channels' => $defaults['channels'],
            'categories' => array_merge($defaults['categories'], array_intersect_key($preferences, $defaults['categories'])),
        ];
    }

    /**
     * Determine whether the given notification channel is enabled for the user.
     */
    public function notificationChannelEnabled(string $channel): bool
    {
        return $this->normalizedNotificationPreferences()['channels'][$channel] ?? true;
    }

    /**
     * Determine whether the given notification category is enabled for the user.
     */
    public function notificationCategoryEnabled(string $category): bool
    {
        return $this->normalizedNotificationPreferences()['categories'][$category] ?? true;
    }

    /**
     * Get the support tickets created by the user.
     */
    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    /**
     * Calculate the user's profile completeness score.
     *
     * Returns an array with:
     *   - score: integer 0–100
     *   - missing: list of human-readable fields the user hasn't filled in
     *
     * @return array{score: int, missing: list<string>}
     */
    public function profileCompletenessScore(): array
    {
        $checks = [
            ['label' => 'Profile photo', 'filled' => ! empty($this->avatar_url)],
            ['label' => 'Bio', 'filled' => ! empty($this->bio)],
            ['label' => 'Timezone', 'filled' => ! empty($this->timezone) && $this->timezone !== 'UTC'],
            ['label' => 'Two-factor authentication', 'filled' => ! is_null($this->two_factor_confirmed_at)],
        ];

        $total = count($checks);
        $completed = 0;
        $missing = [];

        foreach ($checks as $check) {
            if ($check['filled']) {
                $completed++;
            } else {
                $missing[] = $check['label'];
            }
        }

        return [
            'score' => (int) round(($completed / $total) * 100),
            'missing' => $missing,
        ];
    }

    /**
     * Get the options for recording activity.
     */
    /**
     * Calculate the user's current consecutive daily login streak.
     */
    public function currentLoginStreak(): int
    {
        $dates = $this->loginActivities()
            ->where('is_successful', true)
            ->orderByDesc('login_at')
            ->pluck('login_at')
            ->map(fn ($date) => $date->toDateString())
            ->unique()
            ->values();

        if ($dates->isEmpty()) {
            return 0;
        }

        $today = now()->toDateString();
        $yesterday = now()->subDay()->toDateString();

        // Streak must start today or yesterday
        if ($dates->first() !== $today && $dates->first() !== $yesterday) {
            return 0;
        }

        $streak = 1;
        for ($i = 1; $i < $dates->count(); $i++) {
            $expected = now()->subDays($i + ($dates->first() === $yesterday ? 1 : 0))->toDateString();
            if ($dates->get($i) === $expected) {
                $streak++;
            } else {
                break;
            }
        }

        return $streak;
    }

    /**
     * Calculate the user's longest consecutive daily login streak.
     */
    public function longestLoginStreak(): int
    {
        $dates = $this->loginActivities()
            ->where('is_successful', true)
            ->orderByDesc('login_at')
            ->pluck('login_at')
            ->map(fn ($date) => $date->toDateString())
            ->unique()
            ->sort()
            ->values();

        if ($dates->isEmpty()) {
            return 0;
        }

        $longest = 1;
        $current = 1;

        for ($i = 1; $i < $dates->count(); $i++) {
            $prev = Carbon::parse($dates->get($i - 1));
            $curr = Carbon::parse($dates->get($i));

            if ($prev->addDay()->toDateString() === $curr->toDateString()) {
                $current++;
                $longest = max($longest, $current);
            } else {
                $current = 1;
            }
        }

        return $longest;
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logFillable()
            ->logOnlyDirty()
            ->dontLogIfAttributesChangedOnly(['last_seen_at', 'updated_at'])
            ->dontSubmitEmptyLogs()
            ->useLogName('user');
    }
}
