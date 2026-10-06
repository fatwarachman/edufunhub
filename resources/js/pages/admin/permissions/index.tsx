import { tr } from '@/lib/admin-i18n';
import AdminLayout from '@/layouts/admin-layout';
import { ResponsiveTable } from '@/components/responsive-table';
import { type Permission, type Role } from '@/types/admin';
import { Head } from '@inertiajs/react';
import { cn } from '@/lib/utils';
import { ChevronDown, Lock, ShieldCheck } from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface PermissionsIndexProps {
    permissions: Permission[];
    roles: Role[];
}

function groupByModule(permissions: Permission[]): Record<string, Permission[]> {
    return permissions.reduce(
        (acc, perm) => {
            const module = perm.module || 'General';
            if (!acc[module]) acc[module] = [];
            acc[module].push(perm);
            return acc;
        },
        {} as Record<string, Permission[]>,
    );
}

function ModuleSection({
    moduleName,
    perms,
    roles,
    defaultOpen,
}: {
    moduleName: string;
    perms: Permission[];
    roles: Role[];
    defaultOpen: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const panelId = `permissions-${moduleName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-expanded={open}
                aria-controls={panelId}
            >
                <div className="flex items-center gap-2">
                    <Lock className="size-4 text-muted-foreground" />
                    <span className="font-semibold capitalize text-foreground">{moduleName}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        {perms.length}
                    </span>
                </div>
                <ChevronDown
                    className={cn(
                        'size-4 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none',
                        open && 'rotate-180',
                    )}
                    aria-hidden="true"
                />
            </button>

            <div
                id={panelId}
                className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                    open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
                aria-hidden={!open}
                inert={!open}
            >
                <div className="min-h-0 overflow-hidden">
                <div className="border-t border-border">
                    <ResponsiveTable
                        className="[&>ul]:m-3 [&>ul]:w-auto"
                        rows={perms}
                        rowKey={(perm) => perm.id}
                        columns={[
                            {
                                key: 'permission',
                                header: tr("Permission"),
                                primary: true,
                                cell: (perm) => (
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground">{perm.name}</p>
                                        {perm.description && (
                                            <p className="text-xs font-normal text-muted-foreground">{tr(perm.description)}</p>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                key: 'slug',
                                header: tr("Slug"),
                                cell: (perm) => (
                                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground [overflow-wrap:anywhere]">
                                        {perm.slug}
                                    </code>
                                ),
                            },
                            {
                                key: 'roles',
                                header: tr("Assigned to Roles"),
                                cell: (perm) => {
                                    const assignedRoles = roles.filter((r) =>
                                        r.permissions?.some((p) => p.id === perm.id),
                                    );
                                    return (
                                        <div className="flex flex-wrap justify-end gap-1 [table_&]:justify-start">
                                            {assignedRoles.length > 0 ? (
                                                assignedRoles.map((r) => (
                                                    <span
                                                        key={r.id}
                                                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                                                    >
                                                        <ShieldCheck className="size-2.5" />
                                                        {r.name}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-xs text-muted-foreground/60">
                                                    {tr("Not assigned")}
                                                </span>
                                            )}
                                        </div>
                                    );
                                },
                            },
                        ]}
                    />
                </div>
                </div>
            </div>
        </div>
    );
}

export default function PermissionsIndex({ permissions, roles }: PermissionsIndexProps) {
    const grouped = groupByModule(permissions);
    const modules = Object.keys(grouped);

    return (
        <>
            <Head title={tr("Permissions")} />

            <div className="space-y-4">
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">{tr("Permissions")}</h2>
                    <p className="text-sm text-muted-foreground">
                        {tr('{0} permission(s) across {1} module(s)', [permissions.length, modules.length])}
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    {modules.map((moduleName, i) => (
                        <ModuleSection
                            key={moduleName}
                            moduleName={moduleName}
                            perms={grouped[moduleName]}
                            roles={roles}
                            defaultOpen={i === 0}
                        />
                    ))}

                    {modules.length === 0 && (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
                            <Lock className="mb-3 size-10 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">{tr("No permissions defined")}</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

PermissionsIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr("Permissions")}>{page}</AdminLayout>
);
