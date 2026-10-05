import {
    BadgeMedal,
    type BadgeProgress,
    TIER_STYLE,
} from '@/components/badges';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { Medal } from 'lucide-react';
import { useState } from 'react';

const STAT_ORDER = [
    'plays',
    'completed',
    'success_rate',
    'games',
    'streak',
] as const;

/** Player badge collection with progress towards every badge. */
export function BadgeCollection({
    badges,
    stats,
}: {
    badges: BadgeProgress[];
    stats: Record<string, number>;
}) {
    const { t, i18n } = useTranslations();
    const earned = badges.filter((badge) => badge.earned).length;
    const [selected, setSelected] = useState<string>(
        () =>
            badges.find((badge) => !badge.earned)?.key ??
            badges[badges.length - 1]?.key ??
            '',
    );
    const current = badges.find((badge) => badge.key === selected);
    const number = new Intl.NumberFormat(i18n.language);
    const metricValue = (metric: string, value: number) =>
        metric === 'success_rate' ? `${value}%` : number.format(value);

    return (
        <section
            id="badges"
            className="auth-card flex scroll-mt-24 flex-col gap-5"
            data-testid="badge-collection"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="flex items-center gap-2 text-2xl font-bold">
                        <Medal />
                        {t('badges.title')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t('badges.intro')}
                    </p>
                </div>
                <span className="auth-badge tabular-nums">
                    {t('badges.earned', {
                        count: earned,
                        total: badges.length,
                    })}
                </span>
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {STAT_ORDER.map((metric, index) => (
                    <div
                        key={metric}
                        className={cn(
                            'flex min-w-0 flex-col gap-0.5 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2',
                            index === STAT_ORDER.length - 1 &&
                                'col-span-2 sm:col-span-1',
                        )}
                    >
                        <dt className="truncate text-xs font-semibold text-[#151b2e]/80">
                            {t(`badges.metrics.${metric}`)}
                        </dt>
                        <dd className="text-xl font-bold text-[#151b2e] tabular-nums">
                            {metricValue(metric, stats[metric] ?? 0)}
                        </dd>
                    </div>
                ))}
            </dl>

            <ul
                className="grid grid-cols-3 gap-2 pb-1 sm:grid-cols-5"
                aria-label={t('badges.title')}
            >
                {badges.map((badge) => (
                    <li key={badge.key}>
                        <button
                            type="button"
                            onClick={() => setSelected(badge.key)}
                            aria-pressed={selected === badge.key}
                            data-testid={`badge-${badge.key}`}
                            data-earned={badge.earned}
                            className={cn(
                                'flex h-full w-full flex-col items-center gap-1.5 rounded-xl border-2 px-1.5 py-3 text-center transition-transform focus-visible:ring-2 focus-visible:ring-[#151b2e] focus-visible:outline-none',
                                selected === badge.key
                                    ? 'border-[#151b2e] bg-white shadow-[3px_3px_0_#151b2e]'
                                    : 'border-transparent hover:-translate-y-0.5 hover:bg-white/70',
                            )}
                        >
                            <BadgeMedal
                                badge={badge}
                                size="lg"
                                locked={!badge.earned}
                            />
                            <span
                                className={cn(
                                    'text-sm leading-tight font-bold',
                                    !badge.earned && 'text-[#151b2e]/70',
                                )}
                            >
                                {t(`badges.names.${badge.key}`)}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>

            {current && (
                <div
                    className="flex flex-col gap-3 rounded-xl border-2 border-[#151b2e] bg-white p-4 text-[#151b2e]"
                    data-testid="badge-detail"
                    aria-live="polite"
                >
                    <div className="flex items-center gap-3">
                        <BadgeMedal
                            badge={current}
                            size="md"
                            locked={!current.earned}
                        />
                        <div className="flex min-w-0 flex-col">
                            <span className="font-bold">
                                {t(`badges.names.${current.key}`)}
                                <span
                                    className="ml-2 inline-flex h-5 items-center rounded-full border px-2 align-middle text-[11px] font-semibold"
                                    style={{
                                        background:
                                            TIER_STYLE[current.tier].fill,
                                        borderColor:
                                            TIER_STYLE[current.tier].ring,
                                    }}
                                >
                                    {t(`badges.tiers.${current.tier}`)}
                                </span>
                            </span>
                            <span className="text-sm text-[#151b2e]/70">
                                {current.earned && current.earned_at
                                    ? t('badges.earnedOn', {
                                          date: new Intl.DateTimeFormat(
                                              i18n.language,
                                              { dateStyle: 'medium' },
                                          ).format(new Date(current.earned_at)),
                                      })
                                    : t('badges.progress', {
                                          value: current.progress,
                                      })}
                            </span>
                        </div>
                    </div>
                    <ul className="flex flex-col gap-2">
                        {current.rules.map((rule) => {
                            const percent =
                                rule.need > 0
                                    ? Math.round((rule.have / rule.need) * 100)
                                    : 100;
                            return (
                                <li
                                    key={rule.metric}
                                    className="flex flex-col gap-1"
                                >
                                    <span className="flex items-center justify-between gap-2 text-sm">
                                        <span className="font-semibold">
                                            {t(`badges.metrics.${rule.metric}`)}
                                        </span>
                                        <span className="tabular-nums">
                                            {metricValue(
                                                rule.metric,
                                                rule.have,
                                            )}{' '}
                                            /{' '}
                                            {metricValue(
                                                rule.metric,
                                                rule.need,
                                            )}
                                        </span>
                                    </span>
                                    <span
                                        className="h-2.5 overflow-hidden rounded-full border border-[#151b2e]/30 bg-[#151b2e]/5"
                                        role="progressbar"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={percent}
                                        aria-label={t(
                                            `badges.metrics.${rule.metric}`,
                                        )}
                                    >
                                        <span
                                            className="block h-full rounded-full bg-[#5ad1a6] transition-[width] duration-500"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </section>
    );
}
