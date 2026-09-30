import AdminLayout from '@/layouts/admin-layout';
import { type Permission, type Role } from '@/types/admin';
import { Head } from '@inertiajs/react';
import { ChevronDown, ChevronUp, Lock, ShieldCheck } from 'lucide-react';
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

    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-expanded={open}
            >
                <div className="flex items-center gap-2">
                    <Lock className="size-4 text-muted-foreground" />
                    <span className="font-semibold capitalize text-foreground">{moduleName}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        {perms.length}
                    </span>
                </div>
                {open ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                )}
            </button>

            {open && (
                <div className="border-t border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                        Permission
                                    </th>
                                    <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                        Slug
                                    </th>
                                    <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                        Assigned to Roles
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {perms.map((perm) => {
                                    const assignedRoles = roles.filter((r) =>
                                        r.permissions?.some((p) => p.id === perm.id),
                                    );

                                    return (
                                        <tr key={perm.id} className="hover:bg-muted/30">
                                            <td className="px-5 py-3">
                                                <p className="font-medium text-foreground">{perm.name}</p>
                                                {perm.description && (
                                                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                                                    {perm.slug}
                                                </code>
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex flex-wrap gap-1">
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
                                                            Not assigned
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PermissionsIndex({ permissions, roles }: PermissionsIndexProps) {
    const grouped = groupByModule(permissions);
    const modules = Object.keys(grouped);

    return (
        <>
            <Head title="Permissions" />

            <div className="space-y-4">
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">Permissions</h2>
                    <p className="text-sm text-muted-foreground">
                        {permissions.length} permission{permissions.length !== 1 ? 's' : ''} across {modules.length} module{modules.length !== 1 ? 's' : ''}
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
                            <p className="text-sm font-medium text-muted-foreground">No permissions defined</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

PermissionsIndex.layout = (page: ReactNode) => (
    <AdminLayout title="Permissions">{page}</AdminLayout>
);
