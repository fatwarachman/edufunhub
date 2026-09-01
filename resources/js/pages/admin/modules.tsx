import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from '@/layouts/admin-layout';
import { Head, router, useForm } from '@inertiajs/react';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Permission {
    id: number;
    slug: string;
    name: string;
}

interface Module {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    description: string | null;
    is_active: boolean;
    permissions_count: number;
    permissions: Permission[];
}

interface ModulesProps {
    modules: Module[];
}

export default function Modules({ modules }: ModulesProps) {
    const [createOpen, setCreateOpen] = useState(false);

    const {
        data: form,
        setData: setForm,
        processing,
        errors,
        reset,
    } = useForm({
        name: '',
        icon: '',
        description: '',
    });

    const submit = () => {
        router.post('/admin/modules', form, {
            preserveScroll: true,
            onSuccess: () => {
                setCreateOpen(false);
                reset();
            },
        });
    };

    const toggle = (module: Module) => {
        router.patch(`/admin/modules/${module.id}/toggle`, undefined, {
            preserveScroll: true,
        });
    };

    const destroy = (module: Module) => {
        if (!confirm(`Hapus modul "${module.name}" beserta permissionnya?`)) {
            return;
        }

        router.delete(`/admin/modules/${module.id}`, { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title="Modul - EduFunHub" />

            <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-foreground">
                            Kelola Modul 📦
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Modul aplikasi menentukan permission apa yang tersedia untuk role.
                        </p>
                    </div>
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-2 size-4" />
                        Tambah Modul
                    </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {modules.map((module) => (
                        <div
                            key={module.id}
                            className={`rounded-2xl border bg-card p-5 shadow-sm transition-colors ${
                                module.is_active
                                    ? 'hover:border-primary/40'
                                    : 'opacity-60'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-xl">
                                        {module.icon ?? '📦'}
                                    </div>
                                    <div>
                                        <h3 className="font-display font-semibold text-foreground">
                                            {module.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            {module.permissions_count} permission ·{' '}
                                            {module.slug}
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={module.is_active}
                                    onCheckedChange={() => toggle(module)}
                                    aria-label={`Toggle ${module.name}`}
                                />
                            </div>

                            {module.description && (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    {module.description}
                                </p>
                            )}

                            <div className="mt-4 flex flex-wrap gap-1.5">
                                {module.permissions.map((p) => (
                                    <Badge
                                        key={p.id}
                                        variant="outline"
                                        className="text-[11px]"
                                    >
                                        {p.name}
                                    </Badge>
                                ))}
                            </div>

                            <div className="mt-4 flex justify-end border-t pt-3">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => destroy(module)}
                                >
                                    <Trash2 className="mr-1 size-3.5" />
                                    Hapus
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="font-display">Tambah Modul Baru</DialogTitle>
                        <DialogDescription>
                            Modul baru otomatis mendapat 4 permission: view, create, edit, delete.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="module-name">Nama Modul</Label>
                            <Input
                                id="module-name"
                                value={form.name}
                                onChange={(e) => setForm('name', e.target.value)}
                                placeholder="cth: Kuis Mingguan"
                            />
                            {errors.name && (
                                <p className="text-xs text-destructive">{errors.name}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="module-icon">Ikon (emoji)</Label>
                            <Input
                                id="module-icon"
                                value={form.icon}
                                onChange={(e) => setForm('icon', e.target.value)}
                                placeholder="cth: 🎯"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="module-desc">Deskripsi</Label>
                            <Textarea
                                id="module-desc"
                                value={form.description}
                                onChange={(e) => setForm('description', e.target.value)}
                                placeholder="Deskripsi singkat modul"
                                rows={3}
                            />
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
                            {processing ? 'Menyimpan...' : 'Buat Modul'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}