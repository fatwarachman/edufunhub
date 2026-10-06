import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';

export interface CampaignStats {
    impressions: number;
    clicks: number;
    plays: number;
    today?: number;
}

export interface CampaignRow {
    id: number;
    name: string;
    advertiser_id: number;
    advertiser_name: string | null;
    advertiser_logo: string | null;
    status: 'draft' | 'active' | 'paused' | 'ended';
    display_status:
        'draft' | 'live' | 'scheduled' | 'expired' | 'paused' | 'ended';
    starts_on: string;
    ends_on: string;
    duration_days: number;
    days_left: number;
    pricing_model: 'flat' | 'cpm' | 'cpc';
    contract_value: number;
    max_impressions: number | null;
    daily_max_impressions: number | null;
    weight: number;
    target_games: string[];
    grade_min: number | null;
    grade_max: number | null;
    creatives_count: number;
    contract_number?: string | null;
    notes?: string | null;
    stats?: CampaignStats;
}

export interface AdvertiserRow {
    id: number;
    name: string;
    brand: string | null;
    industry: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    logo_url: string | null;
    is_active: boolean;
    campaigns_count?: number;
    live_campaigns?: number;
    tax_id?: string | null;
    address?: string | null;
    notes?: string | null;
}

export interface SizeSpec {
    label: string;
    width: number;
    height: number;
}

export interface PlacementSpec {
    key: string;
    label: string;
    types: string[];
    sizes?: string[];
    moment?: string | null;
}

export interface DailyPoint {
    day: string;
    impressions: number;
    clicks: number;
    plays: number;
}

export const TYPE_LABELS: Record<string, string> = {
    logo: 'Logo placement',
    motto: 'Motto (tagline)',
    jingle: 'Jingle (audio)',
    item: 'Sponsored character item',
};

export const PRICING_LABELS: Record<string, string> = {
    flat: 'Flat fee',
    cpm: 'CPM (per 1,000 impressions)',
    cpc: 'CPC (per click)',
};

export const STATUS_STYLES: Record<string, string> = {
    live: 'bg-green-500/15 text-green-700 dark:text-green-400',
    scheduled: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    paused: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    draft: 'bg-muted text-muted-foreground',
    expired: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    ended: 'bg-muted text-muted-foreground',
};

export function CampaignStatus({ status }: { status: string }) {
    return (
        <span
            className={cn(
                'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium capitalize',
                STATUS_STYLES[status] ?? STATUS_STYLES.draft,
            )}
            data-testid="campaign-status"
            data-status={status}
        >
            {status}
        </span>
    );
}

export function formatRupiah(value: number | null | undefined): string {
    return tr('Rp {0}', [(value ?? 0).toLocaleString('id-ID')]);
}

export function formatDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString(adminLocale(), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export function ctr(stats?: CampaignStats): string {
    if (!stats || stats.impressions === 0) return '—';
    return `${((stats.clicks / stats.impressions) * 100).toFixed(2)}%`;
}

export function BrandMark({
    name,
    logo,
    className,
}: {
    name: string | null;
    logo: string | null;
    className?: string;
}) {
    return (
        <span
            className={cn(
                'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white text-sm font-bold text-slate-700',
                className,
            )}
        >
            {logo ? (
                <img
                    src={logo}
                    alt=""
                    className="size-full object-contain p-1"
                />
            ) : (
                (name ?? '?').slice(0, 2).toUpperCase()
            )}
        </span>
    );
}

export const tooltipStyle = {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--popover-foreground)',
    fontSize: 12,
};

export const buttonPrimary =
    'inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';
export const buttonGhost =
    'inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50';
