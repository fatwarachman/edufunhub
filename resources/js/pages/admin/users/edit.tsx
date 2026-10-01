import AdminLayout from '@/layouts/admin-layout';
import InputError from '@/components/input-error';
import { type AdminUser, type Role } from '@/types/admin';
import { Head, Link, useForm } from '@inertiajs/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { type FormEventHandler, type ReactNode, useState } from 'react';

interface EditUserProps {
    user: AdminUser;
    roles: Role[];
    userRoles: number[];
}

export default function EditUser({ user, roles, userRoles }: EditUserProps) {
    const [showPassword, setShowPassword] = useState(false);

    const { data, setData, put, processing, errors } = useForm({
        name: user.name,
        email: user.email,
        password: '',
        password_confirmation: '',
        roles: userRoles,
    });

    const toggleRole = (roleId: number) => {
        setData(
            'roles',
            data.roles.includes(roleId)
                ? data.roles.filter((id) => id !== roleId)
                : [...data.roles, roleId],
        );
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        put(`/admin/users/${user.id}`);
    };

    const formatDate = (str: string) =>
        new Date(str).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

    return (
        <>
            <Head title={`Edit ${user.name}`} />

            <div className="mx-auto max-w-2xl space-y-6">
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        Edit User
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Update information for {user.name}
                    </p>
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
                    <span>
                        <span className="font-medium text-foreground">Joined:</span>{' '}
                        {formatDate(user.created_at)}
                    </span>
                    {user.last_seen_at && (
                        <span>
                            <span className="font-medium text-foreground">Last seen:</span>{' '}
                            {formatDate(user.last_seen_at)}
                        </span>
                    )}
                    {user.email_verified_at && (
                        <span className="text-green-600 dark:text-green-400">✓ Email verified</span>
                    )}
                </div>

                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <form onSubmit={submit} className="space-y-5" noValidate>
                        {/* Name */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="name" className="text-sm font-medium text-foreground">
                                Full name
                            </label>
                            <input
                                id="name"
                                type="text"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                required
                            />
                            <InputError message={errors.name} />
                        </div>

                        {/* Email */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="email" className="text-sm font-medium text-foreground">
                                Email address
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={data.email}
                                onChange={(e) => setData('email', e.target.value)}
                                className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                required
                            />
                            <InputError message={errors.email} />
                        </div>

                        {/* New password (optional) */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="password" className="text-sm font-medium text-foreground">
                                New password{' '}
                                <span className="font-normal text-muted-foreground">(leave blank to keep current)</span>
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                    className="h-9 w-full rounded-lg border border-input bg-background px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="Leave blank to keep current"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((s) => !s)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                            <InputError message={errors.password} />
                        </div>

                        {data.password && (
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="password_confirmation" className="text-sm font-medium text-foreground">
                                    Confirm new password
                                </label>
                                <input
                                    id="password_confirmation"
                                    type={showPassword ? 'text' : 'password'}
                                    value={data.password_confirmation}
                                    onChange={(e) => setData('password_confirmation', e.target.value)}
                                    className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    autoComplete="new-password"
                                />
                                <InputError message={errors.password_confirmation} />
                            </div>
                        )}

                        {/* Roles */}
                        <fieldset className="flex flex-col gap-2">
                            <legend className="text-sm font-medium text-foreground">Roles</legend>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {roles.map((role) => (
                                    <label
                                        key={role.id}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={data.roles.includes(role.id)}
                                            onChange={() => toggleRole(role.id)}
                                            className="size-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                                        />
                                        <div>
                                            <p className="text-sm font-medium text-foreground">
                                                {role.name}
                                                {role.is_system && (
                                                    <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                                                        System
                                                    </span>
                                                )}
                                            </p>
                                            {role.description && (
                                                <p className="text-xs text-muted-foreground">{role.description}</p>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <InputError message={errors.roles} />
                        </fieldset>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Link
                                href={`/admin/users/${user.id}`}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                Cancel
                            </Link>
                            <button
                                type="submit"
                                disabled={processing}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                            >
                                {processing && <Loader2 className="size-4 animate-spin" />}
                                Save Changes
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}

EditUser.layout = (page: ReactNode) => (
    <AdminLayout title="Edit User">{page}</AdminLayout>
);
