import { WhatsAppShareButton } from '@/components/whatsapp-share-button';
import { useTranslations } from '@/hooks/use-translations';
import { buildAbilityShareText } from '@/lib/ability-share';
import { absoluteUrl } from '@/lib/share';
import { SubjectIcon, useSubjectName, useSubjects } from '@/lib/subjects';
import { SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    BrainCircuit,
    ExternalLink,
    Eye,
    Lightbulb,
    Share2,
    Sparkles,
    Sprout,
    ThumbsUp,
    TrendingUp,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

export interface PlayerAbility {
    analyzed_at: string | null;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    subject_scores: Record<string, number>;
    recommendations: string[];
    learning_style: string;
    progress_vs_previous: string;
    /** Signed relative link to the public analysis page. */
    share_url: string;
}

const INK = 'border-[#151b2e]';

function Heading({
    icon: Icon,
    children,
}: {
    icon: typeof Sparkles;
    children: ReactNode;
}) {
    return (
        <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#151b2e]/80 uppercase">
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {children}
        </h3>
    );
}

function Points({ items, tone }: { items: string[]; tone: string }) {
    if (items.length === 0) {
        return <p className="text-sm text-[#151b2e]/60">—</p>;
    }
    return (
        <ul className="flex flex-col gap-1.5">
            {items.map((item, index) => (
                <li
                    key={index}
                    className={`rounded-xl border-2 px-3 py-1.5 text-sm leading-snug [overflow-wrap:anywhere] ${tone}`}
                >
                    {item}
                </li>
            ))}
        </ul>
    );
}

/**
 * The player's latest AI ability analysis, written by an admin-triggered
 * run. Shows the summary, subject scores, strengths and growth areas; the
 * longer parts fold out so the dashboard stays short.
 */
export function AbilityCard({
    ability,
    ownerName,
    defaultOpen = false,
    showPageLink = true,
    title,
}: {
    ability: PlayerAbility | null | undefined;
    /** Name used in the share text; defaults to the signed-in player. */
    ownerName?: string;
    /** Start with tips & details unfolded (the dedicated page). */
    defaultOpen?: boolean;
    /** Show the link to the dedicated analysis page. */
    showPageLink?: boolean;
    /** Card heading; defaults to the player's own "your analysis" label. */
    title?: string;
}) {
    const { t, i18n } = useTranslations();
    const subjectName = useSubjectName();
    const subjects = useSubjects();
    const [open, setOpen] = useState(defaultOpen);
    const [copied, setCopied] = useState(false);
    const panelId = useId();
    const { auth } = usePage<SharedData>().props;
    const userName = ownerName ?? auth?.user?.name ?? '';

    if (!ability) {
        return null;
    }

    const scores = Object.entries(ability.subject_scores).sort(
        (a, b) => b[1] - a[1],
    );
    const date = ability.analyzed_at
        ? new Intl.DateTimeFormat(i18n.language, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          }).format(new Date(ability.analyzed_at))
        : null;
    const hasMore =
        ability.recommendations.length > 0 ||
        ability.learning_style !== '' ||
        ability.progress_vs_previous !== '';

    const shareUrl = absoluteUrl(ability.share_url);

    const buildShareText = (): string =>
        buildAbilityShareText(ability, {
            t,
            subjectName,
            ownerName: userName,
            date,
            shareUrl,
        });

    const handleShare = async () => {
        const text = buildShareText();
        const title = t('playerDash.ability.shareTitle');

        if (navigator.share) {
            try {
                await navigator.share({ title, text });
                return;
            } catch {
                // User cancelled or API failed — fall through to clipboard
            }
        }

        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard unavailable
        }
    };

    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5"
            aria-labelledby="dash-ability-title"
            data-testid="dash-ability"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2
                    id="dash-ability-title"
                    className="flex min-w-0 items-center gap-2 text-lg font-bold sm:text-xl"
                >
                    <span
                        className={`grid size-8 shrink-0 place-items-center rounded-xl border-2 ${INK} bg-[#cfe6ff]`}
                    >
                        <BrainCircuit className="size-4" aria-hidden />
                    </span>
                    {title ?? t('playerDash.ability.title')}
                </h2>
                <div className="flex items-center gap-2">
                    {date && (
                        <span className="text-xs font-semibold text-[#151b2e]/80">
                            {t('playerDash.ability.date', { date })}
                        </span>
                    )}
                    <WhatsAppShareButton
                        compact
                        text={buildShareText()}
                        label={t('playerDash.ability.shareWa')}
                        testId="ability-share-wa"
                        className="size-9"
                    />
                    <div className="relative">
                        <button
                            type="button"
                            onClick={handleShare}
                            className={`grid size-9 shrink-0 place-items-center rounded-xl border-2 ${INK} bg-white shadow-[2px_2px_0_#151b2e] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#151b2e]`}
                            aria-label={t('playerDash.ability.shareBtn')}
                            data-testid="ability-share-btn"
                        >
                            <Share2 className="size-4" aria-hidden />
                        </button>
                        {copied && (
                            <span className="absolute top-full right-0 mt-1 rounded-lg bg-[#151b2e] px-2 py-1 text-xs font-semibold whitespace-nowrap text-white">
                                {t('playerDash.ability.shareCopied')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <p
                className="text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-line"
                data-testid="dash-ability-summary"
            >
                {ability.summary}
            </p>

            {scores.length > 0 && (
                <div className="flex flex-col gap-2">
                    <Heading icon={Sparkles}>
                        {t('playerDash.ability.scores')}
                    </Heading>
                    <ul className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                        {scores.map(([subject, score]) => {
                            const info = subjects.find(
                                (item) => item.key === subject,
                            );
                            return (
                                <li
                                    key={subject}
                                    className="flex min-w-0 flex-col gap-1 sm:last:odd:col-span-2"
                                >
                                    <div className="flex items-center justify-between gap-2 text-sm">
                                        <span className="flex min-w-0 items-center gap-1.5 font-bold">
                                            <SubjectIcon
                                                icon={info?.icon}
                                                className="size-4 shrink-0"
                                            />
                                            <span className="truncate">
                                                {subjectName(subject)}
                                            </span>
                                        </span>
                                        <span className="shrink-0 font-bold tabular-nums">
                                            {score}
                                        </span>
                                    </div>
                                    <div
                                        className={`h-3 overflow-hidden rounded-full border-2 ${INK} bg-white`}
                                        role="meter"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={score}
                                        aria-label={subjectName(subject)}
                                    >
                                        <div
                                            className="h-full"
                                            style={{
                                                width: `${Math.max(0, Math.min(100, score))}%`,
                                                background:
                                                    info?.color ?? '#7cc4ff',
                                            }}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-2">
                    <Heading icon={ThumbsUp}>
                        {t('playerDash.ability.strengths')}
                    </Heading>
                    <Points
                        items={ability.strengths}
                        tone="border-[#151b2e] bg-[#e9fbe9]"
                    />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                    <Heading icon={Sprout}>
                        {t('playerDash.ability.growth')}
                    </Heading>
                    <Points
                        items={ability.weaknesses}
                        tone="border-[#151b2e] bg-[#fff4e0]"
                    />
                </div>
            </div>

            {hasMore && (
                <div className="flex flex-col">
                    <div
                        id={panelId}
                        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${open ? 'mb-4 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                        aria-hidden={!open}
                        inert={!open}
                    >
                        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                            {ability.recommendations.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <Heading icon={Lightbulb}>
                                        {t('playerDash.ability.tips')}
                                    </Heading>
                                    <ol className="flex flex-col gap-2">
                                        {ability.recommendations.map(
                                            (item, index) => (
                                                <li
                                                    key={index}
                                                    className="flex gap-2.5 text-sm"
                                                >
                                                    <span
                                                        className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${INK} bg-[#ffd93d] text-xs font-bold`}
                                                    >
                                                        {index + 1}
                                                    </span>
                                                    <span className="min-w-0 [overflow-wrap:anywhere]">
                                                        {item}
                                                    </span>
                                                </li>
                                            ),
                                        )}
                                    </ol>
                                </div>
                            )}
                            {ability.learning_style !== '' && (
                                <div className="flex flex-col gap-1.5">
                                    <Heading icon={Eye}>
                                        {t('playerDash.ability.style')}
                                    </Heading>
                                    <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">
                                        {ability.learning_style}
                                    </p>
                                </div>
                            )}
                            {ability.progress_vs_previous !== '' && (
                                <div className="flex flex-col gap-1.5">
                                    <Heading icon={TrendingUp}>
                                        {t('playerDash.ability.progress')}
                                    </Heading>
                                    <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">
                                        {ability.progress_vs_previous}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                        aria-controls={panelId}
                        className={`self-start rounded-xl border-2 ${INK} bg-white px-3 py-1.5 text-sm font-bold shadow-[2px_2px_0_#151b2e] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#151b2e]`}
                        data-testid="dash-ability-toggle"
                    >
                        {open
                            ? t('playerDash.ability.less')
                            : t('playerDash.ability.more')}
                    </button>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[#151b2e]/80">
                    {t('playerDash.ability.note')}
                </p>
                {showPageLink && (
                    <Link
                        href={ability.share_url}
                        className={`inline-flex items-center gap-1.5 rounded-xl border-2 ${INK} bg-[#cfe6ff] px-3 py-1.5 text-sm font-bold shadow-[2px_2px_0_#151b2e] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#151b2e]`}
                        data-testid="dash-ability-page"
                    >
                        <ExternalLink className="size-4 shrink-0" aria-hidden />
                        {t('playerDash.ability.openPage')}
                    </Link>
                )}
            </div>
        </section>
    );
}
