import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { type ActivityLog, type AdminUser, type Role } from '@/types/admin';
import { Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    ArrowLeft,
    Calendar,
    Edit,
    Cake,
    Mail,
    School,
    Shield,
    ShieldOff,
    Trash2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface ShowUserProps {
    user: AdminUser;
    activity: ActivityLog[];
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(str: string | null | undefined): string {
    if (!str) return 'Never';
    return new Date(str).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatBirthDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function getInitialsFromName(name: string): string {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

export default function ShowUser({ user, activity }: ShowUserProps) {
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const initials = getInitialsFromName(user.name);

    const handleDelete = () => {
        setDeleting(true);
        router.delete(`/admin/users/${user.id}`, {
            onFinish: () => setDeleting(false),
        });
    };

    const handleToggleStatus = () => {
        router.post(`/admin/users/${user.id}/toggle-status`, {}, {
            preserveScroll: true,
        });
    };

    return (
        <>
            <Head title={user.name} />

            <div className="mx-auto max-w-3xl space-y-6">
                {/* Back link */}
                <Link
                    href="/admin/users"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" />
                    Back to users
                </Link>

                {/* Profile header */}
                <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                            {user.avatar_url ? (
                                <img
                                    src={user.avatar_url}
                                    alt={user.name}
                                    className="size-full rounded-full object-cover"
                                />
                            ) : (
                                initials
                            )}
                        </div>
                        <div>
                            <h2 className="font-display text-xl font-bold text-foreground">
                                {user.name}
                            </h2>
                            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Mail className="size-3.5" />
                                {user.email}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span
                                    className={cn(
                                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                        user.status === 'suspended'
                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'size-1.5 rounded-full',
                                            user.status === 'suspended' ? 'bg-red-500' : 'bg-green-500',
                                        )}
                                    />
                                    {user.status ?? 'active'}
                                </span>
                                {user.is_superadmin && (
                                    <span className="rounded-full bg-bubble-purple/10 px-2 py-0.5 text-xs font-medium text-bubble-purple">
                                        Superadmin
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href={`/admin/users/${user.id}/edit`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Edit className="size-3.5" />
                            Edit
                        </Link>
                        <button
                            onClick={handleToggleStatus}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {user.status === 'suspended' ? (
                                <>
                                    <Shield className="size-3.5" />
                                    Activate
                                </>
                            ) : (
                                <>
                                    <ShieldOff className="size-3.5" />
                                    Suspend
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Trash2 className="size-3.5" />
                            Delete
                        </button>
                    </div>
                </div>

                {/* Details & roles */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {/* Account details */}
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <h3 className="mb-4 font-semibold text-foreground">Account Details</h3>
                        <dl className="space-y-3 text-sm">
                            <div className="flex items-center gap-2">
                                <Calendar className="size-4 text-muted-foreground" />
                                <dt className="text-muted-foreground">Joined</dt>
                                <dd className="ml-auto font-medium text-foreground">
                                    {formatDate(user.created_at)}
                                </dd>
                            </div>
                            <div className="flex items-center gap-2">
                                <Activity className="size-4 text-muted-foreground" />
                                <dt className="text-muted-foreground">Last seen</dt>
                                <dd className="ml-auto font-medium text-foreground">
                                    {formatDate(user.last_seen_at)}
                                </dd>
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail className="size-4 text-muted-foreground" />
                                <dt className="text-muted-foreground">Email verified</dt>
                                <dd className="ml-auto font-medium text-foreground">
                                    {user.email_verified_at
                                        ? formatDate(user.email_verified_at)
                                        : 'Not verified'}
                                </dd>
                            </div>
                            <div className="flex items-center gap-2">
                                <Cake className="size-4 text-muted-foreground" />
                                <dt className="text-muted-foreground">Age</dt>
                                <dd className="ml-auto font-medium text-foreground">
                                    {user.player_profile?.birth_date
                                        ? `${user.player_profile.age} years (${formatBirthDate(user.player_profile.birth_date)})`
                                        : '—'}
                                </dd>
                            </div>
                            <div className="flex items-center gap-2">
                                <School className="size-4 text-muted-foreground" />
                                <dt className="text-muted-foreground">Last school</dt>
                                <dd className="ml-auto min-w-0 truncate text-right font-medium text-foreground">
                                    {user.player_profile?.school_name ?? '—'}
                                </dd>
                            </div>
                        </dl>
                    </div>

                    {/* Roles */}
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <h3 className="mb-4 font-semibold text-foreground">Roles</h3>
                        {user.roles && user.roles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {user.roles.map((role: Role) => (
                                    <span
                                        key={role.id}
                                        className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground"
                                    >
                                        {role.name}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No roles assigned</p>
                        )}
                    </div>
                </div>

                {/* Activity log */}
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                    <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                        <Activity className="size-4 text-muted-foreground" />
                        <h3 className="font-semibold text-foreground">Recent Activity</h3>
                    </div>
                    <div className="px-5">
                        {activity.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                <Activity className="mb-2 size-8 text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">No activity yet</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-border">
                                {activity.map((log) => (
                                    <li key={log.id} className="flex items-start gap-3 py-3">
                                        <div className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                                        <div>
                                            <p className="text-sm text-foreground">{log.description}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {timeAgo(log.created_at)}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete confirmation dialog */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="fixed inset-0 bg-black/50"
                        onClick={() => setConfirmDelete(false)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-foreground">Delete user</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Are you sure you want to permanently delete{' '}
                            <strong>{user.name}</strong>? This action cannot be undone.
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setConfirmDelete(false)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                            >
                                {deleting && (
                                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                                Delete user
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

ShowUser.layout = (page: ReactNode) => (
    <AdminLayout title="User Profile">{page}</AdminLayout>
);
