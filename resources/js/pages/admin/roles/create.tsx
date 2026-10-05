import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { type Permission } from '@/types/admin';
import { Head, Link, useForm } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { type FormEventHandler, type ReactNode, useEffect } from 'react';

interface CreateRoleProps {
    permissions: Permission[];
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

function groupByModule(
    permissions: Permission[],
): Record<string, Permission[]> {
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

export default function CreateRole({ permissions }: CreateRoleProps) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        slug: '',
        description: '',
        permissions: [] as number[],
    });

    const grouped = groupByModule(permissions);

    // Auto-generate slug from name
    useEffect(() => {
        setData('slug', slugify(data.name));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.name]);

    const togglePermission = (id: number) => {
        setData(
            'permissions',
            data.permissions.includes(id)
                ? data.permissions.filter((p) => p !== id)
                : [...data.permissions, id],
        );
    };

    const toggleModule = (moduleName: string) => {
        const moduleIds = grouped[moduleName].map((p) => p.id);
        const allSelected = moduleIds.every((id) =>
            data.permissions.includes(id),
        );

        if (allSelected) {
            setData(
                'permissions',
                data.permissions.filter((id) => !moduleIds.includes(id)),
            );
        } else {
            const newPerms = new Set([...data.permissions, ...moduleIds]);
            setData('permissions', Array.from(newPerms));
        }
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post('/admin/roles');
    };

    return (
        <>
            <Head title="Create Role" />

            <div className="w-full space-y-6">
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        Create Role
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Define a new role with permissions
                    </p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <form onSubmit={submit} className="space-y-5" noValidate>
                        {/* Name */}
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="name"
                                className="text-sm font-medium text-foreground"
                            >
                                Name
                            </label>
                            <input
                                id="name"
                                type="text"
                                value={data.name}
                                onChange={(e) =>
                                    setData('name', e.target.value)
                                }
                                className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                placeholder="Content Manager"
                                autoFocus
                                required
                            />
                            <InputError message={errors.name} />
                        </div>

                        {/* Slug */}
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="slug"
                                className="text-sm font-medium text-foreground"
                            >
                                Slug{' '}
                                <span className="font-normal text-muted-foreground">
                                    (auto-generated)
                                </span>
                            </label>
                            <input
                                id="slug"
                                type="text"
                                value={data.slug}
                                onChange={(e) =>
                                    setData('slug', e.target.value)
                                }
                                className="h-9 rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            />
                            <InputError message={errors.slug} />
                        </div>

                        {/* Description */}
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="description"
                                className="text-sm font-medium text-foreground"
                            >
                                Description
                            </label>
                            <textarea
                                id="description"
                                value={data.description}
                                onChange={(e) =>
                                    setData('description', e.target.value)
                                }
                                className="min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                placeholder="Optional description"
                                rows={3}
                            />
                            <InputError message={errors.description} />
                        </div>

                        {/* Permissions */}
                        <fieldset className="flex flex-col gap-3">
                            <legend className="text-sm font-medium text-foreground">
                                Permissions
                            </legend>
                            <InputError message={errors.permissions} />

                            {Object.entries(grouped).map(
                                ([moduleName, perms]) => {
                                    const moduleIds = perms.map((p) => p.id);
                                    const allSelected = moduleIds.every((id) =>
                                        data.permissions.includes(id),
                                    );
                                    const someSelected = moduleIds.some((id) =>
                                        data.permissions.includes(id),
                                    );

                                    return (
                                        <div
                                            key={moduleName}
                                            className="rounded-lg border border-border"
                                        >
                                            <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    ref={(el) => {
                                                        if (el)
                                                            el.indeterminate =
                                                                someSelected &&
                                                                !allSelected;
                                                    }}
                                                    onChange={() =>
                                                        toggleModule(moduleName)
                                                    }
                                                    className="size-4 rounded border-input accent-primary"
                                                    aria-label={`Select all ${moduleName} permissions`}
                                                />
                                                <span className="text-sm font-semibold text-foreground capitalize">
                                                    {moduleName}
                                                </span>
                                                <span className="ml-auto text-xs text-muted-foreground">
                                                    {
                                                        moduleIds.filter((id) =>
                                                            data.permissions.includes(
                                                                id,
                                                            ),
                                                        ).length
                                                    }
                                                    /{moduleIds.length}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
                                                {perms.map((perm) => (
                                                    <label
                                                        key={perm.id}
                                                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={data.permissions.includes(
                                                                perm.id,
                                                            )}
                                                            onChange={() =>
                                                                togglePermission(
                                                                    perm.id,
                                                                )
                                                            }
                                                            className="size-4 rounded border-input accent-primary"
                                                        />
                                                        <div>
                                                            <p className="text-sm text-foreground">
                                                                {perm.name}
                                                            </p>
                                                            {perm.description && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    {
                                                                        perm.description
                                                                    }
                                                                </p>
                                                            )}
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                },
                            )}
                        </fieldset>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Link
                                href="/admin/roles"
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                Cancel
                            </Link>
                            <button
                                type="submit"
                                disabled={processing}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                            >
                                {processing && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                Create Role
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}

CreateRole.layout = (page: ReactNode) => (
    <AdminLayout title="Create Role">{page}</AdminLayout>
);
