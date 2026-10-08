import { type PlayerAbility } from '@/components/ability-card';
import { AbilityHistory } from '@/components/admin/ability-history';
import { ConfirmDialog } from '@/components/admin/admin-kit';
import {
    EmptyState,
    formatDateTime,
    formatDuration,
    formatNumber,
    formatPercent,
    gameLabel,
    Panel,
    rateTone,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import { Skeleton } from '@/components/ui/skeleton';
import { WhatsAppIcon } from '@/components/whatsapp-share-button';
import { useTranslations } from '@/hooks/use-translations';
import { buildAbilityShareText } from '@/lib/ability-share';
import { tr } from '@/lib/admin-i18n';
import { absoluteUrl, shareWhatsApp } from '@/lib/share';
import { useSubjectName } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { router, usePage, usePoll } from '@inertiajs/react';
import {
    BrainCircuit,
    ChevronDown,
    CircleAlert,
    Database,
    Gamepad2,
    Lightbulb,
    Loader2,
    Sparkles,
    ThumbsDown,
    ThumbsUp,
    TrendingUp,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

type Primitive = string | number | boolean | null;

export interface AbilityResult {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    subject_scores: Record<string, number>;
    game_insights: string[];
    recommendations: string[];
    learning_style: string;
    progress_vs_previous: string;
    confidence: string;
}

interface InputGame {
    key: string;
    name: string;
    plays: number;
    correct: number;
    wrong: number;
    accuracy: number | null;
    avg_duration_seconds: number | null;
    peer_accuracy: number | null;
    trend: {
        accuracy_last_30d: number | null;
        accuracy_previous_30d: number | null;
        direction: string | null;
    };
}

interface InputSubject {
    key: string;
    answered: number;
    accuracy: number | null;
    peer_accuracy: number | null;
    peer_players: number;
}

export interface AbilityInput {
    profile?: Record<string, Primitive>;
    period?: Record<string, Primitive>;
    totals?: Record<string, Primitive>;
    games?: InputGame[];
    subjects?: InputSubject[];
    grade_bands?: {
        band: number;
        grades: string;
        answered: number;
        accuracy: number | null;
    }[];
    difficulty?: { tier: string; answered: number; accuracy: number | null }[];
    rankings?: Record<string, string[]>;
    consistency?: Record<string, Primitive>;
    badges?: { count: number; earned: { key: string; name: string }[] };
    recent_results?: {
        date: string;
        game: string;
        points: number;
        accuracy: number | null;
        duration_seconds: number | null;
    }[];
    previous_assessments?: {
        date: string | null;
        summary: string;
        confidence: string | null;
    }[];
}

export interface AbilityAssessment {
    id: number;
    status: 'pending' | 'done' | 'failed';
    model: string | null;
    requested_by: string | null;
    created_at: string | null;
    updated_at: string | null;
    error: string | null;
    result: AbilityResult | null;
    /** Average subject score of a finished analysis. */
    average: number | null;
    /** Model input; only sent for the latest and latest finished analysis. */
    input: AbilityInput | null;
}

export interface ComparisonSubject {
    subject: string;
    previous: number | null;
    current: number | null;
    delta: number | null;
    direction: 'up' | 'down' | 'same' | 'new' | 'gone' | string;
}

/** Latest finished analysis compared with the one before it (server-side). */
export interface AbilityComparisonData {
    previous: { id: number; date: string | null; average: number | null };
    current: { id: number; date: string | null; average: number | null };
    average_delta: number | null;
    direction: string;
    subjects: ComparisonSubject[];
    improved: number;
    declined: number;
    unchanged: number;
    strengths_gained: string[];
    strengths_lost: string[];
    weaknesses_new: string[];
    weaknesses_resolved: string[];
}

export interface AbilityAssessments {
    configured: boolean;
    can_run: boolean;
    model: string | null;
    running: boolean;
    items: AbilityAssessment[];
    /** All analyses of the player (items holds the latest ones). */
    total: number;
    comparison: AbilityComparisonData | null;
    preview: AbilityInput | null;
    /** Player-facing view of the latest finished analysis (WhatsApp share). */
    share?: (PlayerAbility & { owner_name: string }) | null;
}

const POLL_MS = 4000;

const CONFIDENCE: Record<string, { label: string; tone: string }> = {
    rendah: {
        label: 'Low confidence',
        tone: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
    },
    sedang: {
        label: 'Medium confidence',
        tone: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    },
    tinggi: {
        label: 'High confidence',
        tone: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300',
    },
};

const FACT_LABELS: Record<string, string> = {
    alias: 'Alias',
    age: 'Age',
    grade_label: 'Grade',
    school_level: 'School level',
    school: 'School',
    first_played_at: 'First game',
    last_played_at: 'Last game',
    span_days: 'Days covered',
    plays: 'Games played',
    distinct_games: 'Different games',
    points: 'Points',
    correct: 'Correct',
    wrong: 'Wrong',
    accuracy: 'Accuracy',
    active_days: 'Active days',
    play_minutes: 'Minutes played',
    avg_duration_seconds: 'Average game length',
    plays_last_30d: 'Games, last 30 days',
    plays_previous_30d: 'Games, 30 days before',
    active_days_last_30d: 'Active days, last 30 days',
    current_streak_days: 'Current streak (days)',
    longest_streak_days: 'Longest streak (days)',
    avg_plays_per_active_day: 'Games per active day',
    days_since_last_play: 'Days since last game',
    accuracy_spread_last_20: 'Accuracy spread, last 20 games',
};

const TIER_LABELS: Record<string, string> = {
    hard: 'Hard questions',
    medium: 'Medium questions',
    easy: 'Easy questions',
    unrated: 'Not rated yet',
};

const RANKING_LABELS: Record<string, string> = {
    strongest_subjects: 'Strongest subjects',
    weakest_subjects: 'Weakest subjects',
    strongest_games: 'Strongest games',
    weakest_games: 'Weakest games',
};

function factValue(key: string, value: Primitive): string {
    if (value === null || value === '') return '—';
    if (key === 'accuracy') return formatPercent(Number(value));
    if (key === 'avg_duration_seconds') return formatDuration(Number(value));
    if (typeof value === 'number') return formatNumber(value);
    return String(value);
}

function scoreTone(score: number): string {
    if (score >= 70) return 'bg-green-500';
    if (score >= 40) return 'bg-amber-500';
    return 'bg-red-500';
}

/** Placeholder while the deferred assessments load. */
export function AbilityAssessmentSkeleton() {
    return (
        <section
            className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
            aria-busy="true"
            aria-label={tr('Loading AI ability analysis')}
        >
            <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-9 w-40" />
            </div>
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
            </div>
        </section>
    );
}

export function AbilityAssessmentPanel({
    userId,
    data,
}: {
    userId: number;
    data: AbilityAssessments;
}) {
    const errors = usePage<{ errors?: Record<string, string> }>().props.errors;
    const [confirm, setConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [viewedId, setViewedId] = useState<number | null>(null);
    const { start, stop } = usePoll(
        POLL_MS,
        { only: ['abilityAssessments'] },
        { autoStart: false, keepAlive: false },
    );

    useEffect(() => {
        if (data.running) {
            start();
        } else {
            stop();
        }
        return () => stop();
    }, [data.running, start, stop]);

    const latest = data.items[0] ?? null;
    const latestDone =
        data.items.find((item) => item.status === 'done') ?? null;
    const shown =
        data.items.find(
            (item) =>
                item.id === viewedId && item.status === 'done' && item.result,
        ) ?? latestDone;
    const input = latestDone?.input ?? latest?.input ?? data.preview;
    const resultRef = useRef<HTMLDivElement>(null);
    const view = (id: number) => {
        setViewedId(id);
        resultRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    };
    const busy = data.running || submitting;

    const run = () => {
        setSubmitting(true);
        router.post(
            `/admin/users/${userId}/ability-assessments`,
            {},
            {
                preserveScroll: true,
                onFinish: () => {
                    setSubmitting(false);
                    setConfirm(false);
                },
            },
        );
    };

    return (
        <Panel
            title="AI ability analysis"
            description="Manual analysis of this player's results by the configured AI model, for teachers and parents."
            icon={BrainCircuit}
            actions={
                data.can_run && (
                    <button
                        type="button"
                        onClick={() => setConfirm(true)}
                        disabled={busy || !data.configured}
                        data-testid="ability-run"
                        className="inline-flex h-9 max-w-full items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                    >
                        {busy ? (
                            <Loader2 className="size-4 shrink-0 animate-spin" />
                        ) : (
                            <Sparkles className="size-4 shrink-0" />
                        )}
                        <span className="truncate">
                            {busy ? tr('Analysing…') : tr('Run AI analysis')}
                        </span>
                    </button>
                )
            }
        >
            <div className="flex flex-col gap-5" data-testid="ability-panel">
                {!data.configured && (
                    <Notice tone="warning">
                        {tr('Connect an AI server and choose a model first.')}
                    </Notice>
                )}
                {errors?.assessment && (
                    <Notice tone="error">{tr(errors.assessment)}</Notice>
                )}
                {latest?.status === 'pending' && (
                    <Notice tone="info" testId="ability-pending">
                        {tr(
                            'The analysis is running with {0}. This page refreshes when it is ready.',
                            [latest.model ?? '—'],
                        )}
                    </Notice>
                )}
                {latest?.status === 'failed' && (
                    <Notice tone="error" testId="ability-failed">
                        {tr('The last analysis failed: {0}', [
                            latest.error ?? tr('Unknown error'),
                        ])}
                    </Notice>
                )}

                {data.share && <ShareBar share={data.share} />}

                {shown?.result ? (
                    <div
                        ref={resultRef}
                        className="flex scroll-mt-4 flex-col gap-3"
                    >
                        {shown.id !== latestDone?.id && (
                            <Notice
                                tone="warning"
                                testId="ability-viewing-older"
                            >
                                <span>
                                    {tr('Showing an older analysis from {0}.', [
                                        formatDateTime(shown.created_at),
                                    ])}{' '}
                                    <button
                                        type="button"
                                        className="font-medium underline underline-offset-2"
                                        onClick={() => setViewedId(null)}
                                    >
                                        {tr('Show the latest')}
                                    </button>
                                </span>
                            </Notice>
                        )}
                        <ResultView assessment={shown} result={shown.result} />
                    </div>
                ) : (
                    latest?.status !== 'pending' && (
                        <EmptyState
                            icon={BrainCircuit}
                            title="No analysis yet"
                            description="Run the AI analysis to get strengths, weaknesses and recommendations based on this player's games."
                        />
                    )
                )}

                {data.items.length > 0 && (
                    <AbilityHistory
                        items={data.items}
                        total={data.total}
                        comparison={data.comparison}
                        viewedId={shown?.id ?? null}
                        onView={view}
                    />
                )}

                {input && <InputData input={input} />}
            </div>

            <ConfirmDialog
                open={confirm}
                title="Run AI analysis?"
                message={tr(
                    "The player's anonymised game data (age, grade, school and results, without name or email) is sent to {0}. The analysis runs in the background.",
                    [data.model ?? 'AI'],
                )}
                confirmLabel={tr('Run analysis')}
                tone="primary"
                processing={submitting}
                onClose={() => setConfirm(false)}
                onConfirm={run}
            />
        </Panel>
    );
}

/**
 * Send the latest analysis to the parent/teacher on WhatsApp: same text and
 * short page link as the player's own share (labelled "EduFunHub analysis",
 * never "AI"), plus a copy button for other chat apps.
 */
function ShareBar({
    share,
}: {
    share: PlayerAbility & { owner_name: string };
}) {
    const { t, i18n } = useTranslations();
    const subjectName = useSubjectName();
    const [copied, setCopied] = useState(false);
    const date = share.analyzed_at
        ? new Intl.DateTimeFormat(i18n.language, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          }).format(new Date(share.analyzed_at))
        : null;
    const text = () =>
        buildAbilityShareText(share, {
            t,
            subjectName,
            ownerName: share.owner_name,
            date,
            shareUrl: absoluteUrl(share.share_url),
        });
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text());
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard unavailable (insecure origin): nothing to copy into.
        }
    };

    return (
        <div
            className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900/60 dark:bg-emerald-950/30"
            data-testid="ability-share"
        >
            <p className="min-w-0 text-sm text-emerald-900 dark:text-emerald-100">
                <span className="font-medium">
                    {tr('Share the analysis with parents or teachers')}
                </span>
                <span className="block text-xs text-emerald-800/80 dark:text-emerald-200/80">
                    {tr(
                        'Sends the summary, scores and tips of the latest analysis with a short link to its page.',
                    )}
                </span>
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => shareWhatsApp(text())}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#128C4A] px-3.5 text-sm font-medium text-white shadow-sm hover:bg-[#0E7A40] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    data-testid="ability-share-wa-admin"
                >
                    <WhatsAppIcon className="size-4 shrink-0" />
                    {tr('Share on WhatsApp')}
                </button>
                <button
                    type="button"
                    onClick={copy}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    data-testid="ability-share-copy"
                    aria-live="polite"
                >
                    {copied ? tr('Copied') : tr('Copy text')}
                </button>
            </div>
        </div>
    );
}

function Notice({
    tone,
    children,
    testId,
}: {
    tone: 'info' | 'warning' | 'error';
    children: ReactNode;
    testId?: string;
}) {
    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'}
            data-testid={testId}
            className={cn(
                'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm [overflow-wrap:anywhere]',
                tone === 'info' &&
                    'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
                tone === 'warning' &&
                    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
                tone === 'error' &&
                    'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
            )}
        >
            {tone === 'info' ? (
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
            ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
            )}
            <span className="min-w-0">{children}</span>
        </div>
    );
}

function Meta({ assessment }: { assessment: AbilityAssessment }) {
    return (
        <p className="text-xs [overflow-wrap:anywhere] text-muted-foreground">
            {[
                formatDateTime(assessment.created_at),
                assessment.model,
                assessment.requested_by &&
                    tr('by {0}', [assessment.requested_by]),
            ]
                .filter(Boolean)
                .join(' · ')}
        </p>
    );
}

function ResultView({
    assessment,
    result,
}: {
    assessment: AbilityAssessment;
    result: AbilityResult;
}) {
    const confidence = CONFIDENCE[result.confidence] ?? CONFIDENCE.sedang;

    return (
        <div className="flex flex-col gap-5" data-testid="ability-result">
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                            confidence.tone,
                        )}
                    >
                        {tr(confidence.label)}
                    </span>
                    <Meta assessment={assessment} />
                </div>
                <p
                    className="text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-line text-foreground"
                    data-testid="ability-summary"
                >
                    {result.summary}
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ChipGroup
                    title="Strengths"
                    icon={ThumbsUp}
                    items={result.strengths}
                    tone="border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
                />
                <ChipGroup
                    title="Needs support"
                    icon={ThumbsDown}
                    items={result.weaknesses}
                    tone="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SubjectScores scores={result.subject_scores} />
                <div className="flex min-w-0 flex-col gap-2">
                    <SectionTitle icon={Lightbulb} title="Recommendations" />
                    {result.recommendations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                        <ol className="flex flex-col gap-2">
                            {result.recommendations.map((item, index) => (
                                <li
                                    key={index}
                                    className="flex gap-2.5 text-sm text-foreground"
                                >
                                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                                        {index + 1}
                                    </span>
                                    <span className="min-w-0 [overflow-wrap:anywhere]">
                                        {item}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>

            {result.game_insights.length > 0 && (
                <div className="flex flex-col gap-2">
                    <SectionTitle icon={Gamepad2} title="Game insights" />
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-foreground marker:text-muted-foreground">
                        {result.game_insights.map((item, index) => (
                            <li
                                key={index}
                                className="[overflow-wrap:anywhere]"
                            >
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextBlock
                    icon={BrainCircuit}
                    label="Learning style"
                    value={result.learning_style}
                />
                <TextBlock
                    icon={TrendingUp}
                    label="Progress since the previous analysis"
                    value={result.progress_vs_previous}
                />
            </dl>
        </div>
    );
}

function SectionTitle({
    icon: Icon,
    title,
}: {
    icon: React.ElementType;
    title: string;
}) {
    return (
        <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Icon className="size-3.5 shrink-0" />
            {tr(title)}
        </h4>
    );
}

function ChipGroup({
    title,
    icon,
    items,
    tone,
}: {
    title: string;
    icon: React.ElementType;
    items: string[];
    tone: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <SectionTitle icon={icon} title={title} />
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
            ) : (
                <ul className="flex flex-wrap gap-1.5">
                    {items.map((item, index) => (
                        <li
                            key={index}
                            className={cn(
                                'max-w-full rounded-lg border px-2.5 py-1 text-xs leading-snug [overflow-wrap:anywhere]',
                                tone,
                            )}
                        >
                            {item}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function SubjectScores({ scores }: { scores: Record<string, number> }) {
    const subjectLabel = useSubjectLabel();
    const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <SectionTitle icon={Sparkles} title="Subject scores" />
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {tr('No subject data yet')}
                </p>
            ) : (
                <ul
                    className="flex flex-col gap-2.5"
                    data-testid="ability-scores"
                >
                    {rows.map(([subject, score]) => (
                        <li key={subject} className="flex flex-col gap-1">
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate text-foreground">
                                    {subjectLabel(subject)}
                                </span>
                                <span className="font-semibold text-foreground tabular-nums">
                                    {score}
                                </span>
                            </div>
                            <div
                                className="h-2 overflow-hidden rounded-full bg-muted"
                                role="meter"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={score}
                                aria-label={subjectLabel(subject)}
                            >
                                <div
                                    className={cn(
                                        'h-full rounded-full',
                                        scoreTone(score),
                                    )}
                                    style={{ width: `${score}%` }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function TextBlock({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-muted/30 p-3.5">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                {tr(label)}
            </dt>
            <dd className="text-sm [overflow-wrap:anywhere] text-foreground">
                {value || '—'}
            </dd>
        </div>
    );
}

function Disclosure({
    title,
    icon: Icon,
    meta,
    children,
    testId,
}: {
    title: ReactNode;
    icon: React.ElementType;
    meta?: ReactNode;
    children: ReactNode;
    testId?: string;
}) {
    const [open, setOpen] = useState(false);
    const id = useId();

    return (
        <div
            className="min-w-0 rounded-xl border border-border"
            data-testid={testId}
        >
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-controls={id}
                className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                    <span className="block font-medium [overflow-wrap:anywhere] text-foreground">
                        {title}
                    </span>
                    {meta && (
                        <span className="block text-xs [overflow-wrap:anywhere] text-muted-foreground">
                            {meta}
                        </span>
                    )}
                </span>
                <ChevronDown
                    className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                        open && 'rotate-180',
                    )}
                />
            </button>
            <div
                id={id}
                className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                    open
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0',
                )}
                aria-hidden={!open}
                inert={!open}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="border-t border-border p-3.5">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function FactGrid({
    title,
    facts,
}: {
    title: string;
    facts: Record<string, Primitive> | undefined;
}) {
    const rows = Object.entries(facts ?? {}).filter(
        ([key]) => key in FACT_LABELS,
    );
    if (rows.length === 0) return null;

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <h5 className="text-xs font-semibold text-muted-foreground">
                {tr(title)}
            </h5>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                {rows.map(([key, value]) => (
                    <div key={key} className="min-w-0">
                        <dt className="truncate text-xs text-muted-foreground">
                            {tr(FACT_LABELS[key])}
                        </dt>
                        <dd className="font-medium [overflow-wrap:anywhere] text-foreground tabular-nums">
                            {factValue(key, value)}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function DataTable({
    title,
    head,
    rows,
}: {
    title: string;
    head: string[];
    rows: ReactNode[][];
}) {
    if (rows.length === 0) return null;

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <h5 className="text-xs font-semibold text-muted-foreground">
                {tr(title)}
            </h5>
            <ResponsiveTable
                rows={rows}
                rowKey={(_, rowIndex) => rowIndex}
                className="rounded-lg border border-border"
                tableClassName="text-xs"
                columns={head.map((label, index) => ({
                    key: `${index}-${label}`,
                    header: tr(label),
                    primary: index === 0,
                    align: index > 0 ? ('right' as const) : ('left' as const),
                    headerClassName:
                        'bg-muted/50 px-2.5 py-1.5 normal-case tracking-normal first:pl-2.5 last:pr-2.5',
                    cellClassName: cn(
                        'px-2.5 py-1.5 text-foreground first:pl-2.5 last:pr-2.5',
                        index > 0 && 'tabular-nums',
                    ),
                    cell: (cells: ReactNode[]) => cells[index],
                }))}
            />
        </div>
    );
}

function Rate({ value }: { value: number | null | undefined }) {
    return <span className={rateTone(value)}>{formatPercent(value)}</span>;
}

function InputData({ input }: { input: AbilityInput }) {
    const subjectLabel = useSubjectLabel();
    const rankings = Object.entries(input.rankings ?? {}).filter(
        ([, items]) => items.length > 0,
    );

    return (
        <Disclosure
            icon={Database}
            title={tr('Data analysed')}
            meta={tr(
                'Anonymised input prepared for the AI model (no name or email).',
            )}
            testId="ability-input"
        >
            <div className="flex flex-col gap-4">
                <FactGrid title="Profile" facts={input.profile} />
                <FactGrid
                    title="Totals"
                    facts={{ ...(input.period ?? {}), ...(input.totals ?? {}) }}
                />
                <DataTable
                    title="Per game"
                    head={[
                        'Game',
                        'Plays',
                        'Accuracy',
                        'Last 30 days',
                        '30 days before',
                        'Same grade',
                        'Avg. length',
                    ]}
                    rows={(input.games ?? []).map((game) => [
                        gameLabel(game.key),
                        formatNumber(game.plays),
                        <Rate key="a" value={game.accuracy} />,
                        <Rate key="r" value={game.trend.accuracy_last_30d} />,
                        <Rate
                            key="p"
                            value={game.trend.accuracy_previous_30d}
                        />,
                        <Rate key="g" value={game.peer_accuracy} />,
                        formatDuration(game.avg_duration_seconds),
                    ])}
                />
                <DataTable
                    title="Per subject"
                    head={[
                        'Subject',
                        'Answered',
                        'Accuracy',
                        'Same grade',
                        'Players compared',
                    ]}
                    rows={(input.subjects ?? []).map((subject) => [
                        subjectLabel(subject.key),
                        formatNumber(subject.answered),
                        <Rate key="a" value={subject.accuracy} />,
                        <Rate key="g" value={subject.peer_accuracy} />,
                        formatNumber(subject.peer_players),
                    ])}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <DataTable
                        title="Question difficulty"
                        head={['Level', 'Answered', 'Accuracy']}
                        rows={(input.difficulty ?? []).map((row) => [
                            tr(TIER_LABELS[row.tier] ?? row.tier),
                            formatNumber(row.answered),
                            <Rate key="a" value={row.accuracy} />,
                        ])}
                    />
                    <DataTable
                        title="Question grade band"
                        head={['Grades', 'Answered', 'Accuracy']}
                        rows={(input.grade_bands ?? []).map((row) => [
                            row.grades,
                            formatNumber(row.answered),
                            <Rate key="a" value={row.accuracy} />,
                        ])}
                    />
                </div>
                <FactGrid title="Consistency" facts={input.consistency} />
                {rankings.length > 0 && (
                    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        {rankings.map(([key, items]) => (
                            <div key={key} className="min-w-0">
                                <dt className="text-xs text-muted-foreground">
                                    {tr(RANKING_LABELS[key] ?? key)}
                                </dt>
                                <dd className="[overflow-wrap:anywhere] text-foreground">
                                    {items.join(', ')}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
                {input.badges && input.badges.count > 0 && (
                    <p className="text-sm [overflow-wrap:anywhere] text-foreground">
                        <span className="text-xs text-muted-foreground">
                            {tr('Badges ({0})', [input.badges.count])}:{' '}
                        </span>
                        {input.badges.earned
                            .map((badge) => badge.name)
                            .join(', ')}
                    </p>
                )}
                <DataTable
                    title="Recent results"
                    head={['Date', 'Game', 'Points', 'Accuracy', 'Length']}
                    rows={(input.recent_results ?? []).map((row) => [
                        row.date,
                        gameLabel(row.game),
                        formatNumber(row.points),
                        <Rate key="a" value={row.accuracy} />,
                        formatDuration(row.duration_seconds),
                    ])}
                />
                {(input.previous_assessments ?? []).length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <h5 className="text-xs font-semibold text-muted-foreground">
                            {tr('Previous analyses sent as context')}
                        </h5>
                        <ul className="flex flex-col gap-1.5 text-sm">
                            {input.previous_assessments!.map((item, index) => (
                                <li
                                    key={index}
                                    className="[overflow-wrap:anywhere]"
                                >
                                    <span className="text-xs text-muted-foreground">
                                        {item.date ?? '—'}:{' '}
                                    </span>
                                    {item.summary}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Disclosure>
    );
}
