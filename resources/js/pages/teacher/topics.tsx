import { TeacherTabs } from '@/components/teacher/teacher-tabs';
import {
    SuccessNotice,
    teacherFieldClass,
    Toggle,
} from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { SubjectIcon } from '@/lib/subjects';
import { router, useForm } from '@inertiajs/react';
import {
    ChevronDown,
    ChevronUp,
    Loader2,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';

interface SubjectRow {
    key: string;
    name_id: string;
    name_en: string | null;
    icon: string;
    color: string;
}

interface TopicRow {
    id: number;
    subject_key: string;
    name_id: string;
    name_en: string | null;
    material: string | null;
    is_active: boolean;
    sort_order: number;
    created_by: number;
    can_edit: boolean;
    questions_count: number;
    created_at: string | null;
}

interface TopicsProps {
    topics: TopicRow[];
    subjects: SubjectRow[];
}

export default function TeacherTopics({ topics, subjects }: TopicsProps) {
    const { t, i18n } = useTranslations();
    const subjectName = (subject: SubjectRow): string =>
        i18n.language?.startsWith('en')
            ? subject.name_en || subject.name_id
            : subject.name_id;
    const [expanded, setExpanded] = useState<Set<string>>(
        new Set(subjects.map((s) => s.key)),
    );
    const [showDialog, setShowDialog] = useState(false);
    const [editingTopic, setEditingTopic] = useState<TopicRow | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<TopicRow | null>(null);

    const toggleSubject = (key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const bySubject = subjects.map((subject) => ({
        subject,
        topics: topics.filter((topic) => topic.subject_key === subject.key),
    }));

    return (
        <PlayerLayout title={t('teacher.topics.pageTitle')}>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-3">
                    <span className="auth-badge">{t('teacher.badge')}</span>
                    <h1 className="text-3xl font-bold tracking-tight break-words md:text-5xl">
                        {t('teacher.topics.heading')}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground">
                        {t('teacher.topics.intro')}
                    </p>
                </div>
            </div>

            <TeacherTabs active="topics" />
            <SuccessNotice />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {bySubject.map(({ subject, topics: subjectTopics }) => (
                    <section
                        key={subject.key}
                        className="auth-card flex min-w-0 flex-col gap-4 !p-5"
                        data-testid={`topic-subject-${subject.key}`}
                    >
                        <div className="flex min-h-11 w-full items-start justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => toggleSubject(subject.key)}
                                className="flex min-w-0 flex-1 flex-col items-start gap-2 text-left"
                                aria-expanded={expanded.has(subject.key)}
                                aria-label={subjectName(subject)}
                            >
                                <span className="flex items-center gap-2">
                                    <span
                                        className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#151b2e] text-[#151b2e]"
                                        style={{
                                            background:
                                                subject.color || '#efeaff',
                                        }}
                                    >
                                        <SubjectIcon
                                            icon={subject.icon}
                                            className="size-5"
                                        />
                                    </span>
                                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[#151b2e] bg-[#fff4cc] text-xs font-bold tabular-nums">
                                        {subjectTopics.length}
                                    </span>
                                </span>
                                <span className="min-w-0 truncate text-base font-bold">
                                    {subjectName(subject)}
                                </span>
                            </button>
                            <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingTopic(null);
                                        setShowDialog(true);
                                    }}
                                    className="inline-flex size-10 items-center justify-center rounded-xl border-2 border-[#151b2e] bg-white shadow-[2px_2px_0px_#151b2e] hover:bg-[#FFF176]"
                                    aria-label={t('teacher.topics.add')}
                                    data-testid={`topic-add-${subject.key}`}
                                >
                                    <Plus className="size-4" />
                                </button>
                                {expanded.has(subject.key) ? (
                                    <ChevronUp
                                        className="size-5 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <ChevronDown
                                        className="size-5 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                )}
                            </div>
                        </div>

                        {expanded.has(subject.key) && (
                            <div className="flex flex-col gap-2">
                                {subjectTopics.length === 0 ? (
                                    <p className="rounded-xl border-2 border-dashed border-[#151b2e]/30 px-4 py-4 text-center text-sm font-semibold text-muted-foreground">
                                        {t('teacher.topics.empty')}
                                    </p>
                                ) : (
                                    subjectTopics.map((topic) => (
                                        <div
                                            key={topic.id}
                                            className="rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                                            data-testid={`topic-row-${topic.id}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold break-words">
                                                        {topic.name_id}
                                                    </p>
                                                    {topic.material && (
                                                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                                            {topic.material}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex shrink-0 gap-1.5">
                                                    {topic.can_edit && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingTopic(
                                                                        topic,
                                                                    );
                                                                    setShowDialog(
                                                                        true,
                                                                    );
                                                                }}
                                                                className="inline-flex size-9 items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-white hover:bg-[#FFF176]"
                                                                aria-label={t(
                                                                    'teacher.topics.edit',
                                                                )}
                                                            >
                                                                <Pencil className="size-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setDeleteConfirm(
                                                                        topic,
                                                                    )
                                                                }
                                                                className="inline-flex size-9 items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-[#ffe1e6] hover:bg-[#ffc9d3]"
                                                                aria-label={t(
                                                                    'teacher.topics.delete',
                                                                )}
                                                            >
                                                                <Trash2 className="size-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                <span>
                                                    {t(
                                                        'teacher.topics.questionsCount',
                                                        {
                                                            count: topic.questions_count,
                                                        },
                                                    )}
                                                </span>
                                                {!topic.is_active && (
                                                    <span className="rounded-full border-2 border-[#1f2a44] bg-[#ffe1e6] px-1.5 py-0.5 font-bold text-[#8e2a3f]">
                                                        {t(
                                                            'teacher.topics.inactive',
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </section>
                ))}
            </div>

            <TopicFormDialog
                open={showDialog}
                onClose={() => {
                    setShowDialog(false);
                    setEditingTopic(null);
                }}
                topic={editingTopic}
                subjects={subjects}
                defaultSubject={''}
            />

            <DeleteTopicDialog
                topic={deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
            />
        </PlayerLayout>
    );
}

function TopicFormDialog({
    open,
    onClose,
    topic,
    subjects,
    defaultSubject,
}: {
    open: boolean;
    onClose: () => void;
    topic: TopicRow | null;
    subjects: SubjectRow[];
    defaultSubject: string;
}) {
    const { t } = useTranslations();
    const form = useForm({
        subject_key: topic?.subject_key ?? defaultSubject,
        name_id: topic?.name_id ?? '',
        name_en: topic?.name_en ?? '',
        material: topic?.material ?? '',
        is_active: topic?.is_active ?? true,
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (topic) {
            form.put(`/teacher/topics/${topic.id}`, {
                preserveScroll: true,
                onSuccess: () => onClose(),
            });
        } else {
            form.post('/teacher/topics', {
                preserveScroll: true,
                onSuccess: () => onClose(),
            });
        }
    };

    if (!open || typeof document === 'undefined') return null;

    const title = topic
        ? t('teacher.topics.editTitle')
        : t('teacher.topics.addTitle');

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1f2a44]/60 p-3 backdrop-blur-sm"
            onPointerDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <form
                onSubmit={submit}
                className="relative flex w-full max-w-lg flex-col gap-5 rounded-3xl border-[3px] border-[#1f2a44] bg-[#FFFDF7] p-5 shadow-[6px_6px_0px_#1f2a44]"
                data-testid="topic-form-dialog"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full border-2 border-[#1f2a44] bg-white hover:bg-[#FFF176]"
                >
                    <X className="size-5" />
                </button>
                <h2 className="pr-10 font-display text-xl font-black">
                    {title}
                </h2>
                <div className="flex flex-col gap-3">
                    {!topic && (
                        <label className="flex flex-col gap-1.5 text-sm font-bold">
                            {t('teacher.topics.subject')}
                            <select
                                value={form.data.subject_key}
                                onChange={(e) =>
                                    form.setData('subject_key', e.target.value)
                                }
                                className={teacherFieldClass}
                                required
                            >
                                <option value="">
                                    {t('teacher.topics.selectSubject')}
                                </option>
                                {subjects.map((subject) => (
                                    <option
                                        key={subject.key}
                                        value={subject.key}
                                    >
                                        {subject.name_id}
                                    </option>
                                ))}
                            </select>
                            {form.errors.subject_key && (
                                <p className="text-xs font-bold text-[#8e2a1f]">
                                    {form.errors.subject_key}
                                </p>
                            )}
                        </label>
                    )}
                    <label className="flex flex-col gap-1.5 text-sm font-bold">
                        {t('teacher.topics.nameId')}
                        <input
                            value={form.data.name_id}
                            onChange={(e) =>
                                form.setData('name_id', e.target.value)
                            }
                            maxLength={120}
                            className={teacherFieldClass}
                            required
                            data-testid="topic-name-id"
                        />
                        {form.errors.name_id && (
                            <p className="text-xs font-bold text-[#8e2a1f]">
                                {form.errors.name_id}
                            </p>
                        )}
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-bold">
                        {t('teacher.topics.nameEn')}
                        <span className="text-xs font-semibold text-muted-foreground">
                            {t('teacher.topics.optional')}
                        </span>
                        <input
                            value={form.data.name_en}
                            onChange={(e) =>
                                form.setData('name_en', e.target.value)
                            }
                            maxLength={120}
                            className={teacherFieldClass}
                            data-testid="topic-name-en"
                        />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-bold">
                        {t('teacher.topics.material')}
                        <span className="text-xs font-semibold text-muted-foreground">
                            {t('teacher.topics.optional')}
                        </span>
                        <textarea
                            value={form.data.material}
                            onChange={(e) =>
                                form.setData('material', e.target.value)
                            }
                            maxLength={5000}
                            rows={4}
                            className={`${teacherFieldClass} py-2`}
                            data-testid="topic-material"
                        />
                    </label>
                    <Toggle
                        pressed={form.data.is_active}
                        onClick={() =>
                            form.setData('is_active', !form.data.is_active)
                        }
                        testId="topic-is-active"
                    >
                        {t('teacher.topics.activeLabel')}
                    </Toggle>
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="edu-nav-btn"
                    >
                        {t('teacher.topics.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={form.processing}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-4 text-sm font-bold text-white shadow-[2px_2px_0px_#f5a623]"
                    >
                        {form.processing && (
                            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                        )}
                        {topic
                            ? t('teacher.topics.save')
                            : t('teacher.topics.create')}
                    </button>
                </div>
            </form>
        </div>,
        document.body,
    );
}

function DeleteTopicDialog({
    topic,
    onClose,
}: {
    topic: TopicRow | null;
    onClose: () => void;
}) {
    const { t } = useTranslations();
    if (!topic) return null;

    const destroy = () => {
        router.delete(`/teacher/topics/${topic.id}`, { preserveScroll: true });
        onClose();
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1f2a44]/60 p-3 backdrop-blur-sm"
            onPointerDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="relative flex w-full max-w-md flex-col gap-4 rounded-3xl border-[3px] border-[#1f2a44] bg-[#FFFDF7] p-5 shadow-[6px_6px_0px_#1f2a44]"
                data-testid="topic-delete-dialog"
            >
                <h2 className="font-display text-xl font-black">
                    {t('teacher.topics.deleteTitle')}
                </h2>
                <p className="text-sm">
                    {t('teacher.topics.deleteBody', { name: topic.name_id })}
                </p>
                {topic.questions_count > 0 && (
                    <p className="rounded-xl border-2 border-[#ffd93d] bg-[#fff4cc] px-3 py-2 text-sm font-bold">
                        {t('teacher.topics.deleteWarning', {
                            count: topic.questions_count,
                        })}
                    </p>
                )}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="edu-nav-btn"
                    >
                        {t('teacher.topics.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={destroy}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#ffe1e6] px-4 text-sm font-bold text-[#8e2a3f] shadow-[2px_2px_0px_#1f2a44]"
                    >
                        <Trash2 className="size-4" />
                        {t('teacher.topics.delete')}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
