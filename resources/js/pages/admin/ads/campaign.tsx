import { ConfirmDialog, FlashMessages } from '@/components/admin/admin-kit';
import {
    CampaignAnalyticsPanels,
    type CampaignAnalytics,
} from '@/components/admin/ads/campaign-analytics';
import {
    BrandMark,
    CampaignStatus,
    PRICING_LABELS,
    TYPE_LABELS,
    buttonGhost,
    buttonPrimary,
    ctr,
    formatDate,
    formatRupiah,
    tooltipStyle,
    type AdvertiserRow,
    type CampaignRow,
    type DailyPoint,
    type PlacementSpec,
    type SizeSpec,
} from '@/components/admin/ads/shared';
import { chartEvents } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    Panel,
    StatTile,
    fieldClass,
    formatNumber,
    gameLabel,
} from '@/components/admin/game-stats';
import { AdCreativeView } from '@/components/ads/ad-slot';
import InputError from '@/components/input-error';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { type AdPlacement } from '@/lib/ads';
import { cn } from '@/lib/utils';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    BadgeDollarSign,
    Eye,
    Image as ImageIcon,
    Loader2,
    MousePointerClick,
    Music,
    Package,
    Pause,
    Pencil,
    Play,
    Plus,
    Quote,
    Trash2,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
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

interface Creative {
    id: number;
    type: 'logo' | 'motto' | 'jingle' | 'item';
    name: string;
    size: string | null;
    placements: string[];
    image_url: string | null;
    audio_url: string | null;
    motto: string | null;
    click_url: string | null;
    background_color: string | null;
    text_color: string | null;
    display_seconds: number;
    audio_seconds: number | null;
    character_item_id: number | null;
    character_item: { id: number; name: string; slot: string } | null;
    is_active: boolean;
    stats: {
        impressions: number;
        clicks: number;
        plays: number;
        ctr: number | null;
    };
}

interface Props {
    campaign: CampaignRow & {
        stats: NonNullable<CampaignRow['stats']>;
        advertiser: AdvertiserRow;
    };
    creatives: Creative[];
    report: CampaignAnalytics & { daily: DailyPoint[] };
    placementsCatalog: PlacementSpec[];
    sizes: Record<string, SizeSpec>;
    types: string[];
    maxAudioSeconds: number;
    maxImageKb: number;
    maxAudioKb: number;
    characterItems: {
        id: number;
        name: string;
        slot: string;
        advertiser_id: number | null;
    }[];
}

const TYPE_ICONS = {
    logo: ImageIcon,
    motto: Quote,
    jingle: Music,
    item: Package,
} as const;

export default function CampaignShow(props: Props) {
    const { campaign, creatives, report, placementsCatalog } = props;
    const [editing, setEditing] = useState<Creative | 'new' | null>(null);
    const [deleting, setDeleting] = useState<Creative | null>(null);
    const [deletingCampaign, setDeletingCampaign] = useState(false);
    const [processing, setProcessing] = useState(false);
    const labelOf = (key: string) =>
        placementsCatalog.find((p) => p.key === key)?.label ?? key;
    const setStatus = (status: string) =>
        router.patch(
            `/admin/ads/campaigns/${campaign.id}/status`,
            { status },
            { preserveScroll: true },
        );
    const capPercent = campaign.max_impressions
        ? Math.min(
              100,
              Math.round(
                  (campaign.stats.impressions / campaign.max_impressions) * 100,
              ),
          )
        : null;

    return (
        <AdminLayout>
            <Head title={campaign.name} />
            <div className="flex flex-col gap-6">
                <div>
                    <Link
                        href="/admin/ads?tab=campaigns"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('Campaigns')}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <BrandMark
                                name={campaign.advertiser_name}
                                logo={campaign.advertiser_logo}
                                className="size-14"
                            />
                            <div className="min-w-0">
                                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground">
                                    {campaign.name}
                                    <CampaignStatus
                                        status={campaign.display_status}
                                    />
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    {campaign.advertiser_name} ·{' '}
                                    {formatDate(campaign.starts_on)} –{' '}
                                    {formatDate(campaign.ends_on)} (
                                    {campaign.duration_days} {tr('days)')}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {campaign.status === 'active' ? (
                                <button
                                    type="button"
                                    onClick={() => setStatus('paused')}
                                    className={buttonGhost}
                                    data-testid="campaign-pause"
                                >
                                    <Pause className="size-4" />
                                    {tr('Pause')}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setStatus('active')}
                                    className={buttonPrimary}
                                    data-testid="campaign-activate"
                                >
                                    <Play className="size-4" />
                                    {tr('Activate')}
                                </button>
                            )}
                            <Link
                                href={`/admin/ads/campaigns/${campaign.id}/edit`}
                                className={buttonGhost}
                            >
                                <Pencil className="size-4" />
                                {tr('Edit')}
                            </Link>
                            <button
                                type="button"
                                onClick={() => setDeletingCampaign(true)}
                                className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-destructive hover:bg-destructive/10"
                                aria-label={tr('Delete campaign')}
                            >
                                <Trash2 className="size-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <FlashMessages />

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatTile
                        label={tr('Impressions')}
                        value={formatNumber(campaign.stats.impressions)}
                        hint={
                            capPercent !== null
                                ? tr('{0}% of {1} cap', [
                                      capPercent,
                                      formatNumber(campaign.max_impressions),
                                  ])
                                : tr('Today {0}', [
                                      formatNumber(campaign.stats.today ?? 0),
                                  ])
                        }
                        icon={Eye}
                        color="bg-sky-500"
                    />
                    <StatTile
                        label={tr('Clicks')}
                        value={formatNumber(campaign.stats.clicks)}
                        hint={tr('CTR {0}', [ctr(campaign.stats)])}
                        icon={MousePointerClick}
                        color="bg-amber-500"
                    />
                    <StatTile
                        label={tr('Jingle plays')}
                        value={formatNumber(campaign.stats.plays)}
                        icon={Music}
                        color="bg-violet-500"
                    />
                    <StatTile
                        label={tr('Contract value')}
                        value={formatRupiah(campaign.contract_value)}
                        hint={`${PRICING_LABELS[campaign.pricing_model]}${campaign.contract_number ? ` · ${campaign.contract_number}` : ''}`}
                        icon={BadgeDollarSign}
                        color="bg-emerald-500"
                    />
                </div>

                <Panel
                    title={tr('Creatives')}
                    description={tr(
                        'Logo, motto, jingle or sponsored item, and where each may appear',
                    )}
                    icon={ImageIcon}
                    actions={
                        <button
                            type="button"
                            onClick={() => setEditing('new')}
                            className={buttonPrimary}
                            data-testid="creative-new"
                        >
                            <Plus className="size-4" />
                            {tr('Add creative')}
                        </button>
                    }
                >
                    {creatives.length === 0 ? (
                        <EmptyState
                            icon={ImageIcon}
                            title={tr('No creatives yet')}
                            description={tr(
                                'A campaign needs at least one active creative before it can go live.',
                            )}
                        />
                    ) : (
                        <div
                            className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
                            data-testid="creative-list"
                        >
                            {creatives.map((creative) => (
                                <CreativeCard
                                    key={creative.id}
                                    creative={creative}
                                    advertiser={campaign.advertiser_name ?? ''}
                                    labelOf={labelOf}
                                    onEdit={() => setEditing(creative)}
                                    onDelete={() => setDeleting(creative)}
                                />
                            ))}
                        </div>
                    )}
                </Panel>

                <div className="grid gap-6">
                    <Panel title={tr('Daily delivery')} icon={Eye}>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    {...chartEvents}
                                    data={report.daily}
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
                                        minTickGap={12}
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
                </div>

                <CampaignAnalyticsPanels
                    analytics={report}
                    labelOf={labelOf}
                    totals={campaign.stats}
                />

                <Panel title={tr('Targeting & contact')}>
                    <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                        <Detail label={tr('Games')}>
                            {campaign.target_games.length === 0
                                ? tr('All games')
                                : campaign.target_games
                                      .map(gameLabel)
                                      .join(', ')}
                        </Detail>
                        <Detail label={tr('Grades')}>
                            {campaign.grade_min || campaign.grade_max
                                ? `${campaign.grade_min ?? 1}–${campaign.grade_max ?? 12}`
                                : tr('All grades')}
                        </Detail>
                        <Detail label={tr('Weight · daily cap')}>
                            {campaign.weight}/10 ·{' '}
                            {campaign.daily_max_impressions
                                ? formatNumber(campaign.daily_max_impressions)
                                : tr('no cap')}
                        </Detail>
                        <Detail label={tr('Contact')}>
                            {campaign.advertiser.contact_name ?? '—'}
                            {campaign.advertiser.phone &&
                                ` · ${campaign.advertiser.phone}`}
                        </Detail>
                        {campaign.notes && (
                            <div className="sm:col-span-2 xl:col-span-4">
                                <Detail label={tr('Notes')}>
                                    <span className="whitespace-pre-line">
                                        {campaign.notes}
                                    </span>
                                </Detail>
                            </div>
                        )}
                    </dl>
                </Panel>
            </div>

            <CreativeDialog
                key={
                    editing === 'new'
                        ? 'new'
                        : editing
                          ? `edit-${editing.id}`
                          : 'closed'
                }
                open={editing !== null}
                creative={editing === 'new' ? null : editing}
                onClose={() => setEditing(null)}
                {...props}
            />

            <ConfirmDialog
                open={deleting !== null}
                title={tr('Delete creative?')}
                message={
                    deleting &&
                    tr(
                        '“{0}” and its uploaded files will be removed, together with its delivery statistics.',
                        [deleting.name],
                    )
                }
                confirmLabel={tr('Delete')}
                processing={processing}
                onClose={() => setDeleting(null)}
                onConfirm={() =>
                    deleting &&
                    router.delete(
                        `/admin/ads/campaigns/${campaign.id}/creatives/${deleting.id}`,
                        {
                            preserveScroll: true,
                            onStart: () => setProcessing(true),
                            onFinish: () => {
                                setProcessing(false);
                                setDeleting(null);
                            },
                        },
                    )
                }
            />
            <ConfirmDialog
                open={deletingCampaign}
                title={tr('Delete campaign?')}
                message={tr(
                    '“{0}” stops serving immediately and is removed from reports.',
                    [campaign.name],
                )}
                confirmLabel={tr('Delete')}
                processing={processing}
                onClose={() => setDeletingCampaign(false)}
                onConfirm={() =>
                    router.delete(`/admin/ads/campaigns/${campaign.id}`, {
                        onStart: () => setProcessing(true),
                        onFinish: () => setProcessing(false),
                    })
                }
            />
        </AdminLayout>
    );
}

function CreativeCard({
    creative,
    advertiser,
    labelOf,
    onEdit,
    onDelete,
}: {
    creative: Creative;
    advertiser: string;
    labelOf: (key: string) => string;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const Icon = TYPE_ICONS[creative.type];

    return (
        <article
            className={cn(
                'flex flex-col gap-3 rounded-2xl border border-border p-4',
                !creative.is_active && 'opacity-60',
            )}
            data-testid={`creative-${creative.id}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Icon className="size-3.5" />
                        {tr(TYPE_LABELS[creative.type])}
                        {creative.size && ` · ${creative.size}`}
                    </p>
                    <h3 className="truncate font-semibold text-foreground">
                        {creative.name}
                    </h3>
                </div>
                <div className="flex shrink-0 gap-1">
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={tr('Edit {0}', [creative.name])}
                        data-testid={`creative-edit-${creative.id}`}
                    >
                        <Pencil className="size-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={tr('Delete {0}', [creative.name])}
                    >
                        <Trash2 className="size-4" />
                    </button>
                </div>
            </div>

            <div className="flex min-h-24 items-center justify-center rounded-xl bg-[#fff8dc] p-3 dark:bg-muted/50">
                <CreativePreview creative={creative} advertiser={advertiser} />
            </div>

            <div className="flex flex-wrap gap-1.5">
                {creative.placements.map((p) => (
                    <span
                        key={p}
                        className="inline-flex h-6 items-center rounded-full border border-border bg-background px-2 text-xs font-medium text-foreground"
                    >
                        {labelOf(p)}
                    </span>
                ))}
            </div>
            <p className="mt-auto flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
                <span>
                    {formatNumber(creative.stats.impressions)} {tr('impr.')}
                </span>
                <span>
                    {formatNumber(creative.stats.clicks)} {tr('clicks')}
                </span>
                <span>
                    {tr('CTR')}{' '}
                    {creative.stats.ctr === null
                        ? '—'
                        : `${creative.stats.ctr.toFixed(2)}%`}
                </span>
                {creative.type === 'jingle' && (
                    <span>
                        {formatNumber(creative.stats.plays)} {tr('plays')}
                    </span>
                )}
                {!creative.is_active && (
                    <span className="font-medium text-amber-600">
                        {tr('Paused')}
                    </span>
                )}
            </p>
        </article>
    );
}

function CreativePreview({
    creative,
    advertiser,
}: {
    creative: Pick<
        Creative,
        | 'type'
        | 'image_url'
        | 'audio_url'
        | 'motto'
        | 'background_color'
        | 'text_color'
        | 'character_item'
        | 'placements'
    >;
    advertiser: string;
}) {
    if (creative.type === 'jingle') {
        return creative.audio_url ? (
            <audio
                controls
                src={creative.audio_url}
                className="w-full"
                preload="none"
            />
        ) : (
            <span className="text-xs text-muted-foreground">
                {tr('No audio')}
            </span>
        );
    }
    if (creative.type === 'item') {
        return (
            <span className="text-sm font-medium text-foreground">
                {creative.character_item?.name ?? '—'}{' '}
                <span className="text-muted-foreground">
                    · {creative.character_item?.slot}
                </span>
            </span>
        );
    }
    const placement = (creative.placements[0] ?? 'arena.result') as AdPlacement;
    return (
        <AdCreativeView
            preview
            variant={
                placement === 'arena.header'
                    ? 'strip'
                    : placement === 'arena.board'
                      ? 'badge'
                      : 'card'
            }
            className="max-w-full"
            ad={{
                type: creative.type,
                advertiser,
                image_url: creative.image_url,
                motto: creative.motto,
                has_link: false,
                background_color: creative.background_color,
                text_color: creative.text_color,
                serve: '',
                placement,
            }}
        />
    );
}

function CreativeDialog({
    open,
    creative,
    onClose,
    campaign,
    placementsCatalog,
    sizes,
    types,
    maxAudioSeconds,
    maxImageKb,
    maxAudioKb,
    characterItems,
}: Props & {
    open: boolean;
    creative: Creative | null;
    onClose: () => void;
}) {
    const form = useForm({
        type: creative?.type ?? 'logo',
        name: creative?.name ?? '',
        size: creative?.size ?? 'rectangle',
        placements: creative?.placements ?? (['arena.result'] as string[]),
        motto: creative?.motto ?? '',
        click_url: creative?.click_url ?? '',
        background_color: creative?.background_color ?? '',
        text_color: creative?.text_color ?? '',
        display_seconds: creative?.display_seconds ?? 8,
        audio_seconds: creative?.audio_seconds ?? 5,
        character_item_id: creative?.character_item_id ?? '',
        is_active: creative?.is_active ?? true,
        image: null as File | null,
        audio: null as File | null,
    });
    const { data, setData, errors, processing } = form;
    const [imagePreview, setImagePreview] = useState<string | null>(
        creative?.image_url ?? null,
    );
    const [audioPreview, setAudioPreview] = useState<string | null>(
        creative?.audio_url ?? null,
    );

    const allowed = placementsCatalog.filter((p) =>
        p.types.includes(data.type),
    );
    const fitsSize = (p: PlacementSpec, type: string, size: string) =>
        type !== 'logo' || !p.sizes?.length || p.sizes.includes(size);

    const changeType = (type: Creative['type']) => {
        const first = placementsCatalog.find(
            (p) => p.types.includes(type) && fitsSize(p, type, data.size),
        );
        setData((current) => ({
            ...current,
            type,
            placements: first ? [first.key] : [],
        }));
    };

    const changeSize = (size: string) =>
        setData((current) => ({
            ...current,
            size,
            placements: current.placements.filter((key) => {
                const spec = placementsCatalog.find((p) => p.key === key);
                return spec ? fitsSize(spec, current.type, size) : false;
            }),
        }));

    const togglePlacement = (key: string) =>
        setData(
            'placements',
            data.placements.includes(key)
                ? data.placements.filter((p) => p !== key)
                : [...data.placements, key],
        );

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const url = creative
            ? `/admin/ads/campaigns/${campaign.id}/creatives/${creative.id}`
            : `/admin/ads/campaigns/${campaign.id}/creatives`;
        form.transform((values) => ({
            ...values,
            placements: values.placements.filter((key) =>
                allowed.some((p) => p.key === key),
            ),
            character_item_id: values.character_item_id || null,
        }));
        form.post(url, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: onClose,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent
                className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
                data-testid="creative-dialog"
            >
                <DialogHeader>
                    <DialogTitle>
                        {creative ? tr('Edit creative') : tr('Add creative')}
                    </DialogTitle>
                    <DialogDescription>
                        {campaign.advertiser_name} · {campaign.name}
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={submit}
                    className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]"
                    data-testid="creative-form"
                >
                    <div className="flex flex-col gap-5">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {types.map((type) => {
                                const Icon =
                                    TYPE_ICONS[type as Creative['type']];
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() =>
                                            changeType(type as Creative['type'])
                                        }
                                        aria-pressed={data.type === type}
                                        data-testid={`creative-type-${type}`}
                                        className={cn(
                                            'flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium',
                                            data.type === type
                                                ? 'border-primary bg-primary/10 text-foreground'
                                                : 'border-border text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <Icon className="size-5" />
                                        {tr(TYPE_LABELS[type].split(' (')[0])}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={tr('Name')} error={errors.name}>
                                <input
                                    value={data.name}
                                    onChange={(event) =>
                                        setData('name', event.target.value)
                                    }
                                    maxLength={120}
                                    className={fieldClass}
                                    name="name"
                                    required
                                />
                            </Field>
                            {data.type === 'logo' && (
                                <Field label={tr('Size')} error={errors.size}>
                                    <select
                                        value={data.size}
                                        onChange={(event) =>
                                            changeSize(event.target.value)
                                        }
                                        className={fieldClass}
                                        name="size"
                                    >
                                        {Object.entries(sizes).map(
                                            ([key, size]) => (
                                                <option key={key} value={key}>
                                                    {tr(size.label)}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </Field>
                            )}
                            {data.type === 'item' && (
                                <Field
                                    label={tr('Character item')}
                                    error={errors.character_item_id}
                                >
                                    <select
                                        value={data.character_item_id}
                                        onChange={(event) =>
                                            setData(
                                                'character_item_id',
                                                Number(event.target.value),
                                            )
                                        }
                                        className={fieldClass}
                                        name="character_item_id"
                                    >
                                        <option value="" disabled>
                                            {tr('Choose item…')}
                                        </option>
                                        {characterItems.map((item) => (
                                            <option
                                                key={item.id}
                                                value={item.id}
                                                disabled={
                                                    item.advertiser_id !==
                                                        null &&
                                                    item.advertiser_id !==
                                                        campaign.advertiser_id &&
                                                    item.id !==
                                                        creative?.character_item_id
                                                }
                                            >
                                                {item.name} ({item.slot})
                                                {item.advertiser_id !== null &&
                                                    item.advertiser_id !==
                                                        campaign.advertiser_id &&
                                                    tr(' — sponsored')}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            )}
                        </div>

                        {(data.type === 'logo' ||
                            data.type === 'motto' ||
                            data.type === 'item') && (
                            <Field
                                label={
                                    data.type === 'logo'
                                        ? tr('Logo artwork')
                                        : tr(
                                              'Logo (optional, defaults to advertiser logo)',
                                          )
                                }
                                error={errors.image}
                                hint={tr(
                                    'PNG, JPG, WebP or GIF · max {0} KB{1}',
                                    [
                                        maxImageKb,
                                        data.type === 'logo'
                                            ? ` · ${sizes[data.size]?.width}×${sizes[data.size]?.height}px`
                                            : '',
                                    ],
                                )}
                            >
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    onChange={(event) => {
                                        const file =
                                            event.target.files?.[0] ?? null;
                                        setData('image', file);
                                        setImagePreview(
                                            file
                                                ? URL.createObjectURL(file)
                                                : (creative?.image_url ?? null),
                                        );
                                    }}
                                    className="w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:text-sm file:font-medium"
                                    data-testid="creative-image"
                                />
                            </Field>
                        )}

                        {(data.type === 'motto' || data.type === 'item') && (
                            <Field
                                label={
                                    data.type === 'motto'
                                        ? tr('Motto')
                                        : tr('Tagline (optional)')
                                }
                                error={errors.motto}
                                hint={`${data.motto.length}/140`}
                            >
                                <input
                                    value={data.motto}
                                    onChange={(event) =>
                                        setData('motto', event.target.value)
                                    }
                                    maxLength={140}
                                    className={fieldClass}
                                    name="motto"
                                    placeholder={tr(
                                        'Sarapan sehat, belajar semangat!',
                                    )}
                                />
                            </Field>
                        )}

                        {data.type === 'jingle' && (
                            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                                <Field
                                    label={tr('Jingle audio')}
                                    error={errors.audio}
                                    hint={tr(
                                        'MP3, OGG, WAV or M4A · max {0} KB',
                                        [maxAudioKb],
                                    )}
                                >
                                    <input
                                        type="file"
                                        accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,.m4a"
                                        onChange={(event) => {
                                            const file =
                                                event.target.files?.[0] ?? null;
                                            setData('audio', file);
                                            setAudioPreview(
                                                file
                                                    ? URL.createObjectURL(file)
                                                    : (creative?.audio_url ??
                                                          null),
                                            );
                                        }}
                                        className="w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:text-sm file:font-medium"
                                        data-testid="creative-audio"
                                    />
                                </Field>
                                <Field
                                    label={tr('Length (s)')}
                                    error={errors.audio_seconds}
                                    hint={tr('Max {0}s', [maxAudioSeconds])}
                                >
                                    <input
                                        type="number"
                                        min={1}
                                        max={maxAudioSeconds}
                                        value={data.audio_seconds}
                                        onChange={(event) =>
                                            setData(
                                                'audio_seconds',
                                                Number(event.target.value),
                                            )
                                        }
                                        className={fieldClass}
                                    />
                                </Field>
                            </div>
                        )}

                        <Field
                            label={tr('Placements')}
                            error={
                                errors.placements ??
                                Object.entries(errors).find(([k]) =>
                                    k.startsWith('placements.'),
                                )?.[1]
                            }
                        >
                            <div className="flex flex-col gap-1.5">
                                {allowed.map((p) => {
                                    const fits = fitsSize(
                                        p,
                                        data.type,
                                        data.size,
                                    );
                                    return (
                                        <label
                                            key={p.key}
                                            className={cn(
                                                'flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm',
                                                !fits && 'opacity-50',
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={data.placements.includes(
                                                    p.key,
                                                )}
                                                disabled={!fits}
                                                onChange={() =>
                                                    togglePlacement(p.key)
                                                }
                                                className="size-4 rounded border-input"
                                                data-testid={`creative-placement-${p.key}`}
                                            />
                                            <span className="min-w-0 flex-1">
                                                {tr(p.label)}
                                            </span>
                                            {!fits && (
                                                <span className="text-xs text-muted-foreground">
                                                    {tr('size not accepted')}
                                                </span>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        </Field>

                        {data.type !== 'jingle' && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field
                                    label={tr('Click-through URL')}
                                    error={errors.click_url}
                                    hint={tr('Optional · https only')}
                                >
                                    <input
                                        type="url"
                                        value={data.click_url}
                                        onChange={(event) =>
                                            setData(
                                                'click_url',
                                                event.target.value,
                                            )
                                        }
                                        placeholder="https://"
                                        className={fieldClass}
                                        name="click_url"
                                    />
                                </Field>
                                <Field
                                    label={tr('Rotate after (s)')}
                                    error={errors.display_seconds}
                                >
                                    <input
                                        type="number"
                                        min={3}
                                        max={60}
                                        value={data.display_seconds}
                                        onChange={(event) =>
                                            setData(
                                                'display_seconds',
                                                Number(event.target.value),
                                            )
                                        }
                                        className={fieldClass}
                                    />
                                </Field>
                                <ColorField
                                    label={tr('Background')}
                                    value={data.background_color}
                                    error={errors.background_color}
                                    onChange={(value) =>
                                        setData('background_color', value)
                                    }
                                />
                                <ColorField
                                    label={tr('Text colour')}
                                    value={data.text_color}
                                    error={errors.text_color}
                                    onChange={(value) =>
                                        setData('text_color', value)
                                    }
                                />
                            </div>
                        )}

                        <label className="flex items-center gap-2 text-sm text-foreground">
                            <input
                                type="checkbox"
                                checked={data.is_active}
                                onChange={(event) =>
                                    setData('is_active', event.target.checked)
                                }
                                className="size-4 rounded border-input"
                            />
                            {tr('Active')}
                        </label>
                    </div>

                    <div className="flex flex-col gap-3">
                        <span className="text-sm font-medium text-foreground">
                            {tr('Preview')}
                        </span>
                        <div className="flex min-h-40 items-center justify-center rounded-xl bg-[#fff8dc] p-3 dark:bg-muted/50">
                            <CreativePreview
                                advertiser={
                                    campaign.advertiser_name ?? tr('Sponsor')
                                }
                                creative={{
                                    type: data.type,
                                    image_url:
                                        imagePreview ??
                                        (data.type === 'motto'
                                            ? campaign.advertiser_logo
                                            : null),
                                    audio_url: audioPreview,
                                    motto: data.motto || null,
                                    background_color:
                                        data.background_color || null,
                                    text_color: data.text_color || null,
                                    character_item:
                                        characterItems
                                            .filter(
                                                (i) =>
                                                    i.id ===
                                                    data.character_item_id,
                                            )
                                            .map((i) => ({
                                                id: i.id,
                                                name: i.name,
                                                slot: i.slot,
                                            }))[0] ?? null,
                                    placements: data.placements,
                                }}
                            />
                        </div>
                        <div className="mt-auto flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                {tr('Cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={processing}
                                className={buttonPrimary}
                                data-testid="creative-save"
                            >
                                {processing && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {creative ? tr('Save') : tr('Add')}
                            </button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ColorField({
    label,
    value,
    error,
    onChange,
}: {
    label: string;
    value: string;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <Field label={tr(label)} error={error}>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    value={value || '#ffffff'}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
                    aria-label={tr(label)}
                />
                <input
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="default"
                    className={cn(fieldClass, 'min-w-0 flex-1 font-mono')}
                />
            </div>
        </Field>
    );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{tr(label)}</dt>
            <dd className="mt-0.5 text-foreground">{children}</dd>
        </div>
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
            {hint && !error && (
                <span className="text-xs text-muted-foreground">
                    {tr(hint)}
                </span>
            )}
            <InputError message={error} />
        </div>
    );
}
