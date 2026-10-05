import {
    ConfirmDialog,
    FlashMessages,
    StatusPill,
} from '@/components/admin/admin-kit';
import { EmptyState, Panel, fieldClass } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import AdminLayout from '@/layouts/admin-layout';
import { SubjectIcon } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    BookMarked,
    Eye,
    EyeOff,
    ListChecks,
    Loader2,
    Lock,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

interface SubjectRow {
    id: number;
    key: string;
    name_id: string;
    name_en: string | null;
    icon: string;
    color: string;
    ai_hint: string | null;
    sort_order: number;
    is_active: boolean;
    is_system: boolean;
    questions: number;
    active_questions: number;
}

interface Props {
    subjects: SubjectRow[];
    icons: string[];
}

const COLORS = [
    '#ffd93d',
    '#5ad1a6',
    '#ff9ecf',
    '#8fb8ff',
    '#7dd3fc',
    '#ff8a5c',
    '#c4a7ff',
    '#a3e635',
    '#fca5a5',
    '#94a3b8',
];

const KEY_PATTERN = /^[a-z][a-z0-9-]{1,29}$/;

function slugify(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30)
        .replace(/-+$/g, '');
}

export default function SubjectsIndex({ subjects, icons }: Props) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [editing, setEditing] = useState<SubjectRow | 'new' | null>(null);
    const [deleting, setDeleting] = useState<SubjectRow | null>(null);
    const [processing, setProcessing] = useState(false);
    const visible = subjects.filter((s) => s.is_active).length;

    const act = (url: string, data: Record<string, string> = {}) =>
        router.patch(url, data, { preserveScroll: true });

    return (
        <AdminLayout>
            <Head title="Subjects" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            Subjects
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            School subjects players pick before a game. New
                            subjects appear in every game and in the question
                            bank right away; the game service picks them up
                            within a minute.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setEditing('new')}
                        data-testid="subject-new"
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        New subject
                    </button>
                </div>

                <FlashMessages errors={editing === null ? errors : undefined} />

                <Panel
                    title={`${subjects.length} subjects`}
                    description={`${visible} shown in games · order = order in the game picker`}
                    icon={BookMarked}
                >
                    {subjects.length === 0 ? (
                        <EmptyState
                            icon={BookMarked}
                            title="No subjects yet"
                            description="Add the first subject."
                        />
                    ) : (
                        <ul
                            className="-mx-5 -my-5 divide-y divide-border"
                            data-testid="subject-list"
                        >
                            {subjects.map((subject, index) => {
                                const empty = subject.active_questions === 0;
                                return (
                                    <li
                                        key={subject.id}
                                        data-testid={`subject-row-${subject.key}`}
                                        className={cn(
                                            'flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap',
                                            !subject.is_active && 'bg-muted/30',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-[#1f2a44] shadow-[2px_2px_0_#1f2a44]',
                                                !subject.is_active &&
                                                    'opacity-50',
                                            )}
                                            style={{
                                                background: subject.color,
                                            }}
                                            aria-hidden="true"
                                        >
                                            <SubjectIcon
                                                icon={subject.icon}
                                                className="size-5"
                                            />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-foreground">
                                                <span className="min-w-0 break-words">
                                                    {subject.name_id}
                                                </span>
                                                {subject.name_en &&
                                                    subject.name_en !==
                                                        subject.name_id && (
                                                        <span className="text-sm font-normal text-muted-foreground">
                                                            {subject.name_en}
                                                        </span>
                                                    )}
                                                {subject.is_system && (
                                                    <span
                                                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                                                        title="Built-in subject: can be hidden, not deleted"
                                                    >
                                                        <Lock className="size-3" />
                                                        Built-in
                                                    </span>
                                                )}
                                            </p>
                                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                                    {subject.key}
                                                </code>
                                                <Link
                                                    href={`/admin/questions?subject=${subject.key}`}
                                                    className="inline-flex items-center gap-1 link"
                                                >
                                                    <ListChecks className="size-3.5" />
                                                    {subject.active_questions}{' '}
                                                    active / {subject.questions}{' '}
                                                    questions
                                                </Link>
                                                {empty && subject.is_active && (
                                                    <span className="text-amber-700 dark:text-amber-400">
                                                        No active questions:
                                                        games use the mix
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <StatusPill
                                                active={subject.is_active}
                                            />
                                            <div className="flex items-center gap-0.5">
                                                <IconButton
                                                    label={`Move ${subject.name_id} up`}
                                                    disabled={index === 0}
                                                    onClick={() =>
                                                        act(
                                                            `/admin/subjects/${subject.id}/move`,
                                                            { direction: 'up' },
                                                        )
                                                    }
                                                >
                                                    <ArrowUp className="size-4" />
                                                </IconButton>
                                                <IconButton
                                                    label={`Move ${subject.name_id} down`}
                                                    disabled={
                                                        index ===
                                                        subjects.length - 1
                                                    }
                                                    onClick={() =>
                                                        act(
                                                            `/admin/subjects/${subject.id}/move`,
                                                            {
                                                                direction:
                                                                    'down',
                                                            },
                                                        )
                                                    }
                                                >
                                                    <ArrowDown className="size-4" />
                                                </IconButton>
                                                <IconButton
                                                    label={`Edit ${subject.name_id}`}
                                                    testId={`subject-edit-${subject.key}`}
                                                    onClick={() =>
                                                        setEditing(subject)
                                                    }
                                                >
                                                    <Pencil className="size-4" />
                                                </IconButton>
                                                <IconButton
                                                    label={
                                                        subject.is_active
                                                            ? `Hide ${subject.name_id} from games`
                                                            : `Show ${subject.name_id} in games`
                                                    }
                                                    testId={`subject-toggle-${subject.key}`}
                                                    onClick={() =>
                                                        act(
                                                            `/admin/subjects/${subject.id}/toggle`,
                                                        )
                                                    }
                                                >
                                                    {subject.is_active ? (
                                                        <EyeOff className="size-4" />
                                                    ) : (
                                                        <Eye className="size-4" />
                                                    )}
                                                </IconButton>
                                                {subject.is_system ? (
                                                    <span
                                                        className="inline-flex size-9 items-center justify-center text-muted-foreground/40"
                                                        title="Built-in subjects can be hidden, not deleted"
                                                    >
                                                        <Lock className="size-4" />
                                                    </span>
                                                ) : (
                                                    <IconButton
                                                        label={`Delete ${subject.name_id}`}
                                                        testId={`subject-delete-${subject.key}`}
                                                        danger
                                                        onClick={() =>
                                                            setDeleting(subject)
                                                        }
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </IconButton>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>
            </div>

            <SubjectDialog
                key={
                    editing === 'new'
                        ? 'new'
                        : editing
                          ? `edit-${editing.id}`
                          : 'closed'
                }
                subject={editing === 'new' ? null : editing}
                open={editing !== null}
                icons={icons}
                onClose={() => setEditing(null)}
            />

            <ConfirmDialog
                open={deleting !== null}
                title="Delete subject?"
                message={
                    deleting &&
                    (deleting.questions > 0
                        ? `“${deleting.name_id}” still has ${deleting.questions} question(s). Move or delete them first, or hide the subject instead.`
                        : `“${deleting.name_id}” will be removed from every game picker.`)
                }
                confirmLabel="Delete"
                processing={processing}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    router.delete(`/admin/subjects/${deleting.id}`, {
                        preserveScroll: true,
                        onStart: () => setProcessing(true),
                        onFinish: () => {
                            setProcessing(false);
                            setDeleting(null);
                        },
                    })
                }
            />
        </AdminLayout>
    );
}

function SubjectDialog({
    subject,
    open,
    icons,
    onClose,
}: {
    subject: SubjectRow | null;
    open: boolean;
    icons: string[];
    onClose: () => void;
}) {
    const form = useForm({
        name_id: subject?.name_id ?? '',
        name_en: subject?.name_en ?? '',
        key: subject?.key ?? '',
        icon: subject?.icon ?? 'book-open',
        color: subject?.color ?? COLORS[6],
        ai_hint: subject?.ai_hint ?? '',
        is_active: subject?.is_active ?? true,
    });
    const { data, setData, errors, processing } = form;
    const [keyTouched, setKeyTouched] = useState(Boolean(subject));
    const key = keyTouched ? data.key : slugify(data.name_id);
    const keyValid = KEY_PATTERN.test(key) && key !== 'mix' && key !== 'all';

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.transform((values) => ({ ...values, key }));
        const options = { preserveScroll: true, onSuccess: onClose };
        if (subject) {
            form.put(`/admin/subjects/${subject.id}`, options);
        } else {
            form.post('/admin/subjects', options);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent
                className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
                data-testid="subject-dialog"
            >
                <DialogHeader>
                    <DialogTitle>
                        {subject ? `Edit ${subject.name_id}` : 'New subject'}
                    </DialogTitle>
                    <DialogDescription>
                        Shown to players in the game subject picker.
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={submit}
                    className="flex flex-col gap-5"
                    data-testid="subject-form"
                >
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                        <span
                            className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-[#1f2a44] shadow-[2px_2px_0_#1f2a44]"
                            style={{ background: data.color }}
                            aria-hidden="true"
                        >
                            <SubjectIcon icon={data.icon} className="size-6" />
                        </span>
                        <div className="min-w-0">
                            <p className="font-semibold break-words text-foreground">
                                {data.name_id || 'Subject name'}
                            </p>
                            <p className="text-xs break-words text-muted-foreground">
                                {data.name_en || 'English name'} · key{' '}
                                <code className="font-mono">{key || '—'}</code>
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Name (Indonesian)" error={errors.name_id}>
                            <input
                                value={data.name_id}
                                onChange={(event) =>
                                    setData('name_id', event.target.value)
                                }
                                className={fieldClass}
                                name="name_id"
                                maxLength={60}
                                placeholder="Seni Budaya"
                                required
                                autoFocus
                            />
                        </Field>
                        <Field label="Name (English)" error={errors.name_en}>
                            <input
                                value={data.name_en}
                                onChange={(event) =>
                                    setData('name_en', event.target.value)
                                }
                                className={fieldClass}
                                name="name_en"
                                maxLength={60}
                                placeholder="Arts"
                            />
                        </Field>
                    </div>

                    <Field
                        label="Key"
                        error={errors.key}
                        hint={
                            subject
                                ? 'Fixed after creation: questions and saved player choices use it.'
                                : 'Lowercase letters, numbers and hyphens. Made from the name unless you change it.'
                        }
                    >
                        <input
                            value={key}
                            onChange={(event) => {
                                setKeyTouched(true);
                                setData(
                                    'key',
                                    event.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z0-9-]/g, ''),
                                );
                            }}
                            className={cn(
                                fieldClass,
                                'font-mono',
                                key && !keyValid && 'border-destructive',
                            )}
                            name="key"
                            maxLength={30}
                            disabled={Boolean(subject)}
                            aria-invalid={Boolean(key) && !keyValid}
                        />
                    </Field>

                    <Field label="Icon" error={errors.icon}>
                        <div
                            className="grid grid-cols-5 gap-2 sm:grid-cols-10"
                            role="radiogroup"
                            aria-label="Icon"
                        >
                            {icons.map((name) => {
                                const selected = data.icon === name;
                                return (
                                    <button
                                        key={name}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        aria-label={name}
                                        title={name}
                                        onClick={() => setData('icon', name)}
                                        className={cn(
                                            'grid aspect-square place-items-center rounded-lg border text-foreground transition-colors',
                                            selected
                                                ? 'border-primary bg-primary/15 ring-2 ring-primary/40'
                                                : 'border-border hover:bg-muted',
                                        )}
                                    >
                                        <SubjectIcon
                                            icon={name}
                                            className="size-4"
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </Field>

                    <Field label="Colour" error={errors.color}>
                        <div className="flex flex-wrap items-center gap-2">
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setData('color', color)}
                                    aria-label={`Colour ${color}`}
                                    aria-pressed={data.color === color}
                                    className={cn(
                                        'size-8 rounded-full border-2 border-[#1f2a44] transition-transform',
                                        data.color === color &&
                                            'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background',
                                    )}
                                    style={{ background: color }}
                                />
                            ))}
                            <label className="ml-1 inline-flex cursor-pointer items-center gap-2 rounded-full border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                                <input
                                    type="color"
                                    value={data.color}
                                    onChange={(event) =>
                                        setData('color', event.target.value)
                                    }
                                    className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
                                />
                                Custom
                            </label>
                        </div>
                    </Field>

                    <Field
                        label="Description for the AI question writer (optional)"
                        error={errors.ai_hint}
                        hint="Tells AI generation what to write about, e.g. “arts: music, dance, crafts”."
                    >
                        <input
                            value={data.ai_hint}
                            onChange={(event) =>
                                setData('ai_hint', event.target.value)
                            }
                            className={fieldClass}
                            name="ai_hint"
                            maxLength={200}
                            spellCheck={false}
                        />
                    </Field>

                    <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                            type="checkbox"
                            checked={data.is_active}
                            onChange={(event) =>
                                setData('is_active', event.target.checked)
                            }
                            className="size-4 rounded border-input"
                        />
                        Show in games
                    </label>
                    <InputError
                        message={(errors as Record<string, string>).subject}
                    />

                    <div className="flex justify-end gap-3 border-t border-border pt-5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={processing || !data.name_id || !keyValid}
                            data-testid="subject-save"
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {processing && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            {subject ? 'Save changes' : 'Add subject'}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({
    label,
    error,
    hint,
    children,
}: {
    label: string;
    error?: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            <InputError message={error} />
        </div>
    );
}

function IconButton({
    label,
    onClick,
    disabled,
    danger,
    testId,
    children,
}: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    testId?: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            data-testid={testId}
            className={cn(
                'inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground disabled:pointer-events-none disabled:opacity-30',
                danger
                    ? 'hover:bg-destructive/10 hover:text-destructive'
                    : 'hover:bg-muted hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}
