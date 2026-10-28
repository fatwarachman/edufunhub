import { ConfirmDialog, FlashMessages } from '@/components/admin/admin-kit';
import {
    type Blueprint,
    BlueprintCheck,
    type BlueprintLimits,
    BlueprintMeta,
    EditDialog,
    UploadDialog,
    useBlueprintIndexPolling,
} from '@/components/admin/blueprint-picker';
import {
    EmptyState,
    fieldClass,
    formatDateTime,
    formatNumber,
    Panel,
    StatTile,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    CircleCheck,
    Download,
    FileText,
    Layers,
    Library,
    Pencil,
    Search,
    Sparkles,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { useState } from 'react';

interface Props {
    blueprints: Blueprint[];
    blueprintLimits: BlueprintLimits;
    subjects: string[];
    maxBlueprints: number;
    errors?: Record<string, string>;
}

type StatusFilter = 'all' | 'active' | 'inactive';

const ICON_BUTTON =
    'grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Library of question blueprints (kisi-kisi soal) the AI can follow. */
export default function QuestionBlueprints({
    blueprints,
    blueprintLimits,
    subjects,
    maxBlueprints,
    errors,
}: Props) {
    const subjectLabel = useSubjectLabel();
    const [query, setQuery] = useState('');
    const [subject, setSubject] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [uploading, setUploading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<Blueprint | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [picked, setPicked] = useState<number[]>([]);
    useBlueprintIndexPolling(blueprints);

    const editing = blueprints.find((row) => row.id === editingId) ?? null;
    const needle = query.trim().toLowerCase();
    const visible = blueprints.filter(
        (row) =>
            (!needle ||
                row.title.toLowerCase().includes(needle) ||
                row.original_name.toLowerCase().includes(needle)) &&
            (subject === '' ||
                (subject === '*'
                    ? row.subject_key === null
                    : row.subject_key === subject)) &&
            (status === 'all' || row.is_active === (status === 'active')),
    );
    const filtered = needle !== '' || subject !== '' || status !== 'all';
    const pickedRows = picked
        .map((id) => blueprints.find((row) => row.id === id))
        .filter((row): row is Blueprint => row !== undefined && row.is_active);
    const full = pickedRows.length >= maxBlueprints;
    const selectable = visible.filter((row) => row.is_active);
    const pageIds = selectable.map((row) => row.id);
    const allPicked =
        pageIds.length > 0 && pageIds.every((id) => picked.includes(id));
    const toggle = (row: Blueprint) => {
        if (!row.is_active) {
            return;
        }
        setPicked((current) =>
            current.includes(row.id)
                ? current.filter((id) => id !== row.id)
                : current.length >= maxBlueprints
                  ? current
                  : [...current, row.id],
        );
    };
    const toggleAll = () =>
        setPicked((current) =>
            allPicked
                ? current.filter((id) => !pageIds.includes(id))
                : [
                      ...current,
                      ...pageIds.filter((id) => !current.includes(id)),
                  ].slice(0, maxBlueprints),
        );
    const useForGenerate = () =>
        router.visit(
            `/admin/questions/generate?blueprints=${pickedRows.map((row) => row.id).join(',')}`,
        );
    const activeCount = blueprints.filter((row) => row.is_active).length;
    const usedCount = blueprints.reduce(
        (sum, row) => sum + row.generations_count,
        0,
    );

    const remove = () => {
        if (!deleting) {
            return;
        }
        router.delete(`/admin/questions/blueprints/${deleting.id}`, {
            preserveScroll: true,
            preserveState: true,
            onStart: () => setDeleteBusy(true),
            onSuccess: () =>
                setPicked((current) =>
                    current.filter((id) => id !== deleting.id),
                ),
            onFinish: () => {
                setDeleteBusy(false);
                setDeleting(null);
            },
        });
    };

    return (
        <AdminLayout title="Question blueprints">
            <Head title={tr('Question blueprints')} />
            <div className="flex w-full flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <Link
                            href="/admin/questions"
                            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="size-4" />
                            {tr('Question Bank')}
                        </Link>
                        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-foreground">
                            <Library className="size-6 text-emerald-600 dark:text-emerald-400" />
                            {tr('Question blueprints')}
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            {tr(
                                'Kisi-kisi documents the AI follows when it writes questions. Pick one on the generate page.',
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/admin/questions/generate"
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-400 bg-violet-50 px-4 text-sm font-medium text-violet-700 hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70"
                            data-testid="blueprints-generate"
                        >
                            <Sparkles className="size-4" />
                            {tr('Generate with AI')}
                        </Link>
                        <button
                            type="button"
                            onClick={() => setUploading(true)}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            data-testid="blueprints-upload"
                        >
                            <Upload className="size-4" />
                            {tr('Upload blueprint')}
                        </button>
                    </div>
                </div>

                <FlashMessages errors={errors} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatTile
                        label="Blueprints"
                        value={formatNumber(blueprints.length)}
                        icon={FileText}
                        color="bg-emerald-500"
                    />
                    <StatTile
                        label="Active"
                        value={formatNumber(activeCount)}
                        icon={CircleCheck}
                        color="bg-sky-500"
                    />
                    <StatTile
                        label="Used in AI requests"
                        value={formatNumber(usedCount)}
                        icon={Layers}
                        color="bg-violet-500"
                    />
                </div>

                <Panel
                    title="Blueprint list"
                    description="Long documents are split into sections; the AI gets only the sections that fit each subject and grade."
                    icon={FileText}
                >
                    <div className="flex flex-col gap-4">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_10rem]">
                            <div className="relative min-w-0">
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
                                    className={cn(
                                        fieldClass,
                                        'w-full pr-3 pl-9',
                                    )}
                                    data-testid="blueprints-search"
                                />
                            </div>
                            <select
                                value={subject}
                                onChange={(event) =>
                                    setSubject(event.target.value)
                                }
                                aria-label={tr('Subject')}
                                className={cn(fieldClass, 'w-full min-w-0')}
                                data-testid="blueprints-subject"
                            >
                                <option value="">{tr('Any subject')}</option>
                                <option value="*">
                                    {tr('General (all subjects)')}
                                </option>
                                {subjects.map((key) => (
                                    <option key={key} value={key}>
                                        {subjectLabel(key)}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={status}
                                onChange={(event) =>
                                    setStatus(
                                        event.target.value as StatusFilter,
                                    )
                                }
                                aria-label={tr('Status')}
                                className={cn(fieldClass, 'w-full min-w-0')}
                                data-testid="blueprints-status"
                            >
                                <option value="all">{tr('Any status')}</option>
                                <option value="active">{tr('Active')}</option>
                                <option value="inactive">
                                    {tr('Inactive')}
                                </option>
                            </select>
                        </div>
                        {filtered && (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span aria-live="polite">
                                    {tr('{0} of {1} blueprints', [
                                        visible.length,
                                        blueprints.length,
                                    ])}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuery('');
                                        setSubject('');
                                        setStatus('all');
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
                                    data-testid="blueprints-reset"
                                >
                                    <X className="size-3.5" />
                                    {tr('Reset filters')}
                                </button>
                            </div>
                        )}

                        <div
                            className={cn(
                                'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                                pickedRows.length > 0
                                    ? 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40'
                                    : 'border-dashed border-border',
                            )}
                            data-testid="blueprints-selection"
                        >
                            <div className="flex min-w-0 flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={
                                        allPicked
                                            ? true
                                            : pageIds.some((id) =>
                                                    picked.includes(id),
                                                )
                                              ? 'mixed'
                                              : false
                                    }
                                    onClick={toggleAll}
                                    disabled={pageIds.length === 0}
                                    className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                                    data-testid="blueprints-pick-all"
                                >
                                    <BlueprintCheck checked={allPicked} />
                                    {tr('Pick all')}
                                </button>
                                <span
                                    className="text-xs text-muted-foreground tabular-nums"
                                    aria-live="polite"
                                    data-testid="blueprints-picked-count"
                                >
                                    {pickedRows.length > 0
                                        ? tr('{0} of max {1} picked', [
                                              pickedRows.length,
                                              maxBlueprints,
                                          ])
                                        : tr(
                                              'Tick the blueprints the AI should follow (max {0}).',
                                              [maxBlueprints],
                                          )}
                                </span>
                                {pickedRows.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setPicked([])}
                                        className="link text-xs"
                                        data-testid="blueprints-pick-clear"
                                    >
                                        {tr('Clear')}
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={useForGenerate}
                                disabled={pickedRows.length === 0}
                                className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                                data-testid="blueprints-use"
                            >
                                <Sparkles className="size-4" />
                                {tr('Use to generate questions')}
                            </button>
                        </div>

                        <ResponsiveTable
                            testId="blueprints-table"
                            rows={visible}
                            rowKey={(row) => row.id}
                            onRowClick={(row) => setEditingId(row.id)}
                            rowAriaLabel={(row) =>
                                tr('View or edit {0}', [row.title])
                            }
                            empty={
                                <EmptyState
                                    icon={FileText}
                                    title={
                                        blueprints.length === 0
                                            ? 'No question blueprints yet. Upload one first.'
                                            : 'No blueprint matches the filters.'
                                    }
                                />
                            }
                            actions={(row) => (
                                <RowActions
                                    blueprint={row}
                                    onEdit={() => setEditingId(row.id)}
                                    onDelete={() => setDeleting(row)}
                                />
                            )}
                            rowClassName={(row) =>
                                picked.includes(row.id)
                                    ? 'bg-violet-50/70 dark:bg-violet-950/30'
                                    : undefined
                            }
                            columns={[
                                {
                                    key: 'pick',
                                    header: (
                                        <span className="sr-only">
                                            {tr('Pick')}
                                        </span>
                                    ),
                                    primary: true,
                                    cellClassName: 'w-10',
                                    cell: (row) => (
                                        <PickBox
                                            blueprint={row}
                                            checked={picked.includes(row.id)}
                                            disabled={
                                                !row.is_active ||
                                                (!picked.includes(row.id) &&
                                                    full)
                                            }
                                            onToggle={() => toggle(row)}
                                        />
                                    ),
                                },
                                {
                                    key: 'title',
                                    header: tr('Blueprint'),
                                    primary: true,
                                    cellClassName: 'min-w-56',
                                    cell: (row) => (
                                        <span
                                            className="flex min-w-0 flex-col gap-1"
                                            data-testid="blueprint-row"
                                            data-id={row.id}
                                        >
                                            <span className="font-medium break-words text-foreground">
                                                {row.title}
                                            </span>
                                            <span className="text-xs break-all text-muted-foreground">
                                                {row.original_name}
                                            </span>
                                        </span>
                                    ),
                                },
                                {
                                    key: 'details',
                                    header: tr('Details'),
                                    summary: true,
                                    cell: (row) => (
                                        <BlueprintMeta blueprint={row} />
                                    ),
                                },
                                {
                                    key: 'used',
                                    header: tr('Used'),
                                    align: 'right',
                                    cell: (row) => (
                                        <span className="whitespace-nowrap tabular-nums">
                                            {tr('{0} requests', [
                                                formatNumber(
                                                    row.generations_count,
                                                ),
                                            ])}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'uploaded',
                                    header: tr('Uploaded'),
                                    cell: (row) => (
                                        <span className="flex flex-col text-xs">
                                            <span className="whitespace-nowrap text-foreground">
                                                {formatDateTime(row.created_at)}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {row.uploaded_by ?? '—'}
                                            </span>
                                        </span>
                                    ),
                                },
                                {
                                    key: 'actions',
                                    header: (
                                        <span className="sr-only">
                                            {tr('Actions')}
                                        </span>
                                    ),
                                    align: 'right',
                                    hideInAccordion: true,
                                    cell: (row) => (
                                        <RowActions
                                            blueprint={row}
                                            onEdit={() => setEditingId(row.id)}
                                            onDelete={() => setDeleting(row)}
                                        />
                                    ),
                                },
                            ]}
                        />
                    </div>
                </Panel>
            </div>

            <UploadDialog
                open={uploading}
                limits={blueprintLimits}
                subjects={subjects}
                defaultSubject=""
                onClose={() => setUploading(false)}
                onUploaded={() => setUploading(false)}
            />
            <EditDialog
                blueprint={editing}
                limits={blueprintLimits}
                subjects={subjects}
                onClose={() => setEditingId(null)}
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
        </AdminLayout>
    );
}

function RowActions({
    blueprint,
    onEdit,
    onDelete,
}: {
    blueprint: Blueprint;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <span
            className="inline-flex items-center justify-end gap-1"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
        >
            <button
                type="button"
                onClick={onEdit}
                className={ICON_BUTTON}
                aria-label={tr('View or edit {0}', [blueprint.title])}
                title={tr('View or edit')}
                data-testid={`blueprint-${blueprint.id}-edit`}
            >
                <Pencil className="size-4" />
            </button>
            <a
                href={`/admin/questions/blueprints/${blueprint.id}/download`}
                className={ICON_BUTTON}
                aria-label={tr('Download {0}', [blueprint.title])}
                title={tr('Original file')}
                data-testid={`blueprint-${blueprint.id}-download`}
            >
                <Download className="size-4" />
            </a>
            <button
                type="button"
                onClick={onDelete}
                className={cn(ICON_BUTTON, 'hover:text-destructive')}
                aria-label={tr('Delete {0}', [blueprint.title])}
                title={tr('Delete')}
                data-testid={`blueprint-${blueprint.id}-delete`}
            >
                <Trash2 className="size-4" />
            </button>
        </span>
    );
}

/** Row checkbox; keeps its click from opening the edit dialog. */
function PickBox({
    blueprint,
    checked,
    disabled,
    onToggle,
}: {
    blueprint: Blueprint;
    checked: boolean;
    disabled: boolean;
    onToggle: () => void;
}) {
    return (
        <span
            role="checkbox"
            aria-checked={checked}
            aria-disabled={disabled}
            aria-label={tr('Pick {0}', [blueprint.title])}
            title={
                blueprint.is_active
                    ? tr('Pick for AI questions')
                    : tr('Inactive blueprints cannot be picked')
            }
            tabIndex={disabled ? -1 : 0}
            onClick={(event) => {
                event.stopPropagation();
                if (!disabled) {
                    onToggle();
                }
            }}
            onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!disabled) {
                        onToggle();
                    }
                }
            }}
            className={cn(
                'inline-grid size-8 place-items-center rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                disabled
                    ? 'cursor-not-allowed opacity-40'
                    : 'cursor-pointer hover:bg-muted',
            )}
            data-testid={`blueprint-${blueprint.id}-pick`}
        >
            <BlueprintCheck checked={checked} />
        </span>
    );
}
