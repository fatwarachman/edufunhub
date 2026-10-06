import {
    FlashMessages,
    type Paginated,
    SimplePagination,
} from '@/components/admin/admin-kit';
import {
    EmptyState,
    Panel,
    StatTile,
    fieldClass,
    formatNumber,
    gameLabel,
} from '@/components/admin/game-stats';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, router } from '@inertiajs/react';
import {
    CircleCheck,
    CircleDot,
    Clock,
    Inbox,
    Loader2,
    MessageSquareText,
    Search,
    XCircle,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';

type Status = 'new' | 'in_progress' | 'resolved' | 'dismissed';

interface FeedbackRow {
    id: number;
    type: string;
    status: string;
    message: string;
    page_url: string | null;
    user_agent: string | null;
    game: string | null;
    may_contact: boolean;
    rating: number | null;
    user: { id: number; name: string; email: string } | null;
    created_at: string | null;
    updated_at: string | null;
}

interface Props {
    feedback: Paginated<FeedbackRow>;
    filters: { type?: string; status?: string; search?: string };
    types: string[];
    statuses: Status[];
    counts: Record<'total' | Status, number>;
}

const TYPE_LABELS: Record<string, string> = {
    bug: 'Bug / problem',
    feature: 'Feature idea',
    question: 'Wrong question',
    content: 'Content / game',
    account: 'Account & login',
    other: 'Other',
    experience: 'Experience survey',
    idea: 'Feature idea',
    general: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
    new: 'New',
    in_progress: 'In progress',
    resolved: 'Resolved',
    dismissed: 'Dismissed',
};

const STATUS_TONES: Record<string, string> = {
    new: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200',
    in_progress:
        'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
    resolved:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
    dismissed: 'bg-muted text-muted-foreground',
};

function typeLabel(type: string): string {
    return tr(TYPE_LABELS[type] ?? type);
}

function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
                STATUS_TONES[status] ?? 'bg-muted text-muted-foreground',
            )}
        >
            {tr(STATUS_LABELS[status] ?? status)}
        </span>
    );
}

function formatDate(value: string | null): string {
    if (!value) {
        return '—';
    }
    return new Date(value).toLocaleString(adminLocale(), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function FeedbackIndex({
    feedback,
    filters,
    types,
    statuses,
    counts,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [saving, setSaving] = useState<Status | null>(null);
    const selected = feedback.data.find((item) => item.id === selectedId);

    const apply = (next: Record<string, string | undefined>) =>
        router.get(
            '/admin/feedback',
            Object.fromEntries(
                Object.entries({ ...filters, ...next }).filter(
                    ([, value]) => value,
                ),
            ),
            { preserveScroll: true, preserveState: true },
        );

    const submit = (event: FormEvent) => {
        event.preventDefault();
        apply({ search: search.trim() || undefined });
    };

    const setStatus = (item: FeedbackRow, status: Status) => {
        setSaving(status);
        router.patch(
            `/admin/feedback/${item.id}`,
            { status },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setSaving(null),
            },
        );
    };

    return (
        <AdminLayout>
            <Head title={tr('Feedback')} />
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {tr('Feedback')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Reports and ideas sent by players from the feedback page.',
                        )}
                    </p>
                </div>

                <FlashMessages />

                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                    <StatTile
                        label="New"
                        value={formatNumber(counts.new)}
                        icon={CircleDot}
                        color="bg-sky-500"
                    />
                    <StatTile
                        label="In progress"
                        value={formatNumber(counts.in_progress)}
                        icon={Clock}
                        color="bg-amber-500"
                    />
                    <StatTile
                        label="Resolved"
                        value={formatNumber(counts.resolved)}
                        icon={CircleCheck}
                        color="bg-emerald-500"
                    />
                    <StatTile
                        label="Dismissed"
                        value={formatNumber(counts.dismissed)}
                        icon={XCircle}
                        color="bg-slate-500"
                    />
                </div>

                <Panel
                    title="All feedback"
                    icon={MessageSquareText}
                    actions={
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                            <form
                                onSubmit={submit}
                                className="relative w-full sm:w-auto"
                                role="search"
                            >
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder={tr('Message, name or email')}
                                    className={`${fieldClass} w-full pl-9 sm:w-56`}
                                    aria-label={tr('Search feedback')}
                                    data-testid="admin-feedback-search"
                                />
                            </form>
                            <select
                                value={filters.type ?? ''}
                                onChange={(event) =>
                                    apply({
                                        type: event.target.value || undefined,
                                    })
                                }
                                className={`${fieldClass} min-w-0 flex-1 sm:flex-none`}
                                aria-label={tr('Type')}
                                data-testid="admin-feedback-type"
                            >
                                <option value="">{tr('All types')}</option>
                                {types.map((type) => (
                                    <option key={type} value={type}>
                                        {typeLabel(type)}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={filters.status ?? ''}
                                onChange={(event) =>
                                    apply({
                                        status: event.target.value || undefined,
                                    })
                                }
                                className={`${fieldClass} min-w-0 flex-1 sm:flex-none`}
                                aria-label={tr('Status')}
                                data-testid="admin-feedback-status"
                            >
                                <option value="">{tr('All statuses')}</option>
                                {statuses.map((status) => (
                                    <option key={status} value={status}>
                                        {tr(STATUS_LABELS[status])}
                                    </option>
                                ))}
                            </select>
                        </div>
                    }
                >
                    {feedback.data.length === 0 ? (
                        <EmptyState
                            icon={Inbox}
                            title="No feedback found"
                            description="Feedback from players appears here as soon as it is sent."
                        />
                    ) : (
                        <div className="flex flex-col gap-3">
                            <ul
                                className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border"
                                data-testid="admin-feedback-list"
                            >
                                {feedback.data.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedId(item.id)
                                            }
                                            className="flex w-full min-w-0 flex-col gap-1.5 px-4 py-3 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                                            data-testid="admin-feedback-row"
                                        >
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <span className="text-sm font-semibold text-foreground">
                                                    {typeLabel(item.type)}
                                                </span>
                                                {item.game && (
                                                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                                        {gameLabel(item.game)}
                                                    </span>
                                                )}
                                                <span className="ml-auto">
                                                    <StatusBadge
                                                        status={item.status}
                                                    />
                                                </span>
                                            </div>
                                            <p className="line-clamp-2 text-sm break-words text-foreground/90">
                                                {item.message || '—'}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {item.user?.name ??
                                                    tr('Deleted user')}{' '}
                                                · {formatDate(item.created_at)}
                                            </p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <SimplePagination {...feedback} />
                        </div>
                    )}
                </Panel>
            </div>

            <Sheet
                open={selected !== undefined}
                onOpenChange={(open) => !open && setSelectedId(null)}
            >
                <SheetContent
                    side="right"
                    className="w-full overflow-y-auto sm:max-w-md"
                    data-testid="admin-feedback-detail"
                >
                    {selected && (
                        <>
                            <SheetHeader className="pr-10">
                                <SheetTitle>
                                    {typeLabel(selected.type)}
                                </SheetTitle>
                                <SheetDescription>
                                    {formatDate(selected.created_at)}
                                </SheetDescription>
                            </SheetHeader>
                            <div className="flex flex-col gap-5 px-4 pb-6">
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-medium text-muted-foreground uppercase">
                                        {tr('Status')}
                                    </p>
                                    <div
                                        className="grid grid-cols-2 gap-2"
                                        role="group"
                                        aria-label={tr('Status')}
                                    >
                                        {statuses.map((status) => {
                                            const active =
                                                selected.status === status;
                                            return (
                                                <button
                                                    key={status}
                                                    type="button"
                                                    aria-pressed={active}
                                                    disabled={
                                                        saving !== null ||
                                                        active
                                                    }
                                                    onClick={() =>
                                                        setStatus(
                                                            selected,
                                                            status,
                                                        )
                                                    }
                                                    className={cn(
                                                        'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors',
                                                        active
                                                            ? 'border-primary bg-primary text-primary-foreground'
                                                            : 'border-border hover:bg-muted disabled:opacity-60',
                                                    )}
                                                    data-testid={`admin-feedback-set-${status}`}
                                                >
                                                    {saving === status && (
                                                        <Loader2 className="size-4 animate-spin" />
                                                    )}
                                                    {tr(STATUS_LABELS[status])}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <p className="text-xs font-medium text-muted-foreground uppercase">
                                        {tr('Message')}
                                    </p>
                                    <p className="rounded-xl bg-muted/60 p-3 text-sm break-words whitespace-pre-wrap text-foreground">
                                        {selected.message || '—'}
                                    </p>
                                </div>

                                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                                    <dt className="text-muted-foreground">
                                        {tr('User')}
                                    </dt>
                                    <dd className="min-w-0 break-words text-foreground">
                                        {selected.user ? (
                                            <a
                                                href={`/admin/users/${selected.user.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {selected.user.name}
                                            </a>
                                        ) : (
                                            tr('Deleted user')
                                        )}
                                        {selected.user && (
                                            <span className="block text-xs text-muted-foreground">
                                                {selected.user.email}
                                            </span>
                                        )}
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        {tr('May be contacted')}
                                    </dt>
                                    <dd className="text-foreground">
                                        {selected.may_contact
                                            ? tr('Yes')
                                            : tr('No')}
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        {tr('Game')}
                                    </dt>
                                    <dd className="text-foreground">
                                        {selected.game
                                            ? gameLabel(selected.game)
                                            : '—'}
                                    </dd>
                                    {selected.rating !== null && (
                                        <>
                                            <dt className="text-muted-foreground">
                                                {tr('Rating')}
                                            </dt>
                                            <dd className="text-foreground">
                                                {selected.rating}/5
                                            </dd>
                                        </>
                                    )}
                                    <dt className="text-muted-foreground">
                                        {tr('Page')}
                                    </dt>
                                    <dd className="min-w-0 font-mono text-xs break-all text-foreground">
                                        {selected.page_url ?? '—'}
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        {tr('Device')}
                                    </dt>
                                    <dd className="min-w-0 text-xs break-words text-muted-foreground">
                                        {selected.user_agent ?? '—'}
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        {tr('Last updated')}
                                    </dt>
                                    <dd className="text-foreground">
                                        {formatDate(selected.updated_at)}
                                    </dd>
                                </dl>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </AdminLayout>
    );
}
