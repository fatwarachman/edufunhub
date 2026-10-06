import {
    type ActivityCauser,
    ActivityEventBadge,
    type ActivityProperties,
    type ActivitySubject,
    activityHeadline,
    fieldLabel,
} from '@/components/admin/activity-entry';
import { timeAgo } from '@/components/admin/dashboard-kit';
import { gameLabel } from '@/components/admin/game-stats';
import {
    type ResponsiveColumn,
    ResponsiveTable,
} from '@/components/responsive-table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { AlertCircle, Cog, ExternalLink, Loader2, Lock } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

interface DiffRow {
    field: string;
    before: unknown;
    after: unknown;
    masked: boolean;
}

interface ExtraRow {
    key: string;
    value: unknown;
    masked: boolean;
}

export interface ActivityDetail {
    id: number;
    log_name: string;
    description: string;
    event: string | null;
    causer: ActivityCauser | null;
    subject: ActivitySubject | null;
    changed_fields: string[];
    diff: DiffRow[];
    diff_mode: 'both' | 'before' | 'after' | null;
    properties: ActivityProperties;
    extra: ExtraRow[];
    ip_address: string | null;
    device: string | null;
    batch_uuid: string | null;
    created_at: string;
}

function Value({ value, masked }: { value: unknown; masked?: boolean }) {
    if (masked) {
        return (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Lock className="size-3" />
                {tr('Hidden')}
            </span>
        );
    }
    if (value === null || value === undefined || value === '') {
        return <span className="text-muted-foreground">—</span>;
    }
    if (typeof value === 'boolean') {
        return <>{value ? tr('Yes') : tr('No')}</>;
    }
    if (typeof value === 'object') {
        return (
            <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
                {JSON.stringify(value, null, 2)}
            </pre>
        );
    }

    return (
        <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">
            {String(value)}
        </span>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {label}
            </dt>
            <dd className="min-w-0 text-sm [overflow-wrap:anywhere] text-foreground">
                {children}
            </dd>
        </div>
    );
}

function DiffTable({ detail }: { detail: ActivityDetail }) {
    const mode = detail.diff_mode ?? 'both';
    const columns: ResponsiveColumn<DiffRow>[] = [
        {
            key: 'field',
            header: tr('Field'),
            primary: true,
            headerClassName: 'w-[38%] sm:w-[30%]',
            cellClassName: 'align-top',
            cell: (row) => (
                <span
                    className="font-medium [overflow-wrap:anywhere] text-foreground"
                    data-testid="activity-diff-row"
                    data-field={row.field}
                >
                    {fieldLabel(row.field)}
                </span>
            ),
        },
    ];
    if (mode !== 'after') {
        columns.push({
            key: 'before',
            header: mode === 'both' ? tr('Before') : tr('Value'),
            cellClassName: cn(
                'align-top',
                mode === 'both' && 'bg-red-50 dark:bg-red-950/40',
            ),
            cell: (row) => <Value value={row.before} masked={row.masked} />,
        });
    }
    if (mode !== 'before') {
        columns.push({
            key: 'after',
            header: mode === 'both' ? tr('After') : tr('Value'),
            cellClassName: cn(
                'align-top',
                mode === 'both' && 'bg-green-50 dark:bg-green-950/40',
            ),
            cell: (row) => <Value value={row.after} masked={row.masked} />,
        });
    }

    return (
        <div className="overflow-hidden rounded-xl border border-border has-[[data-layout=accordion]]:border-0">
            <ResponsiveTable
                testId="activity-diff"
                rows={detail.diff}
                rowKey={(row) => row.field}
                columns={columns}
                tableClassName="text-left [&_thead]:bg-muted/50"
            />
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {children}
        </section>
    );
}

function DetailBody({ detail }: { detail: ActivityDetail }) {
    const props = detail.properties;
    const absolute = new Date(detail.created_at).toLocaleString(adminLocale(), {
        dateStyle: 'full',
        timeStyle: 'medium',
    });

    return (
        <div className="space-y-5" data-testid="activity-detail">
            <dl className="divide-y divide-border rounded-xl border border-border px-4">
                <Row label={tr('Actor')}>
                    {detail.causer?.id ? (
                        <Link
                            href={`/admin/users/${detail.causer.id}`}
                            className="font-medium text-primary hover:underline"
                        >
                            {detail.causer.name}
                        </Link>
                    ) : detail.causer ? (
                        <span className="text-muted-foreground">
                            {tr('Deleted account #{0}', [
                                detail.causer.deleted_id,
                            ])}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <Cog className="size-3.5" />
                            {tr('System')}
                        </span>
                    )}
                    {detail.causer?.email && (
                        <span className="block text-xs text-muted-foreground">
                            {detail.causer.email}
                        </span>
                    )}
                </Row>
                {detail.subject && (
                    <Row label={tr('Record')}>
                        <span className="text-muted-foreground">
                            {tr(detail.subject.type)} #{detail.subject.id}
                        </span>
                        {detail.subject.name && (
                            <span className="block font-medium">
                                {detail.subject.url ? (
                                    <Link
                                        href={detail.subject.url}
                                        className="inline-flex items-center gap-1 text-primary hover:underline"
                                        data-testid="activity-subject-link"
                                    >
                                        {detail.subject.name}
                                        <ExternalLink className="size-3" />
                                    </Link>
                                ) : (
                                    detail.subject.name
                                )}
                            </span>
                        )}
                        {detail.subject.detail && (
                            <span className="block text-xs text-muted-foreground">
                                {detail.subject.detail}
                            </span>
                        )}
                        {!detail.subject.exists && (
                            <span className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                {tr('No longer exists')}
                            </span>
                        )}
                    </Row>
                )}
                <Row label={tr('Time')}>
                    {absolute}
                    <span className="block text-xs text-muted-foreground">
                        {timeAgo(detail.created_at)}
                    </span>
                </Row>
                {(detail.ip_address || detail.device) && (
                    <Row label={tr('IP / device')}>
                        {[detail.ip_address, detail.device]
                            .filter(Boolean)
                            .join(' · ')}
                    </Row>
                )}
                <Row label={tr('Log name')}>
                    <code className="font-mono text-xs">{detail.log_name}</code>
                </Row>
                {detail.batch_uuid && (
                    <Row label={tr('Batch')}>
                        <code className="font-mono text-xs">
                            {detail.batch_uuid}
                        </code>
                    </Row>
                )}
            </dl>

            {(detail.event === 'game_finished' ||
                detail.event === 'game_opened') && (
                <Section title={tr('Game')}>
                    <dl className="divide-y divide-border rounded-xl border border-border px-4">
                        <Row label={tr('Game')}>
                            {gameLabel(props.game_key ?? '')}
                        </Row>
                        {props.mission && (
                            <Row label={tr('Mission')}>{props.mission}</Row>
                        )}
                        {detail.event === 'game_finished' && (
                            <>
                                <Row label={tr('Points')}>
                                    {props.points ?? 0}
                                </Row>
                                <Row label={tr('Correct')}>
                                    {props.correct ?? 0}
                                </Row>
                                <Row label={tr('Wrong')}>
                                    {props.wrong ?? 0}
                                </Row>
                            </>
                        )}
                    </dl>
                </Section>
            )}

            {detail.event === 'badge_earned' && props.badge && (
                <Section title={tr('Badge')}>
                    <p className="rounded-xl border border-border px-4 py-3 text-sm font-medium">
                        {props.badge}
                    </p>
                </Section>
            )}

            {detail.diff.length > 0 && (
                <Section
                    title={
                        detail.event === 'created'
                            ? tr('Stored values')
                            : detail.event === 'deleted'
                              ? tr('Last values')
                              : tr('Changes')
                    }
                >
                    <DiffTable detail={detail} />
                </Section>
            )}

            {detail.extra.length > 0 && (
                <Section title={tr('Data')}>
                    <dl className="divide-y divide-border rounded-xl border border-border px-4">
                        {detail.extra.map((row) => (
                            <Row key={row.key} label={fieldLabel(row.key)}>
                                <Value value={row.value} masked={row.masked} />
                            </Row>
                        ))}
                    </dl>
                </Section>
            )}

            {detail.diff.length === 0 &&
                detail.extra.length === 0 &&
                !['game_finished', 'game_opened', 'badge_earned'].includes(
                    detail.event ?? '',
                ) && (
                    <p className="text-sm text-muted-foreground">
                        {tr('No field changes were recorded for this entry.')}
                    </p>
                )}
        </div>
    );
}

/**
 * Detail modal of one activity log entry, loaded on open from
 * GET /admin/activity-log/{id}.
 */
export function ActivityDetailDialog({
    activityId,
    onClose,
}: {
    activityId: number | null;
    onClose: () => void;
}) {
    const [detail, setDetail] = useState<ActivityDetail | null>(null);
    const [failedId, setFailedId] = useState<number | null>(null);

    useEffect(() => {
        if (activityId === null) {
            return;
        }
        const controller = new AbortController();
        fetch(`/admin/activity-log/${activityId}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            signal: controller.signal,
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(String(response.status));
                }
                return response.json();
            })
            .then((data: ActivityDetail) => setDetail(data))
            .catch((error: Error) => {
                if (error.name !== 'AbortError') {
                    setFailedId(activityId);
                }
            });

        return () => controller.abort();
    }, [activityId]);

    const ready = detail !== null && detail.id === activityId;
    const failed = !ready && failedId === activityId;

    return (
        <Dialog
            open={activityId !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <DialogContent
                className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 outline-none sm:max-w-2xl sm:p-6 dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
                data-testid="activity-dialog"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    (event.currentTarget as HTMLElement).focus();
                }}
            >
                <DialogHeader className="pr-6 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                        {ready && <ActivityEventBadge event={detail.event} />}
                        <span className="text-xs text-muted-foreground">
                            {tr('Activity details')}
                            {activityId !== null && ` #${activityId}`}
                        </span>
                    </div>
                    <DialogTitle className="text-base leading-snug [overflow-wrap:anywhere]">
                        {ready ? activityHeadline(detail) : tr('Loading…')}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        {tr('Who did what, when, and which fields changed')}
                    </DialogDescription>
                </DialogHeader>

                {ready ? (
                    <DetailBody detail={detail} />
                ) : failed ? (
                    <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="size-4" />
                        {tr('Could not load the details. Try again.')}
                    </p>
                ) : (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
