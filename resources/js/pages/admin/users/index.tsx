import { BadgeChips } from '@/components/badges';
import { gameLabel } from '@/components/admin/game-stats';
import { OnlineDot } from '@/components/online-dot';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import {
    type AdminUser,
    type PaginatedData,
    type PaginationLink,
    type Role,
} from '@/types/admin';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Edit,
    Eye,
    Gamepad2,
    Globe,
    Loader2,
    LogIn,
    Mail,
    Megaphone,
    MoreHorizontal,
    Plus,
    Search,
    Trash2,
    UserX,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

function timeAgo(dateStr: string | null | undefined): string {
    if (!dateStr) return tr('Never');
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return tr('Just now');
    if (mins < 60) return tr('{0}m ago', [mins]);
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return tr('{0}h ago', [hrs]);
    return tr('{0}d ago', [Math.floor(hrs / 24)]);
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
            className="flex items-center gap-1 text-xs font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground focus-visible:outline-none"
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
                <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
                />
                <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
                />
                <path
                    fill="#FBBC05"
                    d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
                />
                <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
                />
            </svg>
            {tr('Google')}
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            <Mail className="size-3.5" aria-hidden="true" />
            {tr('Email')}
        </span>
    );
}

interface UsersIndexProps {
    users: PaginatedData<AdminUser>;
    roles: Role[];
    canImpersonate: boolean;
    viewerIsSuperadmin: boolean;
    filters: {
        search?: string;
        role?: string;
        signup?: string;
        activity?: string;
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
    tone = 'danger',
    processing,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    tone?: 'danger' | 'primary';
    processing: boolean;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-foreground">
                    {tr(title)}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    {tr(message)}
                </p>
                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        disabled={processing}
                    >
                        {tr('Cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={processing}
                        className={cn(
                            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
                            tone === 'danger'
                                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90',
                        )}
                        data-testid="confirm-dialog-confirm"
                    >
                        {processing && (
                            <Loader2 className="size-4 animate-spin" />
                        )}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Pagination({
    links,
    from,
    to,
    total,
}: {
    links: PaginationLink[];
    from: number | null;
    to: number | null;
    total: number;
}) {
    if (total <= 0) return null;

    const prev = links.find((l) => l.label.includes('Previous'));
    const next = links.find((l) => l.label.includes('Next'));

    return (
        <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
                {from && to ? (
                    <>
                        {tr('Showing')}{' '}
                        <span className="font-medium text-foreground">
                            {from}
                        </span>{' '}
                        {tr('to')}{' '}
                        <span className="font-medium text-foreground">
                            {to}
                        </span>{' '}
                        {tr('of')}{' '}
                        <span className="font-medium text-foreground">
                            {total}
                        </span>
                    </>
                ) : (
                    tr('No results')
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

export default function UsersIndex({
    users,
    roles,
    filters,
    canImpersonate,
    viewerIsSuperadmin,
}: UsersIndexProps) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<number | null>(null);
    const [impersonateTarget, setImpersonateTarget] =
        useState<AdminUser | null>(null);
    const [impersonating, setImpersonating] = useState(false);
    const { auth } = usePage<SharedData>().props;
    const canLoginAs = (user: AdminUser) =>
        canImpersonate &&
        user.id !== auth.user.id &&
        !user.disabled_at &&
        (viewerIsSuperadmin || !user.is_superadmin);
    const handleImpersonate = () => {
        if (!impersonateTarget) return;
        router.post(
            `/admin/impersonate/${impersonateTarget.id}`,
            {},
            {
                onStart: () => setImpersonating(true),
                onFinish: () => {
                    setImpersonating(false);
                    setImpersonateTarget(null);
                },
            },
        );
    };
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const updateFilters = useCallback(
        (params: Record<string, string | undefined>) => {
            const query = {
                search: params.search ?? filters.search,
                role: 'role' in params ? params.role : filters.role,
                signup: 'signup' in params ? params.signup : filters.signup,
                activity:
                    'activity' in params ? params.activity : filters.activity,
                sort: params.sort ?? filters.sort,
                direction: params.direction ?? filters.direction,
            };

            // Remove empty values
            const cleaned = Object.fromEntries(
                Object.entries(query).filter(
                    ([, v]) => v !== undefined && v !== '',
                ),
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
            filters.sort === column && filters.direction === 'asc'
                ? 'desc'
                : 'asc';
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
            <Head title={tr('Users')} />

            <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">
                            {tr('Users')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {tr(
                                users.total === 1
                                    ? '{0} user total'
                                    : '{0} users total',
                                [users.total],
                            )}
                        </p>
                    </div>
                    <Link
                        href="/admin/users/create"
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <Plus className="size-4" />
                        {tr('Add User')}
                    </Link>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tr('Search users…')}
                            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        />
                    </div>
                    <select
                        value={filters.role ?? ''}
                        onChange={(e) =>
                            updateFilters({ role: e.target.value || undefined })
                        }
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <option value="">{tr('All roles')}</option>
                        {roles.map((role) => (
                            <option key={role.id} value={role.slug}>
                                {role.name}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={tr('Sign-up method')}
                        value={filters.signup ?? ''}
                        onChange={(e) =>
                            updateFilters({
                                signup: e.target.value || undefined,
                            })
                        }
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <option value="">{tr('All sign-up methods')}</option>
                        <option value="google">{tr('Google account')}</option>
                        <option value="email">{tr('Email (direct)')}</option>
                    </select>
                    <select
                        aria-label={tr('Activity')}
                        value={filters.activity ?? ''}
                        onChange={(e) =>
                            updateFilters({
                                activity: e.target.value || undefined,
                            })
                        }
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        data-testid="users-activity-filter"
                    >
                        <option value="">{tr('All activity')}</option>
                        <option value="joined_today">
                            {tr('Joined today')}
                        </option>
                        <option value="online">{tr('Online now')}</option>
                    </select>
                </div>

                <div className="rounded-2xl border border-border bg-card shadow-sm">
                    <ResponsiveTable
                        testId="users-table"
                        rows={users.data}
                        rowKey={(user) => user.id}
                        empty={
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <UserX className="mb-3 size-10 text-muted-foreground/30" />
                                <p className="text-sm font-medium text-muted-foreground">
                                    {tr('No users found')}
                                </p>
                                <p className="text-xs text-muted-foreground/70">
                                    {tr('Try adjusting your search or filter')}
                                </p>
                            </div>
                        }
                        actions={(user) => (
                            <>
                                <Link
                                    href={`/admin/users/${user.id}`}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                                    aria-label={tr('View user')}
                                >
                                    <Eye className="size-3.5" />
                                    {tr('View')}
                                </Link>
                                <Link
                                    href={`/admin/users/${user.id}/edit`}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                                    aria-label={tr('Edit user')}
                                >
                                    <Edit className="size-3.5" />
                                    {tr('Edit')}
                                </Link>
                                {viewerIsSuperadmin && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.patch(
                                                `/admin/ads/users/${user.id}`,
                                                {
                                                    ads_disabled:
                                                        !user.ads_disabled,
                                                },
                                                { preserveScroll: true },
                                            )
                                        }
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                                    >
                                        <Megaphone className="size-3.5" />
                                        {user.ads_disabled
                                            ? tr('Show ads')
                                            : tr('Hide ads')}
                                    </button>
                                )}
                                {canLoginAs(user) && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setImpersonateTarget(user)
                                        }
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                                        aria-label={tr('Login as {0}', [
                                            user.name,
                                        ])}
                                    >
                                        <LogIn className="size-3.5" />
                                        {tr('Login as')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setDeleteTarget(user)}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-destructive hover:bg-accent"
                                    aria-label={tr('Delete user')}
                                >
                                    <Trash2 className="size-3.5" />
                                    {tr('Delete')}
                                </button>
                            </>
                        )}
                        columns={[
                            {
                                key: 'name',
                                header: (
                                    <SortHeader
                                        column="name"
                                        sort={filters.sort}
                                        direction={filters.direction}
                                        onSort={handleSort}
                                    >
                                        {tr('Name')}
                                    </SortHeader>
                                ),
                                label: tr('Name'),
                                primary: true,
                                cellClassName: 'min-w-48',
                                cell: (user) => (
                                    <div className="flex items-center gap-3">
                                        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                            {user.avatar_url ? (
                                                <img
                                                    src={user.avatar_url}
                                                    alt=""
                                                    className="size-full rounded-full object-cover"
                                                />
                                            ) : (
                                                getInitialsFromName(user.name)
                                            )}
                                            <OnlineDot
                                                userId={user.id}
                                                className="edu-online-dot--round"
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <Link
                                                href={`/admin/users/${user.id}`}
                                                className="font-medium text-foreground hover:text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                {user.name}
                                            </Link>
                                            {user.is_superadmin && (
                                                <span className="block text-xs text-bubble-purple">
                                                    {tr('Superadmin')}
                                                </span>
                                            )}
                                            {(user.badges?.length ?? 0) > 0 && (
                                                <div className="mt-1">
                                                    <BadgeChips
                                                        badges={
                                                            user.badges ?? []
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                key: 'email',
                                header: (
                                    <SortHeader
                                        column="email"
                                        sort={filters.sort}
                                        direction={filters.direction}
                                        onSort={handleSort}
                                    >
                                        {tr('Email')}
                                    </SortHeader>
                                ),
                                label: tr('Email'),
                                cellClassName: 'text-muted-foreground',
                                cell: (user) => (
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        <span>
                                            {user.email.split('@')[0]}
                                            <wbr />@{user.email.split('@')[1]}
                                        </span>
                                        {user.ads_disabled && (
                                            <span
                                                className="inline-flex items-center rounded-full border border-border px-1.5 text-[11px] font-medium text-muted-foreground"
                                                title={tr(
                                                    'Ads hidden for this user',
                                                )}
                                            >
                                                {tr('No ads')}
                                            </span>
                                        )}
                                    </span>
                                ),
                            },
                            {
                                key: 'signup',
                                header: tr('Sign-up'),
                                cellClassName: 'whitespace-nowrap',
                                cell: (user) => (
                                    <SignupBadge
                                        google={Boolean(
                                            user.signed_up_with_google,
                                        )}
                                    />
                                ),
                            },
                            {
                                key: 'age',
                                header: tr('Age'),
                                cellClassName:
                                    'whitespace-nowrap text-foreground tabular-nums',
                                cell: (user) => user.player_profile?.age ?? '—',
                            },
                            {
                                key: 'school',
                                header: tr('Last school'),
                                cellClassName: 'max-w-56 text-foreground',
                                cell: (user) => (
                                    <span
                                        className="line-clamp-2"
                                        title={
                                            user.player_profile?.school_name ??
                                            undefined
                                        }
                                    >
                                        {user.player_profile?.school_name ??
                                            '—'}
                                    </span>
                                ),
                            },
                            {
                                key: 'roles',
                                header: tr('Roles'),
                                cell: (user) => (
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
                                            <span className="text-xs whitespace-nowrap text-muted-foreground">
                                                {tr('No roles')}
                                            </span>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                key: 'status',
                                header: tr('Status'),
                                summary: true,
                                cell: (user) => (
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
                                                    : user.status ===
                                                        'suspended'
                                                      ? 'bg-red-500'
                                                      : 'bg-gray-400',
                                            )}
                                        />
                                        {user.status ?? 'active'}
                                    </span>
                                ),
                            },
                            ...(filters.activity === 'online'
                                ? [
                                      {
                                          key: 'current_activity' as const,
                                          header: tr('Current activity'),
                                          summary: true,
                                          cellClassName:
                                              'whitespace-nowrap',
                                          cell: (user: AdminUser) =>
                                              user.current_game ? (
                                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                                      <Gamepad2
                                                          className="size-3"
                                                          aria-hidden="true"
                                                      />
                                                      {gameLabel(
                                                          user.current_game,
                                                      )}
                                                  </span>
                                              ) : (
                                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                                                      <Globe
                                                          className="size-3"
                                                          aria-hidden="true"
                                                      />
                                                      {tr('Browsing portal')}
                                                  </span>
                                              ),
                                      },
                                  ]
                                : []),
                            {
                                key: 'joined',
                                header: (
                                    <SortHeader
                                        column="created_at"
                                        sort={filters.sort}
                                        direction={filters.direction}
                                        onSort={handleSort}
                                    >
                                        {tr('Joined')}
                                    </SortHeader>
                                ),
                                label: tr('Joined'),
                                summary: true,
                                cellClassName:
                                    'whitespace-nowrap text-muted-foreground',
                                cell: (user) => timeAgo(user.created_at),
                            },
                            {
                                key: 'actions',
                                header: (
                                    <span className="sr-only">
                                        {tr('Actions')}
                                    </span>
                                ),
                                align: 'right',
                                hideInAccordion: true,
                                cell: (user) => (
                                    <div className="relative inline-block">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDropdown(
                                                    openDropdown === user.id
                                                        ? null
                                                        : user.id,
                                                );
                                            }}
                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            aria-label={tr('Actions')}
                                        >
                                            <MoreHorizontal className="size-4" />
                                        </button>
                                        {openDropdown === user.id && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() =>
                                                        setOpenDropdown(null)
                                                    }
                                                />
                                                <div className="absolute top-full right-0 z-50 mt-1 w-44 rounded-lg border border-border bg-popover py-1 shadow-lg">
                                                    <Link
                                                        href={`/admin/users/${user.id}`}
                                                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                                                        onClick={() =>
                                                            setOpenDropdown(
                                                                null,
                                                            )
                                                        }
                                                    >
                                                        <Eye className="size-4" />
                                                        {tr('View')}
                                                    </Link>
                                                    <Link
                                                        href={`/admin/users/${user.id}/edit`}
                                                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                                                        onClick={() =>
                                                            setOpenDropdown(
                                                                null,
                                                            )
                                                        }
                                                    >
                                                        <Edit className="size-4" />
                                                        {tr('Edit')}
                                                    </Link>
                                                    {viewerIsSuperadmin && (
                                                        <button
                                                            onClick={() => {
                                                                setOpenDropdown(
                                                                    null,
                                                                );
                                                                router.patch(
                                                                    `/admin/ads/users/${user.id}`,
                                                                    {
                                                                        ads_disabled:
                                                                            !user.ads_disabled,
                                                                    },
                                                                    {
                                                                        preserveScroll: true,
                                                                    },
                                                                );
                                                            }}
                                                            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                                                            data-testid={`user-ads-${user.id}`}
                                                        >
                                                            <Megaphone className="size-4" />
                                                            {user.ads_disabled
                                                                ? tr('Show ads')
                                                                : tr(
                                                                      'Hide ads',
                                                                  )}
                                                        </button>
                                                    )}
                                                    {canLoginAs(user) && (
                                                        <button
                                                            onClick={() => {
                                                                setOpenDropdown(
                                                                    null,
                                                                );
                                                                setImpersonateTarget(
                                                                    user,
                                                                );
                                                            }}
                                                            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                                                            data-testid={`user-login-as-${user.id}`}
                                                        >
                                                            <LogIn className="size-4" />
                                                            {tr('Login as')}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            setOpenDropdown(
                                                                null,
                                                            );
                                                            setDeleteTarget(
                                                                user,
                                                            );
                                                        }}
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
                                                    >
                                                        <Trash2 className="size-4" />
                                                        {tr('Delete')}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ),
                            },
                        ]}
                    />
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
                title={tr('Delete user')}
                message={tr(
                    'Are you sure you want to delete "{0}"? This action cannot be undone.',
                    [deleteTarget?.name],
                )}
                processing={deleting}
            />

            <ConfirmDialog
                open={impersonateTarget !== null}
                onClose={() => setImpersonateTarget(null)}
                onConfirm={handleImpersonate}
                title={tr('Login as user')}
                message={tr(
                    'You will browse EduFunHub as "{0}" ({1}). Every action is recorded in the impersonation log. Use "Leave" in the red bar to return to your account.',
                    [impersonateTarget?.name, impersonateTarget?.email],
                )}
                confirmLabel={tr('Login as')}
                tone="primary"
                processing={impersonating}
            />
        </>
    );
}

UsersIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Users')}>{page}</AdminLayout>
);
