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
import { chartEvents } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    Panel,
    StatTile,
    formatNumber,
    gameLabel,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
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
            <Head title={tr('Advertising')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                            <Megaphone className="size-6 text-primary" />
                            {tr('Advertising')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {tr(
                                'Sell logo placements, mottos, jingles and sponsored character items across every game.',
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/admin/ads/advertisers/create"
                            className={buttonGhost}
                            data-testid="ads-new-advertiser"
                        >
                            <Building2 className="size-4" />
                            {tr('New advertiser')}
                        </Link>
                        <Link
                            href="/admin/ads/campaigns/create"
                            className={buttonPrimary}
                            data-testid="ads-new-campaign"
                        >
                            <Plus className="size-4" />
                            {tr('New campaign')}
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
                        {tr(
                            'Ads are currently disabled for all users. Open delivery settings to turn them back on.',
                        )}
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
                            {tr(item.label)}
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
                    label={tr('Live campaigns')}
                    value={formatNumber(summary.live_campaigns)}
                    hint={tr(
                        summary.advertisers === 1
                            ? '{0} active advertiser'
                            : '{0} active advertisers',
                        [summary.advertisers],
                    )}
                    icon={Megaphone}
                    color="bg-violet-500"
                />
                <StatTile
                    label={tr('Contract value (live)')}
                    value={formatRupiah(summary.contract_value_live)}
                    hint={tr('This year: {0}', [
                        formatRupiah(summary.contract_value_year),
                    ])}
                    icon={BadgeDollarSign}
                    color="bg-emerald-500"
                />
                <StatTile
                    label={tr('Impressions · 30 days')}
                    value={formatNumber(summary.impressions_30d)}
                    hint={tr('CTR {0}', [
                        ctr({
                            impressions: summary.impressions_30d,
                            clicks: summary.clicks_30d,
                            plays: 0,
                        }),
                    ])}
                    icon={Eye}
                    color="bg-sky-500"
                />
                <StatTile
                    label={tr('Clicks · jingle plays (30d)')}
                    value={`${formatNumber(summary.clicks_30d)} · ${formatNumber(summary.plays_30d)}`}
                    hint={tr('Click-throughs and sponsor jingles heard')}
                    icon={MousePointerClick}
                    color="bg-amber-500"
                />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
                <Panel
                    title={tr('Delivery')}
                    description={tr(
                        'Impressions, clicks and jingle plays per day (last 30 days)',
                    )}
                    icon={Eye}
                    className="xl:col-span-2"
                >
                    <div className="h-64" data-testid="ads-daily-chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                {...chartEvents}
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
                    title={tr('Ending within 7 days')}
                    description={tr(
                        'Renew or replace before the slot goes empty',
                    )}
                    icon={CalendarClock}
                >
                    {summary.ending_soon.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {tr('No live campaign ends this week.')}
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
                                                {tr('Ends')}{' '}
                                                {formatDate(campaign.ends_on)} ·{' '}
                                                {campaign.days_left}{' '}
                                                {tr('day(s) left')}
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
            title={tr('Campaigns')}
            description={tr('{0} total', [campaigns.length])}
            icon={Megaphone}
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={tr('Search campaign or advertiser')}
                            className="h-9 w-64 rounded-lg border border-input bg-background pr-3 pl-8 text-sm"
                            data-testid="ads-campaign-search"
                        />
                    </label>
                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                        aria-label={tr('Status')}
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
                                {value === 'all' ? tr('All statuses') : value}
                            </option>
                        ))}
                    </select>
                </div>
            }
        >
            {shown.length === 0 ? (
                <EmptyState
                    icon={Megaphone}
                    title={tr('No campaigns')}
                    description={tr(
                        'Create a campaign for an advertiser, then add its creatives.',
                    )}
                />
            ) : (
                <ResponsiveTable
                    testId="ads-campaign-table"
                    rows={shown}
                    rowKey={(c) => c.id}
                    onRowClick={(c) =>
                        router.visit(`/admin/ads/campaigns/${c.id}`)
                    }
                    rowAriaLabel={(c) => tr('Open {0}', [c.name])}
                    actions={(c) => (
                        <Link
                            href={`/admin/ads/campaigns/${c.id}/edit`}
                            className={cn(buttonGhost, 'h-8 px-3 text-xs')}
                        >
                            <Pencil className="size-3.5" />
                            {tr('Edit')}
                        </Link>
                    )}
                    columns={[
                        {
                            key: 'campaign',
                            header: tr('Campaign'),
                            primary: true,
                            cell: (c) => (
                                <div
                                    className="flex min-w-0 items-center gap-3"
                                    data-testid={`ads-campaign-${c.id}`}
                                >
                                    <BrandMark
                                        name={c.advertiser_name}
                                        logo={c.advertiser_logo}
                                    />
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground">
                                            {c.name}
                                        </p>
                                        <p className="text-xs font-normal text-muted-foreground">
                                            {c.advertiser_name} ·{' '}
                                            {c.creatives_count}{' '}
                                            {tr('creative(s)')}
                                        </p>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'flight',
                            header: tr('Flight'),
                            cellClassName: 'text-xs',
                            cell: (c) => (
                                <div>
                                    <p className="text-foreground">
                                        {formatDate(c.starts_on)} –{' '}
                                        {formatDate(c.ends_on)}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {c.duration_days} {tr('days')}
                                        {c.display_status === 'live' &&
                                            tr(' · {0} left', [c.days_left])}
                                    </p>
                                </div>
                            ),
                        },
                        {
                            key: 'targeting',
                            header: tr('Targeting'),
                            cellClassName: 'text-xs text-muted-foreground',
                            cell: (c) => (
                                <div>
                                    <p>
                                        {c.target_games.length === 0
                                            ? tr('All games')
                                            : c.target_games
                                                  .map(gameLabel)
                                                  .join(', ')}
                                    </p>
                                    <p>
                                        {c.grade_min || c.grade_max
                                            ? tr('Grade {0}–{1}', [
                                                  c.grade_min ?? 1,
                                                  c.grade_max ?? 12,
                                              ])
                                            : tr('All grades')}{' '}
                                        {tr('· weight')} {c.weight}
                                    </p>
                                </div>
                            ),
                        },
                        {
                            key: 'contract',
                            header: tr('Contract'),
                            align: 'right',
                            cell: (c) => (
                                <div>
                                    <p className="font-medium tabular-nums">
                                        {formatRupiah(c.contract_value)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {tr(
                                            PRICING_LABELS[
                                                c.pricing_model
                                            ].split(' ')[0],
                                        )}
                                    </p>
                                </div>
                            ),
                        },
                        {
                            key: 'impressions',
                            header: tr('Impressions'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (c) => (
                                <div>
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
                                        {tr('today')}{' '}
                                        {formatNumber(c.stats.today ?? 0)}
                                    </p>
                                </div>
                            ),
                        },
                        {
                            key: 'ctr',
                            header: tr('CTR'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (c) => ctr(c.stats),
                        },
                        {
                            key: 'status',
                            header: tr('Status'),
                            summary: true,
                            cell: (c) => (
                                <CampaignStatus status={c.display_status} />
                            ),
                        },
                        {
                            key: 'edit',
                            header: (
                                <span className="sr-only">{tr('Edit')}</span>
                            ),
                            align: 'right',
                            hideInAccordion: true,
                            cell: (c) => (
                                <Link
                                    href={`/admin/ads/campaigns/${c.id}/edit`}
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) =>
                                        event.stopPropagation()
                                    }
                                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                    aria-label={tr('Edit {0}', [c.name])}
                                >
                                    <Pencil className="size-4" />
                                </Link>
                            ),
                        },
                    ]}
                />
            )}
        </Panel>
    );
}

function Advertisers({ advertisers }: { advertisers: AdvertiserRow[] }) {
    if (advertisers.length === 0) {
        return (
            <Panel title={tr('Advertisers')} icon={Building2}>
                <EmptyState
                    icon={Building2}
                    title={tr('No advertisers yet')}
                    description={tr('Add the brands that buy ad space.')}
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
                                {a.is_active ? tr('Active') : tr('Inactive')}
                            </span>
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div className="min-w-0">
                            <dt className="text-muted-foreground">
                                {tr('Contact')}
                            </dt>
                            <dd className="truncate text-foreground">
                                {a.contact_name ?? '—'}
                            </dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-muted-foreground">
                                {tr('Phone')}
                            </dt>
                            <dd className="truncate text-foreground">
                                {a.phone ?? '—'}
                            </dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                            <dt className="text-muted-foreground">
                                {tr('Email')}
                            </dt>
                            <dd className="truncate text-foreground">
                                {a.email ?? '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">
                                {tr('Campaigns')}
                            </dt>
                            <dd className="text-foreground tabular-nums">
                                {a.campaigns_count ?? 0}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">
                                {tr('Live now')}
                            </dt>
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
                            {tr('Edit')}
                        </Link>
                        <Link
                            href={`/admin/ads/campaigns/create?advertiser=${a.id}`}
                            className={cn(
                                buttonPrimary,
                                'h-8 flex-1 justify-center px-3',
                            )}
                        >
                            <Plus className="size-3.5" />
                            {tr('Campaign')}
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
                title={tr('Placements')}
                description={tr(
                    'Where ads appear. Every game exposes the same placements.',
                )}
                icon={LayoutGrid}
                className="xl:col-span-2"
            >
                <ResponsiveTable
                    testId="ads-inventory"
                    rows={inventory}
                    rowKey={(row) => row.key}
                    columns={[
                        {
                            key: 'placement',
                            header: tr('Placement'),
                            primary: true,
                            cell: (row) => (
                                <div className="min-w-0">
                                    <p className="font-medium text-foreground">
                                        {tr(row.label)}
                                    </p>
                                    <p className="font-mono text-xs font-normal text-muted-foreground">
                                        {row.key}
                                    </p>
                                </div>
                            ),
                        },
                        {
                            key: 'accepts',
                            header: tr('Accepts'),
                            cellClassName: 'text-xs text-muted-foreground',
                            cell: (row) => (
                                <div>
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
                                            {tr('plays at')} {row.moment}
                                        </p>
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: 'live',
                            header: tr('Live creatives'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (row) =>
                                row.live_creatives === 0 ? (
                                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                        {tr('Available')}
                                    </span>
                                ) : (
                                    row.live_creatives
                                ),
                        },
                        {
                            key: 'delivery',
                            header: tr('30-day delivery'),
                            align: 'right',
                            cellClassName: 'text-xs tabular-nums',
                            cell: (row) => (
                                <div>
                                    <p className="text-foreground">
                                        {formatNumber(row.impressions_30d)}{' '}
                                        {tr('impressions')}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {formatNumber(row.clicks_30d)}{' '}
                                        {tr('clicks ·')}{' '}
                                        {formatNumber(row.plays_30d)}{' '}
                                        {tr('plays')}
                                    </p>
                                </div>
                            ),
                        },
                    ]}
                />
            </Panel>
            <Panel
                title={tr('Creative sizes')}
                description={tr('Pixel dimensions for logo artwork')}
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
                                    {tr(size.label)}
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
