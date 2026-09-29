import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from '@/layouts/admin-layout';
import { Head, router, useForm } from '@inertiajs/react';
import { KeyRound, Pencil, Plus, Shield, Trash2, Users } from 'lucide-react';
import { useState } from 'react';

interface Permission {
    id: number;
    slug: string;
    name: string;
    description: string | null;
}

interface Module {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    description: string | null;
    is_active: boolean;
    permissions: Permission[];
}

interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    is_system: boolean;
    users_count: number;
    permissions: Permission[];
}

interface RolesProps {
    roles: Role[];
    modules: Module[];
}

export default function Roles({ roles, modules }: RolesProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const [editRole, setEditRole] = useState<Role | null>(null);

    const {
        data: form,
        setData: setForm,
        processing,
        errors,
        reset,
    } = useForm({
        name: '',
        description: '',
        permissions: [] as number[],
    });

    const openCreate = () => {
        reset();
        setEditRole(null);
        setCreateOpen(true);
    };

    const openEdit = (role: Role) => {
        setForm({
            name: role.name,
            description: role.description ?? '',
            permissions: role.permissions.map((p) => p.id),
        });
        setEditRole(role);
        setCreateOpen(true);
    };

    const togglePermission = (id: number) => {
        setForm(
            'permissions',
            form.permissions.includes(id)
                ? form.permissions.filter((p) => p !== id)
                : [...form.permissions, id],
        );
    };

    const submit = () => {
        if (editRole) {
            router.put(`/admin/roles/${editRole.id}`, form, {
                preserveScroll: true,
                onSuccess: () => {
                    setCreateOpen(false);
                    reset();
                },
            });
        } else {
            router.post('/admin/roles', form, {
                preserveScroll: true,
                onSuccess: () => {
                    setCreateOpen(false);
                    reset();
                },
            });
        }
    };

    const destroy = (role: Role) => {
        if (!confirm(`Hapus role "${role.name}"?`)) {
            return;
        }

        router.delete(`/admin/roles/${role.id}`, { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title="Roles - EduFunHub" />

            <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">
                            Kelola Role 🔐
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Atur role pengguna dan permissionnya di seluruh modul.
                        </p>
                    </div>
                    <Button onClick={openCreate}>
                        <Plus className="mr-2 size-4" />
                        Tambah Role
                    </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    {roles.map((role) => (
                        <div
                            key={role.id}
                            className="rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                                        <Shield className="size-5 text-primary" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-display font-semibold text-foreground">
                                                {role.name}
                                            </h3>
                                            {role.is_system && (
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px]"
                                                >
                                                    SISTEM
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {role.users_count} pengguna ·{' '}
                                            {role.permissions.length} permission
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openEdit(role)}
                                        title="Edit role"
                                    >
                                        <Pencil className="size-4" />
                                    </Button>
                                    {!role.is_system && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => destroy(role)}
                                            title="Hapus role"
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {role.description && (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    {role.description}
                                </p>
                            )}

                            <div className="mt-4 flex flex-wrap gap-1.5">
                                {role.permissions.slice(0, 8).map((p) => (
                                    <Badge
                                        key={p.id}
                                        variant="outline"
                                        className="text-[11px]"
                                    >
                                        {p.name}
                                    </Badge>
                                ))}
                                {role.permissions.length > 8 && (
                                    <Badge variant="outline" className="text-[11px]">
                                        +{role.permissions.length - 8} lagi
                                    </Badge>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-display">
                            {editRole ? `Edit Role: ${editRole.name}` : 'Tambah Role Baru'}
                        </DialogTitle>
                        <DialogDescription>
                            Pilih permission per modul untuk role ini.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="role-name">Nama Role</Label>
                                <Input
                                    id="role-name"
                                    value={form.name}
                                    onChange={(e) => setForm('name', e.target.value)}
                                    placeholder="cth: Kurator Konten"
                                />
                                {errors.name && (
                                    <p className="text-xs text-destructive">{errors.name}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role-desc">Deskripsi</Label>
                                <Input
                                    id="role-desc"
                                    value={form.description}
                                    onChange={(e) => setForm('description', e.target.value)}
                                    placeholder="Deskripsi singkat role"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label>Permission per Modul</Label>
                            {modules.map((module) => (
                                <div
                                    key={module.id}
                                    className="rounded-xl border bg-muted/30 p-4"
                                >
                                    <div className="flex items-center gap-2 font-medium text-foreground">
                                        {module.icon ? (
                                            <span className="text-base">{module.icon}</span>
                                        ) : (
                                            <KeyRound className="size-4 text-muted-foreground" />
                                        )}
                                        {module.name}
                                        {!module.is_active && (
                                            <Badge variant="secondary" className="text-[10px]">
                                                NONAKTIF
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {module.permissions.map((permission) => (
                                            <label
                                                key={permission.id}
                                                className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
                                            >
                                                <Checkbox
                                                    checked={form.permissions.includes(
                                                        permission.id,
                                                    )}
                                                    onCheckedChange={() =>
                                                        togglePermission(permission.id)
                                                    }
                                                />
                                                <span className="text-foreground">
                                                    {permission.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {modules.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    Belum ada modul. Buat modul dulu di halaman Modul.
                                </p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCreateOpen(false)}
                            disabled={processing}
                        >
                            Batal
                        </Button>
                        <Button onClick={submit} disabled={processing}>
                            {processing ? 'Menyimpan...' : editRole ? 'Simpan Perubahan' : 'Buat Role'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}