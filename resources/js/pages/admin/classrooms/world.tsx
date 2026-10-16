import { ClassroomWorld } from '@/components/classroom/classroom-world';
import AdminLayout from '@/layouts/admin-layout';
import { type WorldProps } from '@/lib/classroom-world/protocol';
import { Head, Link } from '@inertiajs/react';
import { tr } from '@/lib/admin-i18n';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
    classroom: { id: number; name: string; pin: string; status: string };
    world: WorldProps;
}

export default function AdminClassroomWorld({ classroom, world }: Props) {
    return (
        <>
            <Head title={tr('Monitor: {0}', [classroom.name])} />
            <div className="flex h-[calc(100vh-5rem)] min-h-[36rem] flex-col gap-3">
                <Link
                    href={`/admin/classrooms/${classroom.id}`}
                    className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {tr('Back to classroom')}
                </Link>
                <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                    <ClassroomWorld
                        classroomId={classroom.id}
                        classroomName={classroom.name}
                        world={{ ...world, role: 'observer' }}
                        onExit={() => window.history.back()}
                    />
                </div>
            </div>
        </>
    );
}

AdminClassroomWorld.layout = (page: ReactNode) => (
    <AdminLayout title="Classroom monitor">{page}</AdminLayout>
);
