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
import { tr } from '@/lib/admin-i18n';
import http from '@/lib/http';
import { SubjectIcon } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    BookMarked,
    ChevronRight,
    Eye,
    EyeOff,
    Layers,
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
    topics: TopicRow[];
}

interface TopicRow {
    id: number;
    subject_key: string;
    name_id: string;
    name_en: string | null;
    material: string | null;
    is_active: boolean;
    questions_count: number;
}

const MAX_TOPIC_MATERIAL = 4000;

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
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [topicForm, setTopicForm] = useState<{
        subject: SubjectRow;
        topic: TopicRow | null;
    } | null>(null);
    const [topicDeleting, setTopicDeleting] = useState<{
        subject: SubjectRow;
        topic: TopicRow;
    } | null>(null);
    const toggleExpanded = (id: number) =>
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    const reloadSubjects = () => router.reload({ only: ['subjects'] });
    const [processing, setProcessing] = useState(false);
    const visible = subjects.filter((s) => s.is_active).length;

    const act = (url: string, data: Record<string, string> = {}) =>
        router.patch(url, data, { preserveScroll: true });

    return (
        <AdminLayout>
            <Head title={tr('Subjects')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">
                            {tr('Subjects')}
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            {tr(
                                'School subjects players pick before a game. New subjects appear in every game and in the question bank right away; the game service picks them up within a minute.',
                            )}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setEditing('new')}
                        data-testid="subject-new"
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        {tr('New subject')}
                    </button>
                </div>

                <FlashMessages errors={editing === null ? errors : undefined} />

                <Panel
                    title={tr('{0} subjects', [subjects.length])}
                    description={tr(
                        '{0} shown in games · order = order in the game picker',
                        [visible],
                    )}
                    icon={BookMarked}
                >
                    {subjects.length === 0 ? (
                        <EmptyState
                            icon={BookMarked}
                            title={tr('No subjects yet')}
                            description={tr('Add the first subject.')}
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
                                            !subject.is_active && 'bg-muted/30',
                                        )}
                                    >
                                        <div className="flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggleExpanded(subject.id)
                                                }
                                                aria-expanded={expanded.has(
                                                    subject.id,
                                                )}
                                                aria-controls={`subject-topics-panel-${subject.id}`}
                                                aria-label={tr(
                                                    'Show topics of {0}',
                                                    [subject.name_id],
                                                )}
                                                data-testid={`subject-expand-${subject.key}`}
                                                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            >
                                                <ChevronRight
                                                    className={cn(
                                                        'size-4 transition-transform duration-300 ease-out motion-reduce:transition-none',
                                                        expanded.has(
                                                            subject.id,
                                                        ) && 'rotate-90',
                                                    )}
                                                />
                                            </button>
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
                                                                {
                                                                    subject.name_en
                                                                }
                                                            </span>
                                                        )}
                                                    {subject.is_system && (
                                                        <span
                                                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                                                            title={tr(
                                                                'Built-in subject: can be hidden, not deleted',
                                                            )}
                                                        >
                                                            <Lock className="size-3" />
                                                            {tr('Built-in')}
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
                                                        {
                                                            subject.active_questions
                                                        }{' '}
                                                        {tr('active /')}{' '}
                                                        {subject.questions}{' '}
                                                        {tr('questions')}
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleExpanded(
                                                                subject.id,
                                                            )
                                                        }
                                                        className="inline-flex items-center gap-1 hover:text-foreground"
                                                    >
                                                        <Layers className="size-3.5" />
                                                        {tr('{0} topics', [
                                                            subject.topics
                                                                .length,
                                                        ])}
                                                    </button>
                                                    {empty &&
                                                        subject.is_active && (
                                                            <span className="text-amber-700 dark:text-amber-400">
                                                                {tr(
                                                                    'No active questions: games use the mix',
                                                                )}
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
                                                        label={tr(
                                                            'Move {0} up',
                                                            [subject.name_id],
                                                        )}
                                                        disabled={index === 0}
                                                        onClick={() =>
                                                            act(
                                                                `/admin/subjects/${subject.id}/move`,
                                                                {
                                                                    direction:
                                                                        'up',
                                                                },
                                                            )
                                                        }
                                                    >
                                                        <ArrowUp className="size-4" />
                                                    </IconButton>
                                                    <IconButton
                                                        label={tr(
                                                            'Move {0} down',
                                                            [subject.name_id],
                                                        )}
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
                                                        label={tr(
                                                            'Add topic to {0}',
                                                            [subject.name_id],
                                                        )}
                                                        testId={`subject-topic-add-${subject.key}`}
                                                        onClick={() => {
                                                            setExpanded(
                                                                (current) =>
                                                                    new Set(
                                                                        current,
                                                                    ).add(
                                                                        subject.id,
                                                                    ),
                                                            );
                                                            setTopicForm({
                                                                subject,
                                                                topic: null,
                                                            });
                                                        }}
                                                    >
                                                        <Layers className="size-4" />
                                                    </IconButton>
                                                    <IconButton
                                                        label={tr('Edit {0}', [
                                                            subject.name_id,
                                                        ])}
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
                                                                ? tr(
                                                                      'Hide {0} from games',
                                                                      [
                                                                          subject.name_id,
                                                                      ],
                                                                  )
                                                                : tr(
                                                                      'Show {0} in games',
                                                                      [
                                                                          subject.name_id,
                                                                      ],
                                                                  )
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
                                                            title={tr(
                                                                'Built-in subjects can be hidden, not deleted',
                                                            )}
                                                        >
                                                            <Lock className="size-4" />
                                                        </span>
                                                    ) : (
                                                        <IconButton
                                                            label={tr(
                                                                'Delete {0}',
                                                                [
                                                                    subject.name_id,
                                                                ],
                                                            )}
                                                            testId={`subject-delete-${subject.key}`}
                                                            danger
                                                            onClick={() =>
                                                                setDeleting(
                                                                    subject,
                                                                )
                                                            }
                                                        >
                                                            <Trash2 className="size-4" />
                                                        </IconButton>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <TopicChildren
                                            subject={subject}
                                            open={expanded.has(subject.id)}
                                            onAdd={() =>
                                                setTopicForm({
                                                    subject,
                                                    topic: null,
                                                })
                                            }
                                            onEdit={(topic) =>
                                                setTopicForm({
                                                    subject,
                                                    topic,
                                                })
                                            }
                                            onDelete={(topic) =>
                                                setTopicDeleting({
                                                    subject,
                                                    topic,
                                                })
                                            }
                                            onChanged={reloadSubjects}
                                        />
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

            <TopicFormDialog
                key={
                    topicForm
                        ? `topic-${topicForm.subject.id}-${topicForm.topic?.id ?? 'new'}`
                        : 'topic-closed'
                }
                state={topicForm}
                onClose={() => setTopicForm(null)}
                onSaved={() => {
                    setTopicForm(null);
                    reloadSubjects();
                }}
            />

            <ConfirmDialog
                open={topicDeleting !== null}
                title={tr('Delete topic?')}
                message={
                    topicDeleting &&
                    tr(
                        '“{0}” will be removed. Its questions stay in the bank without a topic.',
                        [topicDeleting.topic.name_id],
                    )
                }
                confirmLabel={tr('Delete')}
                processing={processing}
                onClose={() => setTopicDeleting(null)}
                onConfirm={async () => {
                    if (!topicDeleting) {
                        return;
                    }
                    setProcessing(true);
                    try {
                        await http.delete(
                            `/admin/subjects/${topicDeleting.subject.id}/topics/${topicDeleting.topic.id}`,
                        );
                        reloadSubjects();
                    } finally {
                        setProcessing(false);
                        setTopicDeleting(null);
                    }
                }}
            />

            <ConfirmDialog
                open={deleting !== null}
                title={tr('Delete subject?')}
                message={
                    deleting &&
                    (deleting.questions > 0
                        ? tr(
                              '“{0}” still has {1} question(s). Move or delete them first, or hide the subject instead.',
                              [deleting.name_id, deleting.questions],
                          )
                        : tr('“{0}” will be removed from every game picker.', [
                              deleting.name_id,
                          ]))
                }
                confirmLabel={tr('Delete')}
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
                        {subject
                            ? tr('Edit {0}', [subject.name_id])
                            : tr('New subject')}
                    </DialogTitle>
                    <DialogDescription>
                        {tr('Shown to players in the game subject picker.')}
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
                                {data.name_id || tr('Subject name')}
                            </p>
                            <p className="text-xs break-words text-muted-foreground">
                                {data.name_en || tr('English name')}{' '}
                                {tr('· key')}{' '}
                                <code className="font-mono">{key || '—'}</code>
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label={tr('Name (Indonesian)')}
                            error={errors.name_id}
                        >
                            <input
                                value={data.name_id}
                                onChange={(event) =>
                                    setData('name_id', event.target.value)
                                }
                                className={fieldClass}
                                name="name_id"
                                maxLength={60}
                                placeholder={tr('Seni Budaya')}
                                required
                                autoFocus
                            />
                        </Field>
                        <Field
                            label={tr('Name (English)')}
                            error={errors.name_en}
                        >
                            <input
                                value={data.name_en}
                                onChange={(event) =>
                                    setData('name_en', event.target.value)
                                }
                                className={fieldClass}
                                name="name_en"
                                maxLength={60}
                                placeholder={tr('Arts')}
                            />
                        </Field>
                    </div>

                    <Field
                        label={tr('Key')}
                        error={errors.key}
                        hint={
                            subject
                                ? tr(
                                      'Fixed after creation: questions and saved player choices use it.',
                                  )
                                : tr(
                                      'Lowercase letters, numbers and hyphens. Made from the name unless you change it.',
                                  )
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

                    <Field label={tr('Icon')} error={errors.icon}>
                        <div
                            className="grid grid-cols-5 gap-2 sm:grid-cols-10"
                            role="radiogroup"
                            aria-label={tr('Icon')}
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

                    <Field label={tr('Colour')} error={errors.color}>
                        <div className="flex flex-wrap items-center gap-2">
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setData('color', color)}
                                    aria-label={tr('Colour {0}', [color])}
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
                                {tr('Custom')}
                            </label>
                        </div>
                    </Field>

                    <Field
                        label={tr(
                            'Description for the AI question writer (optional)',
                        )}
                        error={errors.ai_hint}
                        hint={tr(
                            'Tells AI generation what to write about, e.g. “arts: music, dance, crafts”.',
                        )}
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
                        {tr('Show in games')}
                    </label>
                    <InputError
                        message={tr((errors as Record<string, string>).subject)}
                    />

                    <div className="flex justify-end gap-3 border-t border-border pt-5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            {tr('Cancel')}
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
                            {subject ? tr('Save changes') : tr('Add subject')}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function TopicChildren({
    subject,
    open,
    onAdd,
    onEdit,
    onDelete,
    onChanged,
}: {
    subject: SubjectRow;
    open: boolean;
    onAdd: () => void;
    onEdit: (topic: TopicRow) => void;
    onDelete: (topic: TopicRow) => void;
    onChanged: () => void;
}) {
    const [busy, setBusy] = useState<number | null>(null);
    const toggle = async (topic: TopicRow) => {
        setBusy(topic.id);
        try {
            await http.patch(
                `/admin/subjects/${subject.id}/topics/${topic.id}/toggle`,
            );
            onChanged();
        } finally {
            setBusy(null);
        }
    };

    return (
        <div
            id={`subject-topics-panel-${subject.id}`}
            className={cn(
                'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                open
                    ? 'grid-rows-[1fr] opacity-100'
                    : 'grid-rows-[0fr] opacity-0',
            )}
            aria-hidden={!open}
            inert={!open}
            data-testid={`subject-topics-${subject.key}`}
        >
            <div className="min-h-0 overflow-hidden">
                <div className="ml-9 border-l-2 border-dashed border-border pr-5 pb-3 pl-4 sm:ml-[4.25rem]">
                    {subject.topics.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">
                            {tr(
                                'No topics yet. Add one so AI can write questions focused on it.',
                            )}
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-1.5 pt-1">
                            {subject.topics.map((topic) => (
                                <li
                                    key={topic.id}
                                    data-testid={`topic-row-${topic.id}`}
                                    className={cn(
                                        'relative flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 before:absolute before:top-1/2 before:-left-4 before:h-0.5 before:w-3 before:bg-border sm:flex-nowrap',
                                        !topic.is_active && 'opacity-60',
                                    )}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-foreground">
                                            <span className="break-words">
                                                {topic.name_id}
                                            </span>
                                            {topic.name_en && (
                                                <span className="text-xs font-normal text-muted-foreground">
                                                    {topic.name_en}
                                                </span>
                                            )}
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                                                {tr('{0} questions', [
                                                    topic.questions_count,
                                                ])}
                                            </span>
                                        </p>
                                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                            {topic.material ||
                                                tr(
                                                    'No description yet: AI only knows the topic name.',
                                                )}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <StatusPill active={topic.is_active} />
                                        <IconButton
                                            label={tr('Edit {0}', [
                                                topic.name_id,
                                            ])}
                                            testId={`topic-edit-${topic.id}`}
                                            onClick={() => onEdit(topic)}
                                        >
                                            <Pencil className="size-4" />
                                        </IconButton>
                                        <IconButton
                                            label={
                                                topic.is_active
                                                    ? tr('Hide {0}', [
                                                          topic.name_id,
                                                      ])
                                                    : tr('Show {0}', [
                                                          topic.name_id,
                                                      ])
                                            }
                                            disabled={busy === topic.id}
                                            onClick={() => void toggle(topic)}
                                        >
                                            {topic.is_active ? (
                                                <EyeOff className="size-4" />
                                            ) : (
                                                <Eye className="size-4" />
                                            )}
                                        </IconButton>
                                        <IconButton
                                            label={tr('Delete {0}', [
                                                topic.name_id,
                                            ])}
                                            danger
                                            onClick={() => onDelete(topic)}
                                        >
                                            <Trash2 className="size-4" />
                                        </IconButton>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    <button
                        type="button"
                        onClick={onAdd}
                        className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
                        data-testid={`topic-new-${subject.key}`}
                    >
                        <Plus className="size-3.5" />
                        {tr('New topic')}
                    </button>
                </div>
            </div>
        </div>
    );
}

const EMPTY_TOPIC = {
    name_id: '',
    name_en: '',
    material: '',
    is_active: true,
};

function TopicFormDialog({
    state,
    onClose,
    onSaved,
}: {
    state: { subject: SubjectRow; topic: TopicRow | null } | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const topic = state?.topic ?? null;
    const [form, setForm] = useState(
        topic
            ? {
                  name_id: topic.name_id,
                  name_en: topic.name_en ?? '',
                  material: topic.material ?? '',
                  is_active: topic.is_active,
              }
            : EMPTY_TOPIC,
    );
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const save = async (event: FormEvent) => {
        event.preventDefault();
        if (!state) {
            return;
        }
        const baseUrl = `/admin/subjects/${state.subject.id}/topics`;
        setSaving(true);
        setErrors({});
        const body = {
            ...form,
            name_en: form.name_en.trim() || null,
            material: form.material.trim() || null,
        };
        try {
            const { data, response } = topic
                ? await http.put<{ errors?: Record<string, string[]> }>(
                      `${baseUrl}/${topic.id}`,
                      { body },
                  )
                : await http.post<{ errors?: Record<string, string[]> }>(
                      baseUrl,
                      { body },
                  );
            if (response.status === 422) {
                setErrors(
                    Object.fromEntries(
                        Object.entries(data?.errors ?? {}).map(
                            ([key, messages]) => [key, messages[0] ?? ''],
                        ),
                    ),
                );
                return;
            }
            if (!response.ok) {
                setErrors({ form: tr('Could not save the topic. Try again.') });
                return;
            }
            onSaved();
        } catch {
            setErrors({ form: tr('Could not save the topic. Try again.') });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={state !== null}
            onOpenChange={(next) => !next && onClose()}
        >
            <DialogContent
                className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
                data-testid="topic-dialog"
            >
                <DialogHeader>
                    <DialogTitle>
                        {topic
                            ? tr('Edit {0}', [topic.name_id])
                            : tr('New topic in {0}', [
                                  state?.subject.name_id ?? '',
                              ])}
                    </DialogTitle>
                    <DialogDescription>
                        {tr(
                            'Topics split a subject into material. The description tells the AI question writer what each topic covers.',
                        )}
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={save}
                    className="flex flex-col gap-4"
                    data-testid="topic-form"
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label="Topic name (Indonesian)"
                            error={errors.name_id}
                        >
                            <input
                                value={form.name_id}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        name_id: event.target.value,
                                    })
                                }
                                className={fieldClass}
                                name="name_id"
                                maxLength={120}
                                placeholder={tr('Pecahan')}
                                required
                                autoFocus
                            />
                        </Field>
                        <Field
                            label="Topic name (English)"
                            error={errors.name_en}
                        >
                            <input
                                value={form.name_en}
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        name_en: event.target.value,
                                    })
                                }
                                className={fieldClass}
                                name="name_en"
                                maxLength={120}
                                placeholder={tr('Fractions')}
                            />
                        </Field>
                    </div>
                    <Field
                        label="Topic description for the AI"
                        error={errors.material}
                        hint="Explain what the topic covers: sub-material, key concepts, examples and what to avoid. AI questions for this topic follow it."
                    >
                        <textarea
                            value={form.material}
                            onChange={(event) =>
                                setForm({
                                    ...form,
                                    material: event.target.value,
                                })
                            }
                            className={cn(
                                fieldClass,
                                'min-h-36 py-2 leading-relaxed',
                            )}
                            name="material"
                            rows={7}
                            maxLength={MAX_TOPIC_MATERIAL}
                            placeholder={tr(
                                'Example: Simple fractions, equal denominators, adding and subtracting fractions, comparing fractions with pictures.',
                            )}
                            data-testid="topic-material"
                        />
                        <span className="self-end text-[11px] text-muted-foreground tabular-nums">
                            {form.material.length}/{MAX_TOPIC_MATERIAL}
                        </span>
                    </Field>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(event) =>
                                setForm({
                                    ...form,
                                    is_active: event.target.checked,
                                })
                            }
                            className="size-4 rounded border-input"
                        />
                        {tr('Active')}
                    </label>
                    <InputError message={errors.form} />
                    <div className="flex justify-end gap-3 border-t border-border pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            {tr('Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving || form.name_id.trim().length < 2}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            data-testid="topic-save"
                        >
                            {saving && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            {topic ? tr('Save changes') : tr('Add topic')}
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
            <span className="text-sm font-medium text-foreground">
                {tr(label)}
            </span>
            {children}
            {hint && (
                <p className="text-xs text-muted-foreground">{tr(hint)}</p>
            )}
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
            aria-label={tr(label)}
            title={tr(label)}
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
