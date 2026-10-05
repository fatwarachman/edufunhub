import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import {
    Brain,
    CalendarCheck,
    Compass,
    Crown,
    Flame,
    Glasses,
    Lightbulb,
    Lock,
    type LucideIcon,
    Medal,
    Palette,
    Sparkles,
    Trophy,
} from 'lucide-react';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'legend';

export interface EarnedBadge {
    key: string;
    icon: string;
    tier: BadgeTier;
    /** Server-translated name (admin pages do not load player locales). */
    name?: string;
}

export interface BadgeProgress extends EarnedBadge {
    earned: boolean;
    earned_at: string | null;
    progress: number;
    rules: { metric: string; need: number; have: number }[];
}

const ICONS: Record<string, LucideIcon> = {
    sparkles: Sparkles,
    sunglasses: Glasses,
    'calendar-check': CalendarCheck,
    palette: Palette,
    trophy: Trophy,
    flame: Flame,
    lightbulb: Lightbulb,
    compass: Compass,
    brain: Brain,
    crown: Crown,
};

/** Fill and ink per tier; readable in light and dark mode. */
export const TIER_STYLE: Record<BadgeTier, { fill: string; ring: string }> = {
    bronze: { fill: '#f6b98a', ring: '#c2723a' },
    silver: { fill: '#a9c1e3', ring: '#4f6b94' },
    gold: { fill: '#ffd93d', ring: '#c99a00' },
    legend: { fill: '#c4a7ff', ring: '#7c4dff' },
};

/** Badge medallion icon, looked up by key outside render-time component maps. */
export function BadgeIcon({
    icon,
    className,
}: {
    icon: string;
    className?: string;
}) {
    const Icon = ICONS[icon] ?? Medal;
    return <Icon className={className} aria-hidden="true" />;
}

/** Round medallion used by the player collection and admin lists. */
export function BadgeMedal({
    badge,
    size = 'md',
    locked = false,
}: {
    badge: EarnedBadge;
    size?: 'sm' | 'md' | 'lg';
    locked?: boolean;
}) {
    const tier = TIER_STYLE[badge.tier] ?? TIER_STYLE.bronze;
    const box =
        size === 'lg' ? 'size-16' : size === 'md' ? 'size-11' : 'size-6';
    const glyph =
        size === 'lg' ? 'size-8' : size === 'md' ? 'size-5' : 'size-3.5';

    return (
        <span
            className={cn(
                'relative inline-flex shrink-0 items-center justify-center rounded-full',
                size === 'sm' ? 'border' : 'border-2',
                box,
                locked
                    ? 'border-[#a39b8b] bg-[#ece7dd] text-[#6b6355] dark:border-slate-500 dark:bg-slate-800 dark:text-slate-300'
                    : 'text-[#151b2e]',
            )}
            style={
                locked
                    ? undefined
                    : { background: tier.fill, borderColor: tier.ring }
            }
        >
            <BadgeIcon icon={badge.icon} className={glyph} />
            {locked && size !== 'sm' && (
                <span className="absolute -right-1.5 -bottom-1.5 inline-flex size-6 items-center justify-center rounded-full border-2 border-[#151b2e] bg-white text-[#151b2e]">
                    <Lock className="size-3" aria-hidden="true" />
                </span>
            )}
        </span>
    );
}

/** Small chip row of earned badges (admin tables, leaderboards). */
export function BadgeChips({
    badges,
    max = 3,
}: {
    badges: EarnedBadge[];
    max?: number;
}) {
    const { t } = useTranslations();
    const label = (badge: EarnedBadge) =>
        badge.name ?? t(`badges.names.${badge.key}`);
    if (badges.length === 0) {
        return null;
    }
    const shown = badges.slice(0, max);
    const rest = badges.length - shown.length;

    return (
        <span
            className="inline-flex items-center gap-1"
            data-testid="badge-chips"
        >
            {shown.map((badge) => (
                <span
                    key={badge.key}
                    title={label(badge)}
                    className="inline-flex"
                >
                    <BadgeMedal badge={badge} size="sm" />
                    <span className="sr-only">{label(badge)}</span>
                </span>
            ))}
            {rest > 0 && (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                    +{rest}
                </span>
            )}
        </span>
    );
}
