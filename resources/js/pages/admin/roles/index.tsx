import AdminLayout from '@/layouts/admin-layout';
import { type PaginatedData, type PaginationLink, type Role } from '@/types/admin';
import { Head, Link, router } from '@inertiajs/react';
import {
    ChevronLeft,
    ChevronRight,
    Edit,
    Loader2,
    MoreHorizontal,
    Plus,
    ShieldCheck,
    Trash2,
    Users,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface RolesIndexProps {
    roles: PaginatedData<Role>;
}

function Pagination({ links, from, to, total }: { links: PaginationLink[]; from: number | null; to: number | null; total: number }) {
    if (total <= 0) return null;
    const prev = links.find((l) => l.label.includes('Previous'));
    const next = links.find((l) => l.label.includes('Next'));
    return (
        <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
                {from && to ? (
                    <>Showing <span className="font-medium text-foreground">{from}</span> to <span className="font-medium text-foreground">{to}</span> of <span className="font-medium text-foreground">{total}</span></>
                ) : 'No results'}
            </p>
            <div className="flex items-center gap-1">
                {prev?.url && <Link href={prev.url} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" preserveScroll><ChevronLeft className="size-4" /></Link>}
                {next?.url && <Link href={next.url} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" preserveScroll><ChevronRight className="size-4" /></Link>}
            </div>
        </div>
    );
}

export default function RolesIndex({ roles }: RolesIndexProps) {
    const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<number | null>(null);

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
            <Head title="Roles" />

            <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">Roles</h2>
                        <p className="text-sm text-muted-foreground">{roles.total} role{roles.total !== 1 ? 's' : ''}</p>
                    </div>
                    <Link
                        href="/admin/roles/create"
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Plus className="size-4" />
                        Create Role
                    </Link>
                </div>

                {/* Roles list */}
                {roles.data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
                        <ShieldCheck className="mb-3 size-10 text-muted-foreground/30" />
                        <p className="text-sm font-medium text-muted-foreground">No roles yet</p>
                        <p className="text-xs text-muted-foreground/70">Create the first role to get started</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {roles.data.map((role) => (
                            <div
                                key={role.id}
                                className="group relative flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="flex size-9 items-center justify-center rounded-xl bg-secondary">
                                            <ShieldCheck className="size-4 text-secondary-foreground" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-foreground">{role.name}</h3>
                                            {role.is_system && (
                                                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                                                    System
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDropdown(openDropdown === role.id ? null : role.id);
                                            }}
                                            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none"
                                            aria-label="Actions"
                                        >
                                            <MoreHorizontal className="size-4" />
                                        </button>
                                        {openDropdown === role.id && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
                                                <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-border bg-popover py-1 shadow-lg">
                                                    <Link
                                                        href={`/admin/roles/${role.id}/edit`}
                                                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                                                        onClick={() => setOpenDropdown(null)}
                                                    >
                                                        <Edit className="size-4" /> Edit
                                                    </Link>
                                                    {!role.is_system && (
                                                        <button
                                                            onClick={() => {
                                                                setOpenDropdown(null);
                                                                setDeleteTarget(role);
                                                            }}
                                                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
                                                        >
                                                            <Trash2 className="size-4" /> Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {role.description && (
                                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                        {role.description}
                                    </p>
                                )}

                                <div className="mt-auto flex items-center gap-4 pt-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <Users className="size-3" />
                                        {role.users_count} user{role.users_count !== 1 ? 's' : ''}
                                    </span>
                                    <span>{role.permissions_count} permission{role.permissions_count !== 1 ? 's' : ''}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <Pagination links={roles.links} from={roles.from} to={roles.to} total={roles.total} />
            </div>

            {/* Delete confirmation */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-foreground">Delete role</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
                            {deleteTarget.users_count > 0 && (
                                <> This role is assigned to {deleteTarget.users_count} user{deleteTarget.users_count !== 1 ? 's' : ''}.</>
                            )}
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button onClick={() => setDeleteTarget(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" disabled={deleting}>Cancel</button>
                            <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                                {deleting && <Loader2 className="size-4 animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

RolesIndex.layout = (page: ReactNode) => (
    <AdminLayout title="Roles">{page}</AdminLayout>
);
