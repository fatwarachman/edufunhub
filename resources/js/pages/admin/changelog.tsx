import { ConfirmDialog, FlashMessages } from '@/components/admin/admin-kit';
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
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    Bug,
    History,
    Loader2,
    Lock,
    Pencil,
    Plus,
    Sparkles,
    Tag,
    Trash2,
    TrendingUp,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

type ChangeType = 'feature' | 'improvement' | 'fix';

interface ChangelogEntry {
    id: number;
    version: string;
    title: string;
    title_en: string | null;
    body: string;
    body_en: string | null;
    type: ChangeType;
    is_published: boolean;
    published_at: string | null;
    created_at: string | null;
    recorded: boolean;
}

interface Release {
    version: string;
    date: string | null;
    published: boolean;
    counts: Record<ChangeType, number>;
    entries: ChangelogEntry[];
}

interface Props {
    releases: Release[];
    currentVersion: string;
    types: ChangeType[];
}

/** Semantic Versioning 2.0.0, same pattern as ChangelogEntry::VERSION_PATTERN. */
const VERSION_PATTERN =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Shared accents with the dashboard KPI cards (app.css bubble palette). */
const TYPE_META: Record<
    ChangeType,
    { label: string; plural: string; icon: React.ElementType; accent: string }
> = {
    feature: {
        label: 'New feature',
        plural: 'New features',
        icon: Sparkles,
        accent: 'var(--color-bubble-blue)',
    },
    improvement: {
        label: 'Improvement',
        plural: 'Improvements',
        icon: TrendingUp,
        accent: 'var(--color-bubble-green)',
    },
    fix: {
        label: 'Fix',
        plural: 'Fixes',
        icon: Bug,
        accent: 'var(--color-bubble-orange)',
    },
};

/** Tinted surface of an accent, readable in light and dark mode. */
function tint(accent: string, percent: number): string {
    return `color-mix(in oklab, ${accent} ${percent}%, transparent)`;
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(adminLocale(), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

/** English copy when the panel is in English and the entry has it. */
function localized(primary: string, english: string | null): string {
    return adminLocale() === 'en-GB' && english ? english : primary;
}

/** Next patch / minor / major of a SemVer core (pre-release dropped). */
function nextVersions(current: string): { label: string; version: string }[] {
    const [major, minor, patch] = current
        .split(/[-+]/)[0]
        .split('.')
        .map((part) => Number(part) || 0);
    return [
        { label: 'Patch', version: `${major}.${minor}.${patch + 1}` },
        { label: 'Minor', version: `${major}.${minor + 1}.0` },
        { label: 'Major', version: `${major + 1}.0.0` },
    ];
}

function TypePill({ type }: { type: ChangeType }) {
    const meta = TYPE_META[type];
    const Icon = meta.icon;
    return (
        <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-foreground"
            style={{ background: tint(meta.accent, 18) }}
        >
            <Icon
                className="size-3"
                style={{ color: meta.accent }}
                aria-hidden="true"
            />
            {tr(meta.label)}
        </span>
    );
}

export default function ChangelogIndex({
    releases,
    currentVersion,
    types,
}: Props) {
    const { errors } = usePage<{ errors: Record<string, string> }>().props;
    const [filter, setFilter] = useState<ChangeType | 'all'>('all');
    const [editing, setEditing] = useState<ChangelogEntry | 'new' | null>(null);
    const [deleting, setDeleting] = useState<ChangelogEntry | null>(null);
    const [processing, setProcessing] = useState(false);

    const totals = types.reduce(
        (acc, type) => ({
            ...acc,
            [type]: releases.reduce(
                (sum, release) => sum + release.counts[type],
                0,
            ),
        }),
        {} as Record<ChangeType, number>,
    );
    const totalChanges = types.reduce(
        (sum, type) => sum + (totals[type] ?? 0),
        0,
    );
    const visible = releases
        .map((release) => ({
            ...release,
            entries: release.entries.filter(
                (entry) => filter === 'all' || entry.type === filter,
            ),
        }))
        .filter((release) => release.entries.length > 0);

    return (
        <AdminLayout>
            <Head title={tr('Changelog')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold text-foreground">
                            {tr('Changelog')}
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-sm font-semibold text-primary"
                                data-testid="changelog-current-version"
                            >
                                <Tag className="size-3.5" aria-hidden="true" />v
                                {currentVersion}
                            </span>
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            {tr(
                                'Every change shipped to EduFunHub, grouped by version. Versions follow Semantic Versioning (MAJOR.MINOR.PATCH), starting at 0.0.0.',
                            )}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setEditing('new')}
                        data-testid="changelog-new"
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        {tr('Add note')}
                    </button>
                </div>

                <FlashMessages errors={editing === null ? errors : undefined} />

                <div
                    className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
                    role="group"
                    aria-label={tr('Filter by change type')}
                    data-testid="changelog-filter"
                >
                    <ChangelogStat
                        label="All changes"
                        value={totalChanges}
                        hint={tr('{0} versions', [releases.length])}
                        icon={History}
                        accent="var(--primary)"
                        active={filter === 'all'}
                        onClick={() => setFilter('all')}
                        testId="changelog-filter-all"
                    />
                    {types.map((type) => (
                        <ChangelogStat
                            key={type}
                            label={TYPE_META[type].plural}
                            value={totals[type] ?? 0}
                            hint={tr('{0}% of changes', [
                                totalChanges > 0
                                    ? Math.round(
                                          ((totals[type] ?? 0) / totalChanges) *
                                              100,
                                      )
                                    : 0,
                            ])}
                            share={
                                totalChanges > 0
                                    ? (totals[type] ?? 0) / totalChanges
                                    : 0
                            }
                            icon={TYPE_META[type].icon}
                            accent={TYPE_META[type].accent}
                            active={filter === type}
                            onClick={() =>
                                setFilter(filter === type ? 'all' : type)
                            }
                            testId={`changelog-filter-${type}`}
                        />
                    ))}
                </div>

                {visible.length === 0 ? (
                    <Panel title={tr('Changelog')} icon={History}>
                        <EmptyState
                            icon={History}
                            title={tr('No changes recorded yet')}
                            description={tr(
                                'Changes appear here once they are recorded.',
                            )}
                        />
                    </Panel>
                ) : (
                    <ol
                        className="flex flex-col gap-4"
                        data-testid="changelog-releases"
                    >
                        {visible.map((release) => (
                            <li
                                key={release.version}
                                data-testid={`changelog-release-${release.version}`}
                            >
                                <Panel
                                    title={`v${release.version}`}
                                    description={formatDate(release.date)}
                                    icon={Tag}
                                    actions={
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {release.version ===
                                                currentVersion && (
                                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                                    {tr('Current version')}
                                                </span>
                                            )}
                                            {!release.published && (
                                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                    {tr('Draft')}
                                                </span>
                                            )}
                                        </div>
                                    }
                                >
                                    <ul className="-mx-5 -my-5 divide-y divide-border">
                                        {release.entries.map((entry) => (
                                            <EntryRow
                                                key={entry.id}
                                                entry={entry}
                                                onEdit={() => setEditing(entry)}
                                                onDelete={() =>
                                                    setDeleting(entry)
                                                }
                                            />
                                        ))}
                                    </ul>
                                </Panel>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            <EntryDialog
                key={
                    editing === 'new'
                        ? 'new'
                        : editing
                          ? `edit-${editing.id}`
                          : 'closed'
                }
                entry={editing === 'new' ? null : editing}
                open={editing !== null}
                currentVersion={currentVersion}
                types={types}
                onClose={() => setEditing(null)}
            />
            <ConfirmDialog
                open={deleting !== null}
                title={tr('Delete changelog note?')}
                message={
                    deleting &&
                    tr('“{0}” (v{1}) will be removed from the changelog.', [
                        deleting.title,
                        deleting.version,
                    ])
                }
                confirmLabel={tr('Delete')}
                processing={processing}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    router.delete(`/admin/changelog/${deleting.id}`, {
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

/**
 * Summary card that doubles as the change-type filter: same layout as the
 * dashboard KPI cards, with an accent ring and tint while selected.
 */
function ChangelogStat({
    label,
    value,
    hint,
    share,
    icon: Icon,
    accent,
    active,
    onClick,
    testId,
}: {
    label: string;
    value: number;
    hint: string;
    share?: number;
    icon: React.ElementType;
    accent: string;
    active: boolean;
    onClick: () => void;
    testId: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            data-testid={testId}
            className={cn(
                'group flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5',
                active ? 'border-transparent' : 'border-border',
            )}
            style={
                active
                    ? {
                          background: `linear-gradient(${tint(accent, 10)}, ${tint(accent, 10)}), var(--card)`,
                          boxShadow: `0 0 0 2px ${accent}`,
                      }
                    : undefined
            }
        >
            <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {tr(label)}
                    </span>
                    <span className="font-display text-3xl leading-none font-bold text-foreground tabular-nums">
                        {value}
                    </span>
                </span>
                <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: tint(accent, 16), color: accent }}
                    aria-hidden="true"
                >
                    <Icon className="size-5" />
                </span>
            </span>
            <span className="flex flex-col gap-1.5">
                {share !== undefined && (
                    <span
                        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                    >
                        <span
                            className="block h-full rounded-full transition-[width] duration-500"
                            style={{
                                width: `${Math.round(share * 100)}%`,
                                background: accent,
                            }}
                        />
                    </span>
                )}
                <span className="truncate text-xs text-muted-foreground">
                    {hint}
                </span>
            </span>
        </button>
    );
}

function EntryRow({
    entry,
    onEdit,
    onDelete,
}: {
    entry: ChangelogEntry;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <li
            className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4"
            data-testid={`changelog-entry-${entry.id}`}
        >
            <TypePill type={entry.type} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold break-words text-foreground">
                    {localized(entry.title, entry.title_en)}
                    {!entry.recorded && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {tr('Manual note')}
                        </span>
                    )}
                    {!entry.is_published && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {tr('Draft')}
                        </span>
                    )}
                </p>
                <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
                    {localized(entry.body, entry.body_en)}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 self-end sm:self-start">
                {entry.recorded ? (
                    <span
                        className="inline-flex size-9 items-center justify-center text-muted-foreground/40"
                        title={tr(
                            'Recorded from the release history: read-only',
                        )}
                        aria-label={tr(
                            'Recorded from the release history: read-only',
                        )}
                    >
                        <Lock className="size-4" />
                    </span>
                ) : (
                    <>
                        <IconButton
                            label={tr('Edit {0}', [entry.title])}
                            onClick={onEdit}
                        >
                            <Pencil className="size-4" />
                        </IconButton>
                        <IconButton
                            label={tr('Delete {0}', [entry.title])}
                            onClick={onDelete}
                            danger
                        >
                            <Trash2 className="size-4" />
                        </IconButton>
                    </>
                )}
            </div>
        </li>
    );
}

function EntryDialog({
    entry,
    open,
    currentVersion,
    types,
    onClose,
}: {
    entry: ChangelogEntry | null;
    open: boolean;
    currentVersion: string;
    types: ChangeType[];
    onClose: () => void;
}) {
    const suggestions = nextVersions(currentVersion);
    const form = useForm({
        version: entry?.version ?? suggestions[0].version,
        type: entry?.type ?? ('improvement' as ChangeType),
        title: entry?.title ?? '',
        title_en: entry?.title_en ?? '',
        body: entry?.body ?? '',
        body_en: entry?.body_en ?? '',
        is_published: entry?.is_published ?? true,
    });
    const { data, setData, errors, processing } = form;
    const versionValid = VERSION_PATTERN.test(data.version.trim());

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (entry) {
            form.put(`/admin/changelog/${entry.id}`, options);
        } else {
            form.post('/admin/changelog', options);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent
                className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
                data-testid="changelog-dialog"
            >
                <DialogHeader>
                    <DialogTitle>
                        {entry ? tr('Edit note') : tr('Add changelog note')}
                    </DialogTitle>
                    <DialogDescription>
                        {tr(
                            'Manual notes appear next to the recorded release history.',
                        )}
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={submit}
                    className="flex flex-col gap-5"
                    data-testid="changelog-form"
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label="Version"
                            error={errors.version}
                            hint={tr('Current version: v{0}', [currentVersion])}
                        >
                            <input
                                value={data.version}
                                onChange={(event) =>
                                    setData('version', event.target.value)
                                }
                                className={cn(
                                    fieldClass,
                                    'font-mono',
                                    data.version &&
                                        !versionValid &&
                                        'border-destructive',
                                )}
                                name="version"
                                maxLength={40}
                                placeholder="0.1.0"
                                aria-invalid={!versionValid}
                                required
                            />
                            <div className="flex flex-wrap gap-1.5">
                                {suggestions.map((suggestion) => (
                                    <button
                                        key={suggestion.label}
                                        type="button"
                                        onClick={() =>
                                            setData(
                                                'version',
                                                suggestion.version,
                                            )
                                        }
                                        className={cn(
                                            'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium',
                                            data.version === suggestion.version
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                                        )}
                                    >
                                        {tr(suggestion.label)}
                                        <span className="font-mono">
                                            {suggestion.version}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </Field>
                        <Field label="Change type" error={errors.type}>
                            <select
                                value={data.type}
                                onChange={(event) =>
                                    setData(
                                        'type',
                                        event.target.value as ChangeType,
                                    )
                                }
                                className={fieldClass}
                                name="type"
                            >
                                {types.map((type) => (
                                    <option key={type} value={type}>
                                        {tr(TYPE_META[type].label)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Title (Indonesian)" error={errors.title}>
                            <input
                                value={data.title}
                                onChange={(event) =>
                                    setData('title', event.target.value)
                                }
                                className={fieldClass}
                                name="title"
                                maxLength={255}
                                required
                                autoFocus
                            />
                        </Field>
                        <Field label="Title (English)" error={errors.title_en}>
                            <input
                                value={data.title_en}
                                onChange={(event) =>
                                    setData('title_en', event.target.value)
                                }
                                className={fieldClass}
                                name="title_en"
                                maxLength={255}
                            />
                        </Field>
                    </div>
                    <Field label="Description (Indonesian)" error={errors.body}>
                        <textarea
                            value={data.body}
                            onChange={(event) =>
                                setData('body', event.target.value)
                            }
                            className={cn(fieldClass, 'h-24 py-2')}
                            name="body"
                            maxLength={5000}
                            required
                        />
                    </Field>
                    <Field label="Description (English)" error={errors.body_en}>
                        <textarea
                            value={data.body_en}
                            onChange={(event) =>
                                setData('body_en', event.target.value)
                            }
                            className={cn(fieldClass, 'h-24 py-2')}
                            name="body_en"
                            maxLength={5000}
                        />
                    </Field>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                            type="checkbox"
                            checked={data.is_published}
                            onChange={(event) =>
                                setData('is_published', event.target.checked)
                            }
                            className="size-4 rounded border-input"
                        />
                        {tr('Published')}
                    </label>
                    <InputError
                        message={tr((errors as Record<string, string>).entry)}
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
                            disabled={
                                processing ||
                                !versionValid ||
                                !data.title.trim() ||
                                !data.body.trim()
                            }
                            data-testid="changelog-save"
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {processing && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            {entry ? tr('Save changes') : tr('Add note')}
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
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            <InputError message={error} />
        </div>
    );
}

function IconButton({
    label,
    onClick,
    danger,
    children,
}: {
    label: string;
    onClick: () => void;
    danger?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={cn(
                'inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground',
                danger
                    ? 'hover:bg-destructive/10 hover:text-destructive'
                    : 'hover:bg-muted hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}
