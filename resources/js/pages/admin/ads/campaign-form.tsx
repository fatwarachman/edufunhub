import {
    PRICING_LABELS,
    buttonPrimary,
    formatRupiah,
    type CampaignRow,
} from '@/components/admin/ads/shared';
import { Panel, fieldClass, gameLabel } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    CalendarRange,
    Crosshair,
    Loader2,
    Megaphone,
} from 'lucide-react';
import { type FormEvent, type ReactNode } from 'react';

interface Props {
    campaign: CampaignRow | null;
    advertiserId: number | null;
    advertisers: { id: number; name: string; is_active: boolean }[];
    games: string[];
    statuses: string[];
    pricingModels: string[];
}

function today(offset = 0): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
    if (!start || !end) return 0;
    const ms =
        new Date(`${end}T00:00:00`).getTime() -
        new Date(`${start}T00:00:00`).getTime();
    return Math.max(0, Math.round(ms / 86400000) + 1);
}

export default function CampaignForm({
    campaign,
    advertiserId,
    advertisers,
    games,
    statuses,
    pricingModels,
}: Props) {
    const form = useForm({
        advertiser_id: campaign?.advertiser_id ?? advertiserId ?? '',
        name: campaign?.name ?? '',
        status: campaign?.status ?? 'draft',
        starts_on: campaign?.starts_on ?? today(),
        ends_on: campaign?.ends_on ?? today(29),
        pricing_model: campaign?.pricing_model ?? 'flat',
        contract_value: campaign?.contract_value ?? 0,
        contract_number: campaign?.contract_number ?? '',
        max_impressions: campaign?.max_impressions ?? '',
        daily_max_impressions: campaign?.daily_max_impressions ?? '',
        weight: campaign?.weight ?? 5,
        target_games: campaign?.target_games ?? ([] as string[]),
        grade_min: campaign?.grade_min ?? '',
        grade_max: campaign?.grade_max ?? '',
        notes: campaign?.notes ?? '',
    });
    const { data, setData, errors, processing } = form;
    const duration = daysBetween(data.starts_on, data.ends_on);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.transform((values) => ({
            ...values,
            max_impressions: values.max_impressions || null,
            daily_max_impressions: values.daily_max_impressions || null,
            grade_min: values.grade_min || null,
            grade_max: values.grade_max || null,
        }));
        if (campaign) {
            form.put(`/admin/ads/campaigns/${campaign.id}`);
        } else {
            form.post('/admin/ads/campaigns');
        }
    };

    const toggleGame = (game: string) =>
        setData(
            'target_games',
            data.target_games.includes(game)
                ? data.target_games.filter((g) => g !== game)
                : [...data.target_games, game],
        );

    const numberInput = (
        key:
            | 'contract_value'
            | 'max_impressions'
            | 'daily_max_impressions'
            | 'grade_min'
            | 'grade_max'
            | 'weight',
        props: Record<string, unknown> = {},
    ) => (
        <input
            type="number"
            min={0}
            value={data[key]}
            onChange={(event) =>
                setData(
                    key,
                    event.target.value === ''
                        ? ''
                        : Math.max(
                              0,
                              Math.floor(Number(event.target.value) || 0),
                          ),
                )
            }
            className={fieldClass}
            name={key}
            {...props}
        />
    );

    return (
        <AdminLayout>
            <Head title={campaign ? tr('Edit campaign') : tr('New campaign')} />
            <div className="flex flex-col gap-6">
                <div>
                    <Link
                        href={
                            campaign
                                ? `/admin/ads/campaigns/${campaign.id}`
                                : '/admin/ads?tab=campaigns'
                        }
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {campaign ? campaign.name : tr('Campaigns')}
                    </Link>
                    <h1 className="mt-2 text-2xl font-bold text-foreground">
                        {campaign ? tr('Edit campaign') : tr('New campaign')}
                    </h1>
                </div>

                <form
                    onSubmit={submit}
                    className="grid gap-6 xl:grid-cols-2"
                    data-testid="campaign-form"
                >
                    <Panel title={tr('Campaign & contract')} icon={Megaphone}>
                        <div className="grid gap-5 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <Field
                                    label={tr('Advertiser')}
                                    error={errors.advertiser_id}
                                >
                                    <select
                                        value={data.advertiser_id}
                                        onChange={(event) =>
                                            setData(
                                                'advertiser_id',
                                                Number(event.target.value),
                                            )
                                        }
                                        className={fieldClass}
                                        name="advertiser_id"
                                        required
                                    >
                                        <option value="" disabled>
                                            {tr('Choose advertiser…')}
                                        </option>
                                        {advertisers.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.name}
                                                {!a.is_active &&
                                                    tr(' (inactive)')}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                            <div className="sm:col-span-2">
                                <Field
                                    label={tr('Campaign name')}
                                    error={errors.name}
                                >
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
                            </div>
                            <Field
                                label={tr('Pricing')}
                                error={errors.pricing_model}
                            >
                                <select
                                    value={data.pricing_model}
                                    onChange={(event) =>
                                        setData(
                                            'pricing_model',
                                            event.target
                                                .value as CampaignRow['pricing_model'],
                                        )
                                    }
                                    className={fieldClass}
                                >
                                    {pricingModels.map((p) => (
                                        <option key={p} value={p}>
                                            {tr(PRICING_LABELS[p])}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field
                                label={tr('Contract value (Rp)')}
                                error={errors.contract_value}
                                hint={formatRupiah(Number(data.contract_value))}
                            >
                                {numberInput('contract_value', {
                                    step: 1000,
                                })}
                            </Field>
                            <Field
                                label={tr('Contract / PO number')}
                                error={errors.contract_number}
                            >
                                <input
                                    value={data.contract_number}
                                    onChange={(event) =>
                                        setData(
                                            'contract_number',
                                            event.target.value,
                                        )
                                    }
                                    maxLength={60}
                                    className={fieldClass}
                                />
                            </Field>
                            <Field label={tr('Status')} error={errors.status}>
                                <select
                                    value={data.status}
                                    onChange={(event) =>
                                        setData(
                                            'status',
                                            event.target
                                                .value as CampaignRow['status'],
                                        )
                                    }
                                    className={cn(fieldClass, 'capitalize')}
                                    name="status"
                                >
                                    {statuses.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <div className="sm:col-span-2">
                                <Field label={tr('Notes')} error={errors.notes}>
                                    <textarea
                                        value={data.notes}
                                        onChange={(event) =>
                                            setData('notes', event.target.value)
                                        }
                                        rows={3}
                                        maxLength={2000}
                                        className={`${fieldClass} h-auto py-2`}
                                    />
                                </Field>
                            </div>
                        </div>
                    </Panel>

                    <div className="flex flex-col gap-6">
                        <Panel
                            title={tr('Flight & delivery')}
                            description={tr(
                                'When the campaign runs and how much it may show',
                            )}
                            icon={CalendarRange}
                        >
                            <div className="grid gap-5 sm:grid-cols-2">
                                <Field
                                    label={tr('Starts')}
                                    error={errors.starts_on}
                                >
                                    <input
                                        type="date"
                                        value={data.starts_on}
                                        onChange={(event) =>
                                            setData(
                                                'starts_on',
                                                event.target.value,
                                            )
                                        }
                                        className={fieldClass}
                                        name="starts_on"
                                        required
                                    />
                                </Field>
                                <Field
                                    label={tr('Ends')}
                                    error={errors.ends_on}
                                    hint={tr('Duration: {0} day(s)', [
                                        duration,
                                    ])}
                                >
                                    <input
                                        type="date"
                                        value={data.ends_on}
                                        min={data.starts_on}
                                        onChange={(event) =>
                                            setData(
                                                'ends_on',
                                                event.target.value,
                                            )
                                        }
                                        className={fieldClass}
                                        name="ends_on"
                                        required
                                    />
                                </Field>
                                <Field
                                    label={tr('Total impression cap')}
                                    error={errors.max_impressions}
                                    hint={tr('Empty = unlimited')}
                                >
                                    {numberInput('max_impressions', {
                                        min: 1,
                                    })}
                                </Field>
                                <Field
                                    label={tr('Daily impression cap')}
                                    error={errors.daily_max_impressions}
                                    hint={tr('Empty = unlimited')}
                                >
                                    {numberInput('daily_max_impressions', {
                                        min: 1,
                                    })}
                                </Field>
                                <div className="sm:col-span-2">
                                    <Field
                                        label={tr(
                                            'Share of voice (weight {0}/10)',
                                            [data.weight],
                                        )}
                                        error={errors.weight}
                                        hint={tr(
                                            'Higher weight wins a shared placement more often',
                                        )}
                                    >
                                        <input
                                            type="range"
                                            min={1}
                                            max={10}
                                            value={data.weight}
                                            onChange={(event) =>
                                                setData(
                                                    'weight',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="accent-primary"
                                            aria-label={tr('Weight')}
                                        />
                                    </Field>
                                </div>
                            </div>
                        </Panel>

                        <Panel
                            title={tr('Targeting')}
                            description={tr('Leave empty to run everywhere')}
                            icon={Crosshair}
                        >
                            <div className="flex flex-col gap-5">
                                <Field
                                    label={tr('Games')}
                                    error={errors.target_games}
                                >
                                    <div className="flex flex-wrap gap-2">
                                        {games.map((game) => {
                                            const on =
                                                data.target_games.includes(
                                                    game,
                                                );
                                            return (
                                                <button
                                                    key={game}
                                                    type="button"
                                                    onClick={() =>
                                                        toggleGame(game)
                                                    }
                                                    aria-pressed={on}
                                                    data-testid={`campaign-game-${game}`}
                                                    className={cn(
                                                        'h-8 rounded-lg border px-3 text-xs font-medium',
                                                        on
                                                            ? 'border-primary bg-primary text-primary-foreground'
                                                            : 'border-border text-muted-foreground hover:text-foreground',
                                                    )}
                                                >
                                                    {gameLabel(game)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {data.target_games.length === 0
                                            ? tr('All games')
                                            : tr('{0} selected', [
                                                  data.target_games.length,
                                              ])}
                                    </span>
                                </Field>
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field
                                        label={tr('Grade from')}
                                        error={errors.grade_min}
                                    >
                                        {numberInput('grade_min', {
                                            min: 1,
                                            max: 12,
                                            placeholder: '1',
                                        })}
                                    </Field>
                                    <Field
                                        label={tr('Grade to')}
                                        error={errors.grade_max}
                                    >
                                        {numberInput('grade_max', {
                                            min: 1,
                                            max: 12,
                                            placeholder: '12',
                                        })}
                                    </Field>
                                </div>
                            </div>
                        </Panel>

                        <div className="flex justify-end gap-3">
                            <Link
                                href="/admin/ads?tab=campaigns"
                                className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                {tr('Cancel')}
                            </Link>
                            <button
                                type="submit"
                                disabled={processing}
                                className={buttonPrimary}
                                data-testid="campaign-save"
                            >
                                {processing && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {campaign
                                    ? tr('Save changes')
                                    : tr('Create campaign')}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </AdminLayout>
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
