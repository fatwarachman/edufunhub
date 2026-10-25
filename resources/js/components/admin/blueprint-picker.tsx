import { ConfirmDialog } from '@/components/admin/admin-kit';
import {
    fieldClass,
    formatDateTime,
    formatNumber,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { router, useForm, usePoll } from '@inertiajs/react';
import {
    Check,
    Download,
    FileText,
    Layers,
    Loader2,
    Pencil,
    RefreshCw,
    Search,
    Sparkles,
    Trash2,
    TriangleAlert,
    Upload,
    X,
} from 'lucide-react';
import {
    type FormEvent,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from 'react';

/** Uploaded question blueprint (kisi-kisi soal) that guides the AI question writer. */
export interface Blueprint {
    id: number;
    title: string;
    subject_key: string | null;
    original_name: string;
    extension: string;
    size: number;
    content: string;
    is_active: boolean;
    characters: number;
    index_status: 'pending' | 'running' | 'ready' | 'failed';
    chunks_count: number;
    embedding_model: string | null;
    index_error: string | null;
    indexed_at: string | null;
    uploaded_by: string | null;
    generations_count: number;
    created_at: string | null;
}

export interface BlueprintLimits {
    extensions: string[];
    maxKb: number;
    maxContent: number;
    budget: number;
    embeddingModel: string | null;
}

const PANEL_CLASS =
    'flex min-w-0 flex-col gap-3 rounded-2xl border-2 border-[#1f2a44] bg-card p-3 shadow-[2px_2px_0_#1f2a44] sm:p-4 dark:border-white/20 dark:shadow-none';

function formatSize(bytes: number): string {
    return bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Pick the blueprint the AI follows for one request, plus upload, preview,
 * edit and delete of blueprints. Lives inside the generate form, so every
 * dialog form stops its submit event from reaching the outer form.
 */
export function BlueprintPicker({
    blueprints,
    limits,
    subjects,
    pickedSubjects,
    value,
    error,
    onChange,
}: {
    blueprints: Blueprint[];
    limits: BlueprintLimits;
    subjects: string[];
    pickedSubjects: string[];
    value: number | null;
    error?: string;
    onChange: (id: number | null) => void;
}) {
    const subjectLabel = useSubjectLabel();
    const [query, setQuery] = useState('');
    const [uploading, setUploading] = useState(false);
    const [editing, setEditing] = useState<Blueprint | null>(null);
    const [deleting, setDeleting] = useState<Blueprint | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const selected = blueprints.find((row) => row.id === value) ?? null;
    const indexing = blueprints.some(
        (row) =>
            row.index_status === 'pending' || row.index_status === 'running',
    );
    const { start, stop } = usePoll(
        3000,
        { only: ['blueprints'] },
        { autoStart: false },
    );
    useEffect(() => {
        if (indexing) {
            start();
        } else {
            stop();
        }
        return stop;
    }, [indexing, start, stop]);
    const needle = query.trim().toLowerCase();
    const rank = (row: Blueprint) =>
        row.subject_key === null
            ? 1
            : pickedSubjects.includes(row.subject_key)
              ? 0
              : 2;
    const visible = blueprints
        .filter(
            (row) =>
                !needle ||
                row.title.toLowerCase().includes(needle) ||
                row.original_name.toLowerCase().includes(needle),
        )
        .sort((a, b) => rank(a) - rank(b) || b.id - a.id);

    const remove = () => {
        if (!deleting) {
            return;
        }
        router.delete(`/admin/questions/blueprints/${deleting.id}`, {
            preserveScroll: true,
            preserveState: true,
            onStart: () => setDeleteBusy(true),
            onSuccess: () => {
                if (value === deleting.id) {
                    onChange(null);
                }
            },
            onFinish: () => {
                setDeleteBusy(false);
                setDeleting(null);
            },
        });
    };

    return (
        <fieldset className={PANEL_CLASS} data-testid="gen-blueprint">
            <legend className="sr-only">{tr('Question blueprint')}</legend>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-[#a5f3c4] text-[#1f2a44]">
                        <FileText className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-sm font-bold text-foreground">
                            {tr('Question blueprint (optional)')}
                        </span>
                        <span
                            className="block text-xs break-words text-muted-foreground"
                            aria-live="polite"
                            data-testid="gen-blueprint-selected"
                        >
                            {selected
                                ? tr('AI follows: {0}', [selected.title])
                                : tr(
                                      'Upload a kisi-kisi document so the AI follows its competencies and indicators.',
                                  )}
                        </span>
                    </span>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    {blueprints.length > 3 && (
                        <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                            <Search
                                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <input
                                type="search"
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                placeholder={tr('Search blueprints…')}
                                aria-label={tr('Search blueprints')}
                                className={cn(fieldClass, 'w-full pr-8 pl-9')}
                                data-testid="gen-blueprint-search"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    aria-label={tr('Clear search')}
                                    className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setUploading(true)}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/70"
                        data-testid="gen-blueprint-upload"
                    >
                        <Upload className="size-4" aria-hidden="true" />
                        {tr('Upload blueprint')}
                    </button>
                </div>
            </div>

            <ul
                className="grid max-h-80 gap-2 overflow-y-auto pr-1 md:grid-cols-2"
                role="radiogroup"
                aria-label={tr('Question blueprint')}
                data-testid="gen-blueprint-list"
            >
                <li className="min-w-0">
                    <BlueprintOption
                        checked={value === null}
                        onSelect={() => onChange(null)}
                        testId="gen-blueprint-none"
                    >
                        <span className="text-sm font-medium text-foreground">
                            {tr('No blueprint')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {tr(
                                'AI follows only the subject, topic, grade and level.',
                            )}
                        </span>
                    </BlueprintOption>
                </li>
                {visible.map((row) => (
                    <li
                        key={row.id}
                        className="flex min-w-0 items-stretch gap-1"
                    >
                        <BlueprintOption
                            checked={value === row.id}
                            disabled={!row.is_active}
                            onSelect={() => onChange(row.id)}
                            testId={`gen-blueprint-${row.id}`}
                        >
                            <span className="text-sm font-medium break-words text-foreground">
                                {row.title}
                            </span>
                            <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium">
                                    {row.subject_key
                                        ? subjectLabel(row.subject_key)
                                        : tr('All subjects')}
                                </span>
                                <span className="uppercase">
                                    {row.extension}
                                </span>
                                · {formatSize(row.size)} ·{' '}
                                {tr('{0} characters', [
                                    formatNumber(row.characters),
                                ])}
                                <IndexBadge blueprint={row} />
                                {!row.is_active && (
                                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                        {tr('Inactive')}
                                    </span>
                                )}
                            </span>
                        </BlueprintOption>
                        <div className="flex shrink-0 flex-col justify-center gap-1">
                            <button
                                type="button"
                                onClick={() => setEditing(row)}
                                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                aria-label={tr('View or edit {0}', [row.title])}
                                title={tr('View or edit')}
                                data-testid={`gen-blueprint-${row.id}-edit`}
                            >
                                <Pencil className="size-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setDeleting(row)}
                                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                aria-label={tr('Delete {0}', [row.title])}
                                title={tr('Delete')}
                                data-testid={`gen-blueprint-${row.id}-delete`}
                            >
                                <Trash2 className="size-4" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
            {blueprints.length > 0 && visible.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                    {tr('No blueprint matches “{0}”.', [query.trim()])}
                </p>
            )}
            {selected && <RetrievalNote blueprint={selected} limits={limits} />}
            <InputError message={error} />

            <UploadDialog
                open={uploading}
                limits={limits}
                subjects={subjects}
                defaultSubject={
                    pickedSubjects.length === 1 ? pickedSubjects[0] : ''
                }
                onClose={() => setUploading(false)}
                onUploaded={(id) => {
                    setUploading(false);
                    onChange(id);
                }}
            />
            <EditDialog
                blueprint={editing}
                limits={limits}
                subjects={subjects}
                onClose={() => setEditing(null)}
            />
            <ConfirmDialog
                open={deleting !== null}
                title="Delete question blueprint?"
                message={tr(
                    '“{0}” and its file will be removed. Questions already generated with it stay in the bank.',
                    [deleting?.title ?? ''],
                )}
                confirmLabel={tr('Delete')}
                processing={deleteBusy}
                onClose={() => setDeleting(null)}
                onConfirm={remove}
            />
        </fieldset>
    );
}

function BlueprintOption({
    checked,
    disabled = false,
    onSelect,
    testId,
    children,
}: {
    checked: boolean;
    disabled?: boolean;
    onSelect: () => void;
    testId: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={onSelect}
            className={cn(
                'flex h-full min-h-16 w-full min-w-0 flex-1 items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                checked
                    ? 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40'
                    : 'border-border hover:bg-muted/60',
            )}
            data-testid={testId}
        >
            <span
                className={cn(
                    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
                    checked
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-input bg-background',
                )}
                aria-hidden="true"
            >
                {checked && <Check className="size-3.5" />}
            </span>
            <span className="flex min-w-0 flex-col gap-1">{children}</span>
        </button>
    );
}

function SubjectSelect({
    subjects,
    value,
    onChange,
    testId,
}: {
    subjects: string[];
    value: string;
    onChange: (value: string) => void;
    testId: string;
}) {
    const subjectLabel = useSubjectLabel();

    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={cn(fieldClass, 'w-full')}
            data-testid={testId}
        >
            <option value="">{tr('All subjects')}</option>
            {subjects.map((subject) => (
                <option key={subject} value={subject}>
                    {subjectLabel(subject)}
                </option>
            ))}
        </select>
    );
}

/** Retrieval state of a blueprint as a small chip. */
function IndexBadge({ blueprint }: { blueprint: Blueprint }) {
    if (
        blueprint.index_status === 'pending' ||
        blueprint.index_status === 'running'
    ) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
                data-testid={`gen-blueprint-${blueprint.id}-indexing`}
            >
                <Loader2
                    className="size-3 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                />
                {tr('Indexing…')}
            </span>
        );
    }
    if (blueprint.index_status === 'failed') {
        return (
            <span
                className="rounded-full bg-red-100 px-1.5 py-0.5 font-medium text-red-800 dark:bg-red-950/60 dark:text-red-300"
                title={blueprint.index_error ?? undefined}
            >
                {tr('Index failed')}
            </span>
        );
    }

    return (
        <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
            title={
                blueprint.embedding_model
                    ? tr('Semantic search with {0}', [
                          blueprint.embedding_model,
                      ])
                    : tr('Keyword search')
            }
            data-testid={`gen-blueprint-${blueprint.id}-indexed`}
        >
            <Layers className="size-3" aria-hidden="true" />
            {tr('{0} sections', [formatNumber(blueprint.chunks_count)])}
            {blueprint.embedding_model && (
                <Sparkles className="size-3" aria-hidden="true" />
            )}
        </span>
    );
}

/** How the AI reads the picked blueprint: only the sections that fit each subject and grade. */
function RetrievalNote({
    blueprint,
    limits,
}: {
    blueprint: Blueprint;
    limits: BlueprintLimits;
}) {
    const searching = blueprint.embedding_model
        ? tr('semantic + keyword search ({0})', [blueprint.embedding_model])
        : tr('keyword search');

    return (
        <div
            className="flex flex-col gap-1 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200"
            data-testid="gen-blueprint-retrieval"
        >
            <span className="flex items-start gap-2 font-medium">
                <Sparkles
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                />
                {blueprint.characters <= limits.budget
                    ? tr('Short blueprint: the AI reads all of it.')
                    : tr(
                          'Long blueprint ({0} characters): for every subject and grade the AI gets only the most relevant sections, up to {1} characters, found with {2}.',
                          [
                              formatNumber(blueprint.characters),
                              formatNumber(limits.budget),
                              searching,
                          ],
                      )}
            </span>
            {blueprint.index_status === 'failed' && blueprint.index_error && (
                <span className="flex items-start gap-2 text-red-700 dark:text-red-300">
                    <TriangleAlert
                        className="mt-0.5 size-3.5 shrink-0"
                        aria-hidden="true"
                    />
                    {blueprint.index_error}
                </span>
            )}
            {blueprint.index_status === 'ready' && blueprint.index_error && (
                <span className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                    <TriangleAlert
                        className="mt-0.5 size-3.5 shrink-0"
                        aria-hidden="true"
                    />
                    {tr(
                        'Semantic search unavailable, keyword search is used: {0}',
                        [blueprint.index_error],
                    )}
                </span>
            )}
        </div>
    );
}

interface PreviewSection {
    position: number;
    heading: string | null;
    preview: string;
    characters: number;
    grades: number[];
    picked: boolean;
}

/** Try which sections the AI receives for one subject and grade. */
function RetrievalPreview({
    blueprint,
    subjects,
}: {
    blueprint: Blueprint;
    subjects: string[];
}) {
    const subjectLabel = useSubjectLabel();
    const [subject, setSubject] = useState(
        blueprint.subject_key ?? subjects[0] ?? '',
    );
    const [grade, setGrade] = useState('');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [result, setResult] = useState<{
        mode: string;
        characters: number;
        sections: PreviewSection[];
    } | null>(null);
    const [showAll, setShowAll] = useState(false);

    const run = () => {
        const params = new URLSearchParams();
        if (subject) params.set('subject', subject);
        if (grade !== '') params.set('grade', grade);
        if (query.trim()) params.set('query', query.trim());
        setLoading(true);
        setFailed(false);
        fetch(
            `/admin/questions/blueprints/${blueprint.id}/preview?${params.toString()}`,
            {
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            },
        )
            .then((response) =>
                response.ok ? response.json() : Promise.reject(response),
            )
            .then((data) => setResult(data))
            .catch(() => setFailed(true))
            .finally(() => setLoading(false));
    };

    const sections = result
        ? showAll
            ? result.sections
            : result.sections.filter((section) => section.picked)
        : [];

    return (
        <section
            className="flex flex-col gap-3 rounded-xl border border-border p-3"
            data-testid="blueprint-preview"
        >
            <div className="flex flex-col gap-0.5">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Search
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                    />
                    {tr('Test what the AI reads')}
                </h4>
                <p className="text-xs text-muted-foreground">
                    {tr(
                        'Pick a subject and grade to see which sections are sent with the request.',
                    )}
                </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
                <select
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className={cn(fieldClass, 'w-full min-w-0')}
                    aria-label={tr('Subject')}
                    data-testid="blueprint-preview-subject"
                >
                    {subjects.map((key) => (
                        <option key={key} value={key}>
                            {subjectLabel(key)}
                        </option>
                    ))}
                </select>
                <select
                    value={grade}
                    onChange={(event) => setGrade(event.target.value)}
                    className={cn(fieldClass, 'w-full min-w-0')}
                    aria-label={tr('Grade')}
                    data-testid="blueprint-preview-grade"
                >
                    <option value="">{tr('Any grade')}</option>
                    {Array.from({ length: 13 }, (_, value) => (
                        <option key={value} value={value}>
                            {value === 0 ? tr('TK') : tr('Grade {0}', [value])}
                        </option>
                    ))}
                </select>
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            run();
                        }
                    }}
                    maxLength={300}
                    placeholder={tr('Topic or keywords (optional)')}
                    className={cn(fieldClass, 'w-full min-w-0')}
                    data-testid="blueprint-preview-query"
                />
                <button
                    type="button"
                    onClick={run}
                    disabled={loading}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-violet-400 bg-violet-50 px-3 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
                    data-testid="blueprint-preview-run"
                >
                    {loading ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <Search className="size-4" />
                    )}
                    {tr('Test')}
                </button>
            </div>
            {failed && (
                <InputError message={tr('The preview could not be loaded.')} />
            )}
            {result && (
                <div
                    className="flex flex-col gap-2"
                    data-testid="blueprint-preview-result"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span aria-live="polite">
                            {tr('{0} of {1} sections · {2} characters · {3}', [
                                result.sections.filter(
                                    (section) => section.picked,
                                ).length,
                                result.sections.length,
                                formatNumber(result.characters),
                                result.mode === 'hybrid'
                                    ? tr('semantic + keyword')
                                    : result.mode === 'whole'
                                      ? tr('whole blueprint')
                                      : tr('keyword'),
                            ])}
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowAll(!showAll)}
                            className="link"
                            data-testid="blueprint-preview-toggle"
                        >
                            {showAll
                                ? tr('Only picked sections')
                                : tr('All sections')}
                        </button>
                    </div>
                    <ol className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
                        {sections.map((section) => (
                            <li
                                key={section.position}
                                className={cn(
                                    'flex min-w-0 flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-xs',
                                    section.picked
                                        ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30'
                                        : 'border-border opacity-70',
                                )}
                                data-picked={section.picked}
                                data-testid="blueprint-preview-section"
                            >
                                <span className="flex flex-wrap items-center gap-1.5 font-semibold text-foreground">
                                    <span className="text-muted-foreground tabular-nums">
                                        #{section.position + 1}
                                    </span>
                                    <span className="min-w-0 break-words">
                                        {section.heading ??
                                            tr('Untitled section')}
                                    </span>
                                    {section.grades.length > 0 && (
                                        <span className="rounded-full bg-muted px-1.5 font-medium text-muted-foreground">
                                            {section.grades.length > 3
                                                ? `${gradeShort(section.grades[0])}–${gradeShort(section.grades[section.grades.length - 1])}`
                                                : section.grades
                                                      .map(gradeShort)
                                                      .join(', ')}
                                        </span>
                                    )}
                                </span>
                                <span className="break-words text-muted-foreground">
                                    {section.preview}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}

const gradeShort = (grade: number) =>
    grade === 0 ? tr('TK') : tr('Grade {0}', [grade]);

const DIALOG_CLASS =
    'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]';

function UploadDialog({
    open,
    limits,
    subjects,
    defaultSubject,
    onClose,
    onUploaded,
}: {
    open: boolean;
    limits: BlueprintLimits;
    subjects: string[];
    defaultSubject: string;
    onClose: () => void;
    onUploaded: (id: number) => void;
}) {
    const fileInput = useRef<HTMLInputElement>(null);
    const form = useForm<{
        title: string;
        subject_key: string;
        is_active: boolean;
        file: File | null;
    }>({ title: '', subject_key: defaultSubject, is_active: true, file: null });
    const { data, setData, errors, processing, progress } = form;
    const accept = limits.extensions.map((ext) => `.${ext}`).join(',');

    const close = () => {
        if (processing) {
            return;
        }
        form.reset();
        form.clearErrors();
        onClose();
    };

    const pick = (file: File | null) => {
        setData((current) => ({
            ...current,
            file,
            title:
                current.title || !file
                    ? current.title
                    : file.name.replace(/\.[^.]+$/, '').slice(0, 150),
        }));
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        event.stopPropagation();
        form.post('/admin/questions/blueprints', {
            forceFormData: true,
            preserveScroll: true,
            preserveState: true,
            onSuccess: (page) => {
                const rows = (page.props as { blueprints?: Blueprint[] })
                    .blueprints;
                const newest = rows?.reduce(
                    (max, row) => Math.max(max, row.id),
                    0,
                );
                form.reset();
                if (newest) {
                    onUploaded(newest);
                } else {
                    onClose();
                }
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && close()}>
            <DialogContent
                className={DIALOG_CLASS}
                data-testid="blueprint-upload-dialog"
            >
                <DialogHeader>
                    <DialogTitle>{tr('Upload question blueprint')}</DialogTitle>
                    <DialogDescription>
                        {tr(
                            'The text of the document is read and sent to the AI with every request that uses it.',
                        )}
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={submit}
                    className="flex flex-col gap-4"
                    data-testid="blueprint-upload-form"
                >
                    <div className="flex flex-col gap-1.5">
                        <button
                            type="button"
                            onClick={() => fileInput.current?.click()}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.preventDefault();
                                pick(event.dataTransfer.files[0] ?? null);
                            }}
                            className={cn(
                                'flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                data.file
                                    ? 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                                    : 'border-border hover:bg-muted/50',
                            )}
                            data-testid="blueprint-dropzone"
                        >
                            <Upload
                                className="size-6 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <span className="text-sm font-medium break-all text-foreground">
                                {data.file
                                    ? `${data.file.name} · ${formatSize(data.file.size)}`
                                    : tr('Choose or drop a file')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {tr(
                                    '{0} · max {1} MB · long files are split into sections',
                                    [
                                        limits.extensions
                                            .map((ext) => ext.toUpperCase())
                                            .join(', '),
                                        limits.maxKb / 1024,
                                    ],
                                )}
                            </span>
                        </button>
                        <input
                            ref={fileInput}
                            type="file"
                            accept={accept}
                            className="sr-only"
                            tabIndex={-1}
                            aria-label={tr('Blueprint file')}
                            onChange={(event) =>
                                pick(event.target.files?.[0] ?? null)
                            }
                            data-testid="blueprint-file"
                        />
                        <span className="text-xs text-muted-foreground">
                            {tr(
                                'Scanned (image) PDFs have no text; use a text PDF, DOCX or XLSX.',
                            )}
                        </span>
                        <InputError message={errors.file} />
                    </div>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                        {tr('Title')}
                        <input
                            value={data.title}
                            onChange={(event) =>
                                setData('title', event.target.value)
                            }
                            maxLength={150}
                            className={cn(fieldClass, 'w-full')}
                            placeholder={tr(
                                'e.g. Kisi-kisi PAS English grade 8',
                            )}
                            data-testid="blueprint-title"
                        />
                        <InputError message={errors.title} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                        {tr('Subject')}
                        <SubjectSelect
                            subjects={subjects}
                            value={data.subject_key}
                            onChange={(value) => setData('subject_key', value)}
                            testId="blueprint-subject"
                        />
                        <InputError message={errors.subject_key} />
                    </label>
                    {progress && (
                        <div
                            className="h-1.5 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuenow={progress.percentage ?? 0}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        >
                            <div
                                className="h-full rounded-full bg-emerald-500 transition-[width]"
                                style={{
                                    width: `${progress.percentage ?? 0}%`,
                                }}
                            />
                        </div>
                    )}
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={close}
                            disabled={processing}
                            className="h-9 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            {tr('Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={processing || !data.file}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            data-testid="blueprint-submit"
                        >
                            {processing ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Upload className="size-4" />
                            )}
                            {tr('Upload')}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function EditDialog({
    blueprint,
    limits,
    subjects,
    onClose,
}: {
    blueprint: Blueprint | null;
    limits: BlueprintLimits;
    subjects: string[];
    onClose: () => void;
}) {
    return (
        <Dialog
            open={blueprint !== null}
            onOpenChange={(next) => !next && onClose()}
        >
            <DialogContent
                className={cn(DIALOG_CLASS, 'sm:max-w-3xl')}
                data-testid="blueprint-edit-dialog"
            >
                {blueprint && (
                    <EditForm
                        key={blueprint.id}
                        blueprint={blueprint}
                        limits={limits}
                        subjects={subjects}
                        onClose={onClose}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function EditForm({
    blueprint,
    limits,
    subjects,
    onClose,
}: {
    blueprint: Blueprint;
    limits: BlueprintLimits;
    subjects: string[];
    onClose: () => void;
}) {
    const form = useForm({
        title: blueprint.title,
        subject_key: blueprint.subject_key ?? '',
        is_active: blueprint.is_active,
        content: blueprint.content,
    });
    const { data, setData, errors, processing } = form;
    const length = data.content.length;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        event.stopPropagation();
        form.put(`/admin/questions/blueprints/${blueprint.id}`, {
            preserveScroll: true,
            preserveState: true,
            onSuccess: onClose,
        });
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle className="break-words">
                    {blueprint.title}
                </DialogTitle>
                <DialogDescription className="break-words">
                    {blueprint.original_name} · {formatSize(blueprint.size)} ·{' '}
                    {formatDateTime(blueprint.created_at)} ·{' '}
                    {blueprint.uploaded_by ?? '—'} ·{' '}
                    {tr('used in {0} requests', [blueprint.generations_count])}
                </DialogDescription>
            </DialogHeader>
            <form
                onSubmit={submit}
                className="flex flex-col gap-4"
                data-testid="blueprint-edit-form"
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                        {tr('Title')}
                        <input
                            value={data.title}
                            onChange={(event) =>
                                setData('title', event.target.value)
                            }
                            maxLength={150}
                            className={cn(fieldClass, 'w-full')}
                            data-testid="blueprint-edit-title"
                        />
                        <InputError message={errors.title} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                        {tr('Subject')}
                        <SubjectSelect
                            subjects={subjects}
                            value={data.subject_key}
                            onChange={(value) => setData('subject_key', value)}
                            testId="blueprint-edit-subject"
                        />
                        <InputError message={errors.subject_key} />
                    </label>
                </div>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                        {tr('Text read by the AI')}
                        <span
                            className="text-xs font-normal text-muted-foreground tabular-nums"
                            data-testid="blueprint-edit-count"
                        >
                            {tr('{0} characters', [formatNumber(length)])}
                        </span>
                    </span>
                    <textarea
                        value={data.content}
                        onChange={(event) =>
                            setData('content', event.target.value)
                        }
                        maxLength={limits.maxContent}
                        rows={14}
                        className="min-h-60 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        data-testid="blueprint-edit-content"
                    />
                    <span className="text-xs font-normal text-muted-foreground">
                        {tr(
                            'Fix text that was read wrongly or remove parts the AI does not need.',
                        )}
                    </span>
                    <InputError message={errors.content} />
                </label>
                <RetrievalPreview blueprint={blueprint} subjects={subjects} />
                <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                        type="checkbox"
                        checked={data.is_active}
                        onChange={(event) =>
                            setData('is_active', event.target.checked)
                        }
                        className="size-4 rounded border-input"
                        data-testid="blueprint-edit-active"
                    />
                    {tr('Active (can be picked for new requests)')}
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() =>
                                router.post(
                                    `/admin/questions/blueprints/${blueprint.id}/reindex`,
                                    {},
                                    {
                                        preserveScroll: true,
                                        preserveState: true,
                                        onSuccess: onClose,
                                    },
                                )
                            }
                            disabled={
                                processing ||
                                blueprint.index_status === 'running'
                            }
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                            data-testid="blueprint-reindex"
                        >
                            <RefreshCw className="size-4" aria-hidden="true" />
                            {tr('Reindex')}
                        </button>
                        <a
                            href={`/admin/questions/blueprints/${blueprint.id}/download`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
                            data-testid="blueprint-download"
                        >
                            <Download className="size-4" aria-hidden="true" />
                            {tr('Original file')}
                        </a>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={processing}
                            className="h-9 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            {tr('Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={processing}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            data-testid="blueprint-edit-save"
                        >
                            {processing && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            {tr('Save')}
                        </button>
                    </div>
                </div>
            </form>
        </>
    );
}
