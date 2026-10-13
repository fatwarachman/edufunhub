import AdminLayout from '@/layouts/admin-layout';
import { Head, router } from '@inertiajs/react';
import { Check, X } from 'lucide-react';
import { useState } from 'react';

interface RequestRow {
    id: number;
    user: { name: string; email: string };
    subject_key: string | null;
    message: string | null;
    created_at: string;
}
interface Props {
    requests: { data: RequestRow[] };
    subjects: { key: string; name_id: string; name_en: string | null }[];
}

export default function TeacherRequests({ requests, subjects }: Props) {
    const [selected, setSelected] = useState<Record<number, string[]>>({});
    const names = (keys: string[]): string =>
        keys.length === 0
            ? 'All subjects'
            : keys
                  .map(
                      (key) =>
                          subjects.find((subject) => subject.key === key)
                              ?.name_en ?? key,
                  )
                  .join(', ');
    const review = (item: RequestRow, status: 'approved' | 'rejected'): void =>
        router.patch(`/admin/teacher-requests/${item.id}`, {
            status,
            subjects:
                selected[item.id] ??
                (item.subject_key ? [item.subject_key] : []),
        });
    return (
        <AdminLayout>
            <Head title="Teacher requests" />
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Teacher requests
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Review access requests and assign allowed subjects.
                    </p>
                </div>
                <div className="grid gap-4">
                    {requests.data.map((item) => (
                        <section
                            key={item.id}
                            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h2 className="font-semibold text-foreground">
                                        {item.user.name}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        {item.user.email}
                                    </p>
                                    <p className="mt-2 text-sm text-foreground">
                                        {item.message || '—'}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => review(item, 'rejected')}
                                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm text-destructive"
                                    >
                                        <X className="size-4" />
                                        Reject
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => review(item, 'approved')}
                                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm text-primary-foreground"
                                    >
                                        <Check className="size-4" />
                                        Approve
                                    </button>
                                </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <span className="text-sm font-medium">
                                    Requested:{' '}
                                    {item.subject_key
                                        ? names([item.subject_key])
                                        : 'All subjects'}
                                </span>
                                {subjects.map((subject) => (
                                    <button
                                        key={subject.key}
                                        type="button"
                                        onClick={() =>
                                            setSelected((current) => ({
                                                ...current,
                                                [item.id]: (
                                                    current[item.id] ??
                                                    (item.subject_key
                                                        ? [item.subject_key]
                                                        : [])
                                                ).includes(subject.key)
                                                    ? (
                                                          current[item.id] ?? []
                                                      ).filter(
                                                          (key) =>
                                                              key !==
                                                              subject.key,
                                                      )
                                                    : [
                                                          ...(current[
                                                              item.id
                                                          ] ??
                                                              (item.subject_key
                                                                  ? [
                                                                        item.subject_key,
                                                                    ]
                                                                  : [])),
                                                          subject.key,
                                                      ],
                                            }))
                                        }
                                        className={`rounded-full border px-3 py-1 text-xs ${(selected[item.id] ?? (item.subject_key ? [item.subject_key] : [])).includes(subject.key) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                                    >
                                        {subject.name_en ?? subject.name_id}
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </AdminLayout>
    );
}
