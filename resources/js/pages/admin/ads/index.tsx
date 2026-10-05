import { FlashMessages } from '@/components/admin/admin-kit';
import {
    AdSettings,
    type AdControls,
} from '@/components/admin/ads/ad-settings';
import {
    BrandMark,
    CampaignStatus,
    PRICING_LABELS,
    buttonGhost,
    buttonPrimary,
    ctr,
    formatDate,
    formatRupiah,
    tooltipStyle,
    type AdvertiserRow,
    type CampaignRow,
    type DailyPoint,
    type SizeSpec,
} from '@/components/admin/ads/shared';
import {
    EmptyState,
    Panel,
    StatTile,
    formatNumber,
    gameLabel,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    BadgeDollarSign,
    Building2,
    CalendarClock,
    Eye,
    LayoutGrid,
    Megaphone,
    MousePointerClick,
    Music,
    Pencil,
    Plus,
    Power,
    Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

type Tab = 'overview' | 'campaigns' | 'advertisers' | 'inventory' | 'settings';

interface InventoryRow {
    key: string;
    label: string;
    types: string[];
    sizes: string[];
    moment: string | null;
    live_creatives: number;
    impressions_30d: number;
    clicks_30d: number;
    plays_30d: number;
}

interface Props {
    tab: Tab;
    campaigns: (CampaignRow & {
        stats: NonNullable<CampaignRow['stats']>;
    })[];
    advertisers: AdvertiserRow[];
    summary: {
        live_campaigns: number;
        advertisers: number;
        contract_value_live: number;
        contract_value_year: number;
        impressions_30d: number;
        clicks_30d: number;
        plays_30d: number;
        ending_soon: CampaignRow[];
    };
    daily: DailyPoint[];
    inventory: InventoryRow[];
    sizes: Record<string, SizeSpec>;
    controls: AdControls;
}

const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'campaigns', label: 'Campaigns' },
    { key: 'advertisers', label: 'Advertisers' },
    { key: 'inventory', label: 'Inventory & sizes' },
    { key: 'settings', label: 'Delivery settings' },
];

export default function AdsIndex({
    tab: initialTab,
    campaigns,
    advertisers,
    summary,
    daily,
    inventory,
    sizes,
    controls,
}: Props) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const switchTab = (next: Tab) => {
        setTab(next);
        window.history.replaceState(
            window.history.state,
            '',
            `/admin/ads${next === 'overview' ? '' : `?tab=${next}`}`,
        );
    };

    return (
        <AdminLayout>
            <Head title="Advertising" />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                            <Megaphone className="size-6 text-primary" />
                            Advertising
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Sell logo placements, mottos, jingles and sponsored
                            character items across every game.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/admin/ads/advertisers/create"
                            className={buttonGhost}
                            data-testid="ads-new-advertiser"
                        >
                            <Building2 className="size-4" />
                            New advertiser
                        </Link>
                        <Link
                            href="/admin/ads/campaigns/create"
                            className={buttonPrimary}
                            data-testid="ads-new-campaign"
                        >
                            <Plus className="size-4" />
                            New campaign
                        </Link>
                    </div>
                </div>

                <FlashMessages />

                {!controls.enabled && tab !== 'settings' && (
                    <button
                        type="button"
                        onClick={() => switchTab('settings')}
                        className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm font-medium text-amber-800 dark:text-amber-300"
                        data-testid="ads-off-notice"
                    >
                        <Power className="size-4 shrink-0" />
                        Ads are currently disabled for all users. Open delivery
                        settings to turn them back on.
                    </button>
                )}

                <div
                    className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1"
                    role="tablist"
                >
                    {TABS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="tab"
                            aria-selected={tab === item.key}
                            onClick={() => switchTab(item.key)}
                            data-testid={`ads-tab-${item.key}`}
                            className={cn(
                                'h-9 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors',
                                tab === item.key
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                {tab === 'overview' && (
                    <Overview summary={summary} daily={daily} />
                )}
                {tab === 'campaigns' && <Campaigns campaigns={campaigns} />}
                {tab === 'advertisers' && (
                    <Advertisers advertisers={advertisers} />
                )}
                {tab === 'inventory' && (
                    <Inventory inventory={inventory} sizes={sizes} />
                )}
                {tab === 'settings' && (
                    <AdSettings
                        controls={controls}
                        labels={Object.fromEntries(
                            inventory.map((row) => [row.key, row.label]),
                        )}
                    />
                )}
            </div>
        </AdminLayout>
    );
}

function Overview({
    summary,
    daily,
}: {
    summary: Props['summary'];
    daily: DailyPoint[];
}) {
    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                    label="Live campaigns"
                    value={formatNumber(summary.live_campaigns)}
                    hint={`${summary.advertisers} active advertiser${summary.advertisers === 1 ? '' : 's'}`}
                    icon={Megaphone}
                    color="bg-violet-500"
                />
                <StatTile
                    label="Contract value (live)"
                    value={formatRupiah(summary.contract_value_live)}
                    hint={`This year: ${formatRupiah(summary.contract_value_year)}`}
                    icon={BadgeDollarSign}
                    color="bg-emerald-500"
                />
                <StatTile
                    label="Impressions · 30 days"
                    value={formatNumber(summary.impressions_30d)}
                    hint={`CTR ${ctr({ impressions: summary.impressions_30d, clicks: summary.clicks_30d, plays: 0 })}`}
                    icon={Eye}
                    color="bg-sky-500"
                />
                <StatTile
                    label="Clicks · jingle plays (30d)"
                    value={`${formatNumber(summary.clicks_30d)} · ${formatNumber(summary.plays_30d)}`}
                    hint="Click-throughs and sponsor jingles heard"
                    icon={MousePointerClick}
                    color="bg-amber-500"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
                <Panel
                    title="Delivery"
                    description="Impressions, clicks and jingle plays per day (last 30 days)"
                    icon={Eye}
                    className="xl:col-span-2"
                >
                    <div className="h-64" data-testid="ads-daily-chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={daily}
                                margin={{ left: -20, right: 8, top: 8 }}
                            >
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="var(--border)"
                                />
                                <XAxis
                                    dataKey="day"
                                    tickFormatter={(value: string) =>
                                        value.slice(5)
                                    }
                                    tick={{
                                        fill: 'var(--muted-foreground)',
                                        fontSize: 11,
                                    }}
                                    minTickGap={16}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{
                                        fill: 'var(--muted-foreground)',
                                        fontSize: 11,
                                    }}
                                />
                                <Tooltip
                                    contentStyle={tooltipStyle}
                                    cursor={{ fill: 'var(--muted)' }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar
                                    dataKey="impressions"
                                    name="Impressions"
                                    fill="var(--chart-1)"
                                    radius={[4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="clicks"
                                    name="Clicks"
                                    fill="var(--chart-4)"
                                    radius={[4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="plays"
                                    name="Jingle plays"
                                    fill="var(--chart-2)"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>
                <Panel
                    title="Ending within 7 days"
                    description="Renew or replace before the slot goes empty"
                    icon={CalendarClock}
                >
                    {summary.ending_soon.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No live campaign ends this week.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {summary.ending_soon.map((campaign) => (
                                <li key={campaign.id}>
                                    <Link
                                        href={`/admin/ads/campaigns/${campaign.id}`}
                                        className="flex items-center gap-3 rounded-xl p-1 hover:bg-muted"
                                    >
                                        <BrandMark
                                            name={campaign.advertiser_name}
                                            logo={campaign.advertiser_logo}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-foreground">
                                                {campaign.name}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                Ends{' '}
                                                {formatDate(campaign.ends_on)} ·{' '}
                                                {campaign.days_left} day(s) left
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </div>
    );
}

function Campaigns({ campaigns }: { campaigns: Props['campaigns'] }) {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return campaigns.filter(
            (c) =>
                (status === 'all' || c.display_status === status) &&
                (!needle ||
                    c.name.toLowerCase().includes(needle) ||
                    (c.advertiser_name ?? '').toLowerCase().includes(needle)),
        );
    }, [campaigns, query, status]);

    return (
        <Panel
            title="Campaigns"
            description={`${campaigns.length} total`}
            icon={Megaphone}
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search campaign or advertiser"
                            className="h-9 w-64 rounded-lg border border-input bg-background pr-3 pl-8 text-sm"
                            data-testid="ads-campaign-search"
                        />
                    </label>
                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                        aria-label="Status"
                    >
                        {[
                            'all',
                            'live',
                            'scheduled',
                            'paused',
                            'draft',
                            'expired',
                            'ended',
                        ].map((value) => (
                            <option key={value} value={value}>
                                {value === 'all' ? 'All statuses' : value}
                            </option>
                        ))}
                    </select>
                </div>
            }
        >
            {shown.length === 0 ? (
                <EmptyState
                    icon={Megaphone}
                    title="No campaigns"
                    description="Create a campaign for an advertiser, then add its creatives."
                />
            ) : (
                <div className="-mx-5 -my-5 overflow-x-auto">
                    <table
                        className="w-full min-w-[980px] text-sm"
                        data-testid="ads-campaign-table"
                    >
                        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-5 py-3 font-medium">
                                    Campaign
                                </th>
                                <th className="px-3 py-3 font-medium">
                                    Flight
                                </th>
                                <th className="px-3 py-3 font-medium">
                                    Targeting
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    Contract
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    Impressions
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    CTR
                                </th>
                                <th className="px-3 py-3 font-medium">
                                    Status
                                </th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {shown.map((c) => (
                                <tr
                                    key={c.id}
                                    className="cursor-pointer hover:bg-muted/30"
                                    onClick={() =>
                                        router.visit(
                                            `/admin/ads/campaigns/${c.id}`,
                                        )
                                    }
                                    data-testid={`ads-campaign-${c.id}`}
                                >
                                    <td className="px-5 py-2.5">
                                        <div className="flex items-center gap-3">
                                            <BrandMark
                                                name={c.advertiser_name}
                                                logo={c.advertiser_logo}
                                            />
                                            <div className="min-w-0">
                                                <p className="font-medium text-foreground">
                                                    {c.name}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {c.advertiser_name} ·{' '}
                                                    {c.creatives_count}{' '}
                                                    creative(s)
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs">
                                        <p className="text-foreground">
                                            {formatDate(c.starts_on)} –{' '}
                                            {formatDate(c.ends_on)}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {c.duration_days} days
                                            {c.display_status === 'live' &&
                                                ` · ${c.days_left} left`}
                                        </p>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                        <p>
                                            {c.target_games.length === 0
                                                ? 'All games'
                                                : c.target_games
                                                      .map(gameLabel)
                                                      .join(', ')}
                                        </p>
                                        <p>
                                            {c.grade_min || c.grade_max
                                                ? `Grade ${c.grade_min ?? 1}–${c.grade_max ?? 12}`
                                                : 'All grades'}{' '}
                                            · weight {c.weight}
                                        </p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                        <p className="font-medium tabular-nums">
                                            {formatRupiah(c.contract_value)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {
                                                PRICING_LABELS[
                                                    c.pricing_model
                                                ].split(' ')[0]
                                            }
                                        </p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                        <p>
                                            {formatNumber(c.stats.impressions)}
                                            {c.max_impressions && (
                                                <span className="text-muted-foreground">
                                                    {' '}
                                                    /{' '}
                                                    {formatNumber(
                                                        c.max_impressions,
                                                    )}
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            today{' '}
                                            {formatNumber(c.stats.today ?? 0)}
                                        </p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                        {ctr(c.stats)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <CampaignStatus
                                            status={c.display_status}
                                        />
                                    </td>
                                    <td className="px-5 py-2.5 text-right">
                                        <Link
                                            href={`/admin/ads/campaigns/${c.id}/edit`}
                                            onClick={(event) =>
                                                event.stopPropagation()
                                            }
                                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                            aria-label={`Edit ${c.name}`}
                                        >
                                            <Pencil className="size-4" />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Panel>
    );
}

function Advertisers({ advertisers }: { advertisers: AdvertiserRow[] }) {
    if (advertisers.length === 0) {
        return (
            <Panel title="Advertisers" icon={Building2}>
                <EmptyState
                    icon={Building2}
                    title="No advertisers yet"
                    description="Add the brands that buy ad space."
                />
            </Panel>
        );
    }

    return (
        <div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            data-testid="ads-advertisers"
        >
            {advertisers.map((a) => (
                <article
                    key={a.id}
                    className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
                    data-testid={`ads-advertiser-${a.id}`}
                >
                    <div className="flex items-start gap-3">
                        <BrandMark
                            name={a.brand ?? a.name}
                            logo={a.logo_url}
                            className="size-14"
                        />
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-foreground">
                                {a.brand ?? a.name}
                            </h3>
                            <p className="truncate text-xs text-muted-foreground">
                                {a.name}
                                {a.industry && ` · ${a.industry}`}
                            </p>
                            <span
                                className={cn(
                                    'mt-1 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium',
                                    a.is_active
                                        ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                                        : 'bg-muted text-muted-foreground',
                                )}
                            >
                                {a.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div className="min-w-0">
                            <dt className="text-muted-foreground">Contact</dt>
                            <dd className="truncate text-foreground">
                                {a.contact_name ?? '—'}
                            </dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd className="truncate text-foreground">
                                {a.phone ?? '—'}
                            </dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="truncate text-foreground">
                                {a.email ?? '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Campaigns</dt>
                            <dd className="text-foreground tabular-nums">
                                {a.campaigns_count ?? 0}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Live now</dt>
                            <dd className="text-foreground tabular-nums">
                                {a.live_campaigns ?? 0}
                            </dd>
                        </div>
                    </dl>
                    <div className="mt-auto flex gap-2 border-t border-border pt-4">
                        <Link
                            href={`/admin/ads/advertisers/${a.id}/edit`}
                            className={cn(
                                buttonGhost,
                                'h-8 flex-1 justify-center',
                            )}
                        >
                            <Pencil className="size-3.5" />
                            Edit
                        </Link>
                        <Link
                            href={`/admin/ads/campaigns/create?advertiser=${a.id}`}
                            className={cn(
                                buttonPrimary,
                                'h-8 flex-1 justify-center px-3',
                            )}
                        >
                            <Plus className="size-3.5" />
                            Campaign
                        </Link>
                    </div>
                </article>
            ))}
        </div>
    );
}

function Inventory({
    inventory,
    sizes,
}: {
    inventory: InventoryRow[];
    sizes: Record<string, SizeSpec>;
}) {
    return (
        <div className="grid gap-6 xl:grid-cols-3">
            <Panel
                title="Placements"
                description="Where ads appear. Every game exposes the same placements."
                icon={LayoutGrid}
                className="xl:col-span-2"
            >
                <div className="-mx-5 -my-5 overflow-x-auto">
                    <table
                        className="w-full min-w-[720px] text-sm"
                        data-testid="ads-inventory"
                    >
                        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-5 py-3 font-medium">
                                    Placement
                                </th>
                                <th className="px-3 py-3 font-medium">
                                    Accepts
                                </th>
                                <th className="px-3 py-3 text-right font-medium">
                                    Live creatives
                                </th>
                                <th className="px-5 py-3 text-right font-medium">
                                    30-day delivery
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {inventory.map((row) => (
                                <tr key={row.key}>
                                    <td className="px-5 py-2.5">
                                        <p className="font-medium text-foreground">
                                            {row.label}
                                        </p>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {row.key}
                                        </p>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                        <p className="capitalize">
                                            {row.types.join(', ')}
                                        </p>
                                        {row.sizes.length > 0 && (
                                            <p>
                                                {row.sizes
                                                    .map(
                                                        (s) =>
                                                            `${sizes[s]?.width}×${sizes[s]?.height}`,
                                                    )
                                                    .join(' · ')}
                                            </p>
                                        )}
                                        {row.moment && (
                                            <p className="inline-flex items-center gap-1">
                                                <Music className="size-3" />
                                                plays at {row.moment}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                        {row.live_creatives === 0 ? (
                                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                                Available
                                            </span>
                                        ) : (
                                            row.live_creatives
                                        )}
                                    </td>
                                    <td className="px-5 py-2.5 text-right text-xs tabular-nums">
                                        <p className="text-foreground">
                                            {formatNumber(row.impressions_30d)}{' '}
                                            impressions
                                        </p>
                                        <p className="text-muted-foreground">
                                            {formatNumber(row.clicks_30d)}{' '}
                                            clicks ·{' '}
                                            {formatNumber(row.plays_30d)} plays
                                        </p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>
            <Panel
                title="Creative sizes"
                description="Pixel dimensions for logo artwork"
                icon={LayoutGrid}
            >
                <ul className="flex flex-col gap-3">
                    {Object.entries(sizes).map(([key, size]) => (
                        <li key={key} className="flex items-center gap-3">
                            <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <span
                                    className="block rounded-[3px] border border-primary/60 bg-primary/15"
                                    style={{
                                        width: Math.max(
                                            6,
                                            (size.width / 728) * 56,
                                        ),
                                        height: Math.max(
                                            4,
                                            (size.height / 600) * 40,
                                        ),
                                    }}
                                />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-medium text-foreground">
                                    {size.label}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">
                                    {key}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            </Panel>
        </div>
    );
}
