import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import {
    type PaginatedData,
    type PaginationLink,
    type Role,
} from '@/types/admin';
import { Head, Link, router } from '@inertiajs/react';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    Edit,
    KeyRound,
    Loader2,
    Lock,
    Plus,
    ShieldCheck,
    Trash2,
    Users,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface RolePermission {
    id: number;
    name: string;
    slug: string;
    module_id: number | null;
    module: { id: number; name: string } | null;
}

type RoleWithPermissions = Omit<Role, 'permissions'> & {
    permissions: RolePermission[];
};

interface RolesIndexProps {
    roles: PaginatedData<RoleWithPermissions>;
    totalPermissions: number;
}

const TILE_COLORS = [
    '#c7d2fe',
    '#bbf7d0',
    '#fde68a',
    '#fbcfe8',
    '#a5f3fc',
    '#fed7aa',
];

function groupByModule(
    permissions: RolePermission[],
): [string, RolePermission[]][] {
    const groups = new Map<string, RolePermission[]>();
    for (const permission of permissions) {
        const moduleName = permission.module?.name ?? 'General';
        groups.set(moduleName, [...(groups.get(moduleName) ?? []), permission]);
    }

    return [...groups.entries()].sort(([a], [b]) => tr(a).localeCompare(tr(b)));
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

function RoleItem({
    role,
    color,
    open,
    totalPermissions,
    onToggle,
    onDelete,
}: {
    role: RoleWithPermissions;
    color: string;
    open: boolean;
    totalPermissions: number;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const panelId = `role-permissions-${role.id}`;
    const groups = groupByModule(role.permissions);
    const coverage =
        totalPermissions > 0
            ? Math.round((role.permissions_count / totalPermissions) * 100)
            : 0;

    return (
        <li
            data-testid={`role-item-${role.slug}`}
            className={cn(
                'overflow-hidden rounded-2xl border-2 border-[#1f2a44] bg-card transition-shadow dark:border-white/20 dark:shadow-none',
                open
                    ? 'shadow-[4px_4px_0_#1f2a44]'
                    : 'shadow-[2px_2px_0_#1f2a44]',
            )}
        >
            <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:p-4">
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    aria-controls={panelId}
                    data-testid={`role-toggle-${role.slug}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                    <ChevronRight
                        className={cn(
                            'size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none',
                            open && 'rotate-90',
                        )}
                        aria-hidden="true"
                    />
                    <span
                        className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-[#1f2a44] shadow-[2px_2px_0_#1f2a44]"
                        style={{ background: color }}
                        aria-hidden="true"
                    >
                        <ShieldCheck className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-foreground">
                            <span className="min-w-0 break-words">
                                {role.name}
                            </span>
                            {role.is_system && (
                                <span
                                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                                    title={tr(
                                        'System roles cannot be edited or deleted.',
                                    )}
                                >
                                    <Lock className="size-3" />
                                    {tr('System')}
                                </span>
                            )}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                {role.slug}
                            </code>
                            <span className="inline-flex items-center gap-1">
                                <Users className="size-3.5" />
                                {tr('{0} user(s)', [role.users_count])}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <KeyRound className="size-3.5" />
                                {tr('{0} of {1} permissions', [
                                    role.permissions_count,
                                    totalPermissions,
                                ])}
                            </span>
                        </span>
                        {role.description && (
                            <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                                {tr(role.description)}
                            </span>
                        )}
                    </span>
                </button>

                <div className="flex w-full items-center gap-3 sm:w-auto">
                    <div
                        className="flex flex-1 items-center gap-2 sm:w-28 sm:flex-none"
                        aria-hidden="true"
                    >
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${coverage}%` }}
                            />
                        </div>
                        <span className="w-9 text-right text-xs font-medium text-muted-foreground tabular-nums">
                            {coverage}%
                        </span>
                    </div>
                    {!role.is_system && (
                        <div className="flex items-center gap-1">
                            <Link
                                href={`/admin/roles/${role.id}/edit`}
                                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                aria-label={tr('Edit')}
                                title={tr('Edit')}
                            >
                                <Edit className="size-4" />
                            </Link>
                            <button
                                type="button"
                                onClick={onDelete}
                                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                aria-label={tr('Delete')}
                                title={tr('Delete')}
                            >
                                <Trash2 className="size-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div
                id={panelId}
                className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                    open
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0',
                )}
                aria-hidden={!open}
                inert={!open}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="border-t-2 border-dashed border-border p-3 sm:p-4">
                        {groups.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">
                                {tr('No permissions assigned')}
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {groups.map(([moduleName, permissions]) => (
                                    <section
                                        key={moduleName}
                                        className="rounded-xl border border-border bg-muted/30 p-3"
                                    >
                                        <h4 className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                                            <span className="truncate capitalize">
                                                {tr(moduleName)}
                                            </span>
                                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                                                {permissions.length}
                                            </span>
                                        </h4>
                                        <ul className="flex flex-wrap gap-1.5">
                                            {permissions.map((permission) => (
                                                <li
                                                    key={permission.id}
                                                    title={permission.slug}
                                                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground"
                                                >
                                                    <KeyRound className="size-3 text-muted-foreground" />
                                                    {permission.name}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
}

export default function RolesIndex({
    roles,
    totalPermissions,
}: RolesIndexProps) {
    const [deleteTarget, setDeleteTarget] =
        useState<RoleWithPermissions | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [expanded, setExpanded] = useState<Set<number>>(
        () => new Set(roles.data.slice(0, 1).map((role) => role.id)),
    );

    const allOpen =
        roles.data.length > 0 &&
        roles.data.every((role) => expanded.has(role.id));

    const toggle = (id: number) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleAll = () => {
        setExpanded(
            allOpen ? new Set() : new Set(roles.data.map((role) => role.id)),
        );
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        setDeleting(true);
        router.delete(`/admin/roles/${deleteTarget.id}`, {
            preserveScroll: true,
            onFinish: () => {
                setDeleting(false);
                setDeleteTarget(null);
            },
        });
    };

    return (
        <>
            <Head title={tr('Roles')} />

            <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">
                            {tr('Roles')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {tr('{0} role(s)', [roles.total])}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {roles.data.length > 0 && (
                            <button
                                type="button"
                                onClick={toggleAll}
                                data-testid="roles-toggle-all"
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                {allOpen ? (
                                    <ChevronsDownUp className="size-4" />
                                ) : (
                                    <ChevronsUpDown className="size-4" />
                                )}
                                {allOpen
                                    ? tr('Collapse all')
                                    : tr('Expand all')}
                            </button>
                        )}
                        <Link
                            href="/admin/roles/create"
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <Plus className="size-4" />
                            {tr('Create Role')}
                        </Link>
                    </div>
                </div>

                {roles.data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
                        <ShieldCheck className="mb-3 size-10 text-muted-foreground/30" />
                        <p className="text-sm font-medium text-muted-foreground">
                            {tr('No roles yet')}
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                            {tr('Create the first role to get started')}
                        </p>
                    </div>
                ) : (
                    <ul className="flex flex-col gap-3" data-testid="role-list">
                        {roles.data.map((role, index) => (
                            <RoleItem
                                key={role.id}
                                role={role}
                                color={TILE_COLORS[index % TILE_COLORS.length]}
                                open={expanded.has(role.id)}
                                totalPermissions={totalPermissions}
                                onToggle={() => toggle(role.id)}
                                onDelete={() => setDeleteTarget(role)}
                            />
                        ))}
                    </ul>
                )}

                <Pagination
                    links={roles.links}
                    from={roles.from}
                    to={roles.to}
                    total={roles.total}
                />
            </div>

            {/* Delete confirmation */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="fixed inset-0 bg-black/50"
                        onClick={() => setDeleteTarget(null)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-foreground">
                            {tr('Delete role')}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {tr('Are you sure you want to delete')}{' '}
                            <strong>{deleteTarget.name}</strong>?
                            {deleteTarget.users_count > 0 && (
                                <>
                                    {' '}
                                    {tr(
                                        'This role is assigned to {0} user(s).',
                                        [deleteTarget.users_count],
                                    )}
                                </>
                            )}
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                                disabled={deleting}
                            >
                                {tr('Cancel')}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                            >
                                {deleting && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {tr('Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

RolesIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Roles')}>{page}</AdminLayout>
);
