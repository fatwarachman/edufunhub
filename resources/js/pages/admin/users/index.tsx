import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { type AdminUser, type PaginatedData, type PaginationLink, type Role } from '@/types/admin';
import { Head, Link, router } from '@inertiajs/react';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Edit,
    Eye,
    Mail,
    Loader2,
    MoreHorizontal,
    Plus,
    Search,
    Trash2,
    UserX,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

function timeAgo(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function getInitialsFromName(name: string): string {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function SortHeader({
    column,
    children,
    sort,
    direction,
    onSort,
}: {
    column: string;
    children: ReactNode;
    sort?: string;
    direction?: string;
    onSort: (col: string) => void;
}) {
    return (
        <button
            onClick={() => onSort(column)}
            className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none"
        >
            {children}
            {sort === column && (
                <ChevronDown
                    className={cn(
                        'size-3 transition-transform',
                        direction === 'desc' && 'rotate-180',
                    )}
                />
            )}
        </button>
    );
}

function SignupBadge({ google }: { google: boolean }) {
    return google ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
            <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
            </svg>
            Google
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            <Mail className="size-3.5" aria-hidden="true" />
            Email
        </span>
    );
}

interface UsersIndexProps {
    users: PaginatedData<AdminUser>;
    roles: Role[];
    filters: {
        search?: string;
        role?: string;
        signup?: string;
        sort?: string;
        direction?: 'asc' | 'desc';
    };
}

function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Delete',
    processing,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    processing: boolean;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{message}</p>
                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={processing}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={processing}
                        className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                        {processing && <Loader2 className="size-4 animate-spin" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Pagination({ links, from, to, total }: { links: PaginationLink[]; from: number | null; to: number | null; total: number }) {
    if (total <= 0) return null;

    const prev = links.find((l) => l.label.includes('Previous'));
    const next = links.find((l) => l.label.includes('Next'));

    return (
        <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
                {from && to ? (
                    <>
                        Showing <span className="font-medium text-foreground">{from}</span> to{' '}
                        <span className="font-medium text-foreground">{to}</span> of{' '}
                        <span className="font-medium text-foreground">{total}</span>
                    </>
                ) : (
                    'No results'
                )}
            </p>
            <div className="flex items-center gap-1">
                {prev?.url && (
                    <Link
                        href={prev.url}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                        preserveScroll
                    >
                        <ChevronLeft className="size-4" />
                    </Link>
                )}
                {next?.url && (
                    <Link
                        href={next.url}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                        preserveScroll
                    >
                        <ChevronRight className="size-4" />
                    </Link>
                )}
            </div>
        </div>
    );
}

export default function UsersIndex({ users, roles, filters }: UsersIndexProps) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<number | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const updateFilters = useCallback(
        (params: Record<string, string | undefined>) => {
            const query = {
                search: params.search ?? filters.search,
                role: 'role' in params ? params.role : filters.role,
                signup: 'signup' in params ? params.signup : filters.signup,
                sort: params.sort ?? filters.sort,
                direction: params.direction ?? filters.direction,
            };

            // Remove empty values
            const cleaned = Object.fromEntries(
                Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
            );

            router.get('/admin/users', cleaned, {
                preserveState: true,
                preserveScroll: true,
            });
        },
        [filters],
    );

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            updateFilters({ search });
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const handleSort = (column: string) => {
        const dir =
            filters.sort === column && filters.direction === 'asc' ? 'desc' : 'asc';
        updateFilters({ sort: column, direction: dir });
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        setDeleting(true);
        router.delete(`/admin/users/${deleteTarget.id}`, {
            preserveScroll: true,
            onFinish: () => {
                setDeleting(false);
                setDeleteTarget(null);
            },
        });
    };

    return (
        <>
            <Head title="Users" />

            <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">Users</h2>
                        <p className="text-sm text-muted-foreground">
                            {users.total} user{users.total !== 1 ? 's' : ''} total
                        </p>
                    </div>
                    <Link
                        href="/admin/users/create"
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Plus className="size-4" />
                        Add User
                    </Link>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search users…"
                            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </div>
                    <select
                        value={filters.role ?? ''}
                        onChange={(e) => updateFilters({ role: e.target.value || undefined })}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="">All roles</option>
                        {roles.map((role) => (
                            <option key={role.id} value={role.slug}>
                                {role.name}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Sign-up method"
                        value={filters.signup ?? ''}
                        onChange={(e) => updateFilters({ signup: e.target.value || undefined })}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="">All sign-up methods</option>
                        <option value="google">Google account</option>
                        <option value="email">Email (direct)</option>
                    </select>
                </div>

                {/* Desktop table */}
                <div className="hidden rounded-2xl border border-border bg-card shadow-sm md:block">
                    {users.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <UserX className="mb-3 size-10 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No users found</p>
                            <p className="text-xs text-muted-foreground/70">
                                Try adjusting your search or filter
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="px-5 py-3 text-left">
                                            <SortHeader column="name" sort={filters.sort} direction={filters.direction} onSort={handleSort}>Name</SortHeader>
                                        </th>
                                        <th className="px-5 py-3 text-left">
                                            <SortHeader column="email" sort={filters.sort} direction={filters.direction} onSort={handleSort}>Email</SortHeader>
                                        </th>
                                        <th className="px-5 py-3 text-left">
                                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                                Sign-up
                                            </span>
                                        </th>
                                        <th className="px-5 py-3 text-left">
                                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                                Age
                                            </span>
                                        </th>
                                        <th className="px-5 py-3 text-left">
                                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                                Last school
                                            </span>
                                        </th>
                                        <th className="px-5 py-3 text-left">
                                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                                Roles
                                            </span>
                                        </th>
                                        <th className="px-5 py-3 text-left">
                                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                                Status
                                            </span>
                                        </th>
                                        <th className="px-5 py-3 text-left">
                                            <SortHeader column="created_at" sort={filters.sort} direction={filters.direction} onSort={handleSort}>Joined</SortHeader>
                                        </th>
                                        <th className="px-5 py-3 text-right">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {users.data.map((user) => (
                                        <tr
                                            key={user.id}
                                            className="transition-colors hover:bg-muted/50"
                                        >
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                        {user.avatar_url ? (
                                                            <img
                                                                src={user.avatar_url}
                                                                alt=""
                                                                className="size-full rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            getInitialsFromName(user.name)
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <Link
                                                            href={`/admin/users/${user.id}`}
                                                            className="font-medium text-foreground hover:text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                        >
                                                            {user.name}
                                                        </Link>
                                                        {user.is_superadmin && (
                                                            <span className="text-xs text-bubble-purple">
                                                                Superadmin
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-muted-foreground">
                                                {user.email}
                                            </td>
                                            <td className="px-5 py-3 whitespace-nowrap">
                                                <SignupBadge google={Boolean(user.signed_up_with_google)} />
                                            </td>
                                            <td className="px-5 py-3 whitespace-nowrap text-foreground tabular-nums">
                                                {user.player_profile?.age ?? '—'}
                                            </td>
                                            <td
                                                className="max-w-56 truncate px-5 py-3 text-foreground"
                                                title={user.player_profile?.school_name ?? undefined}
                                            >
                                                {user.player_profile?.school_name ?? '—'}
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {user.roles?.length ? (
                                                        user.roles.map((r) => (
                                                            <span
                                                                key={r.id}
                                                                className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                                                            >
                                                                {r.name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">
                                                            No roles
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                                        user.status === 'active'
                                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                            : user.status === 'suspended'
                                                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                              : 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'size-1.5 rounded-full',
                                                            user.status === 'active'
                                                                ? 'bg-green-500'
                                                                : user.status === 'suspended'
                                                                  ? 'bg-red-500'
                                                                  : 'bg-gray-400',
                                                        )}
                                                    />
                                                    {user.status ?? 'active'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-muted-foreground">
                                                {timeAgo(user.created_at)}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <div className="relative inline-block">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenDropdown(
                                                                openDropdown === user.id ? null : user.id,
                                                            );
                                                        }}
                                                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        aria-label="Actions"
                                                    >
                                                        <MoreHorizontal className="size-4" />
                                                    </button>
                                                    {openDropdown === user.id && (
                                                        <>
                                                            <div
                                                                className="fixed inset-0 z-40"
                                                                onClick={() => setOpenDropdown(null)}
                                                            />
                                                            <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border bg-popover py-1 shadow-lg">
                                                                <Link
                                                                    href={`/admin/users/${user.id}`}
                                                                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                                                                    onClick={() => setOpenDropdown(null)}
                                                                >
                                                                    <Eye className="size-4" />
                                                                    View
                                                                </Link>
                                                                <Link
                                                                    href={`/admin/users/${user.id}/edit`}
                                                                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                                                                    onClick={() => setOpenDropdown(null)}
                                                                >
                                                                    <Edit className="size-4" />
                                                                    Edit
                                                                </Link>
                                                                <button
                                                                    onClick={() => {
                                                                        setOpenDropdown(null);
                                                                        setDeleteTarget(user);
                                                                    }}
                                                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
                                                                >
                                                                    <Trash2 className="size-4" />
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Mobile card layout */}
                <div className="flex flex-col gap-3 md:hidden">
                    {users.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center">
                            <UserX className="mb-3 size-10 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No users found</p>
                        </div>
                    ) : (
                        users.data.map((user) => (
                            <div
                                key={user.id}
                                className="rounded-xl border border-border bg-card p-4 shadow-sm"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                            {user.avatar_url ? (
                                                <img
                                                    src={user.avatar_url}
                                                    alt=""
                                                    className="size-full rounded-full object-cover"
                                                />
                                            ) : (
                                                getInitialsFromName(user.name)
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <Link
                                                href={`/admin/users/${user.id}`}
                                                className="font-medium text-foreground hover:text-primary hover:underline"
                                            >
                                                {user.name}
                                            </Link>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                            <div className="mt-1">
                                                <SignupBadge google={Boolean(user.signed_up_with_google)} />
                                            </div>
                                            {user.player_profile?.school_name && (
                                                <p className="text-xs text-muted-foreground">
                                                    {user.player_profile.age !== null ? `${user.player_profile.age} y · ` : ''}
                                                    {user.player_profile.school_name}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <span
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                            user.status === 'active'
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
                                        )}
                                    >
                                        <span
                                            className={`size-1.5 rounded-full ${user.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}
                                        />
                                        {user.status ?? 'active'}
                                    </span>
                                </div>

                                {user.roles && user.roles.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1">
                                        {user.roles.map((r) => (
                                            <span
                                                key={r.id}
                                                className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                                            >
                                                {r.name}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                                    <span className="text-xs text-muted-foreground">
                                        Joined {timeAgo(user.created_at)}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <Link
                                            href={`/admin/users/${user.id}`}
                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            aria-label="View user"
                                        >
                                            <Eye className="size-4" />
                                        </Link>
                                        <Link
                                            href={`/admin/users/${user.id}/edit`}
                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                            aria-label="Edit user"
                                        >
                                            <Edit className="size-4" />
                                        </Link>
                                        <button
                                            onClick={() => setDeleteTarget(user)}
                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                                            aria-label="Delete user"
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                <Pagination
                    links={users.links}
                    from={users.from}
                    to={users.to}
                    total={users.total}
                />
            </div>

            {/* Delete confirmation */}
            <ConfirmDialog
                open={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete user"
                message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
                processing={deleting}
            />
        </>
    );
}

UsersIndex.layout = (page: ReactNode) => (
    <AdminLayout title="Users">{page}</AdminLayout>
);
