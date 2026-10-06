import { ConfirmDialog } from '@/components/admin/admin-kit';
import {
    BrandMark,
    buttonPrimary,
    type AdvertiserRow,
} from '@/components/admin/ads/shared';
import { Panel, fieldClass } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { ArrowLeft, Building2, Loader2, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

export default function AdvertiserForm({
    advertiser,
}: {
    advertiser: AdvertiserRow | null;
}) {
    const form = useForm({
        name: advertiser?.name ?? '',
        brand: advertiser?.brand ?? '',
        industry: advertiser?.industry ?? '',
        contact_name: advertiser?.contact_name ?? '',
        email: advertiser?.email ?? '',
        phone: advertiser?.phone ?? '',
        website: advertiser?.website ?? '',
        tax_id: advertiser?.tax_id ?? '',
        address: advertiser?.address ?? '',
        notes: advertiser?.notes ?? '',
        is_active: advertiser?.is_active ?? true,
        logo: null as File | null,
        remove_logo: false,
    });
    const { data, setData, errors, processing } = form;
    const [preview, setPreview] = useState<string | null>(
        advertiser?.logo_url ?? null,
    );
    const [deleting, setDeleting] = useState(false);
    const [removing, setRemoving] = useState(false);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(
            advertiser
                ? `/admin/ads/advertisers/${advertiser.id}`
                : '/admin/ads/advertisers',
            { forceFormData: true },
        );
    };

    const text = (
        key: keyof typeof data,
        label: string,
        props: Record<string, unknown> = {},
    ) => (
        <Field label={tr(label)} error={errors[key]}>
            <input
                value={data[key] as string}
                onChange={(event) => setData(key, event.target.value)}
                className={fieldClass}
                name={key}
                {...props}
            />
        </Field>
    );

    return (
        <AdminLayout>
            <Head
                title={
                    advertiser ? tr('Edit advertiser') : tr('New advertiser')
                }
            />
            <div className="flex flex-col gap-6">
                <div>
                    <Link
                        href="/admin/ads?tab=advertisers"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('Advertisers')}
                    </Link>
                    <h1 className="mt-2 text-2xl font-bold text-foreground">
                        {advertiser
                            ? tr('Edit {0}', [
                                  advertiser.brand ?? advertiser.name,
                              ])
                            : tr('New advertiser')}
                    </h1>
                </div>

                <form
                    onSubmit={submit}
                    className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start"
                    data-testid="advertiser-form"
                >
                    <Panel title={tr('Company & contact')} icon={Building2}>
                        <div className="grid gap-5 sm:grid-cols-2">
                            {text('name', 'Company name', {
                                required: true,
                                maxLength: 120,
                            })}
                            {text('brand', 'Brand (shown to players)', {
                                maxLength: 120,
                            })}
                            {text('industry', 'Industry', { maxLength: 60 })}
                            {text('tax_id', 'Tax ID (NPWP)', { maxLength: 40 })}
                            {text('contact_name', 'Contact person', {
                                maxLength: 120,
                            })}
                            {text('phone', 'Phone', { maxLength: 40 })}
                            {text('email', 'Email', {
                                type: 'email',
                                maxLength: 160,
                            })}
                            {text('website', 'Website', {
                                type: 'url',
                                placeholder: 'https://',
                                maxLength: 255,
                            })}
                            <div className="sm:col-span-2">
                                <Field
                                    label={tr('Address')}
                                    error={errors.address}
                                >
                                    <textarea
                                        value={data.address}
                                        onChange={(event) =>
                                            setData(
                                                'address',
                                                event.target.value,
                                            )
                                        }
                                        rows={2}
                                        maxLength={500}
                                        className={`${fieldClass} h-auto py-2`}
                                    />
                                </Field>
                            </div>
                            <div className="sm:col-span-2">
                                <Field
                                    label={tr('Internal notes')}
                                    error={errors.notes}
                                >
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
                            <label className="flex items-center gap-2 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    checked={data.is_active}
                                    onChange={(event) =>
                                        setData(
                                            'is_active',
                                            event.target.checked,
                                        )
                                    }
                                    className="size-4 rounded border-input"
                                />
                                {tr(
                                    'Active (inactive advertisers never serve)',
                                )}
                            </label>
                        </div>
                        <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-border pt-5">
                            {advertiser ? (
                                <button
                                    type="button"
                                    onClick={() => setDeleting(true)}
                                    className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
                                >
                                    <Trash2 className="size-4" />
                                    {tr('Delete')}
                                </button>
                            ) : (
                                <span />
                            )}
                            <div className="flex gap-3">
                                <Link
                                    href="/admin/ads?tab=advertisers"
                                    className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    {tr('Cancel')}
                                </Link>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className={buttonPrimary}
                                    data-testid="advertiser-save"
                                >
                                    {processing && (
                                        <Loader2 className="size-4 animate-spin" />
                                    )}
                                    {advertiser
                                        ? tr('Save changes')
                                        : tr('Create advertiser')}
                                </button>
                            </div>
                        </div>
                    </Panel>

                    <Panel
                        title={tr('Logo')}
                        description={tr('PNG, JPG or WebP, max 1 MB')}
                    >
                        <div className="flex flex-col items-center gap-4">
                            <BrandMark
                                name={data.brand || data.name}
                                logo={preview}
                                className="size-32 rounded-2xl"
                            />
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(event) => {
                                    const file =
                                        event.target.files?.[0] ?? null;
                                    setData((current) => ({
                                        ...current,
                                        logo: file,
                                        remove_logo: false,
                                    }));
                                    setPreview(
                                        file
                                            ? URL.createObjectURL(file)
                                            : (advertiser?.logo_url ?? null),
                                    );
                                }}
                                className="w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:text-sm file:font-medium"
                                data-testid="advertiser-logo"
                            />
                            <InputError message={errors.logo} />
                            {advertiser?.logo_url && !data.logo && (
                                <label className="flex items-center gap-2 self-start text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={data.remove_logo}
                                        onChange={(event) => {
                                            setData(
                                                'remove_logo',
                                                event.target.checked,
                                            );
                                            setPreview(
                                                event.target.checked
                                                    ? null
                                                    : advertiser.logo_url,
                                            );
                                        }}
                                        className="size-4 rounded border-input"
                                    />
                                    {tr('Remove current logo')}
                                </label>
                            )}
                        </div>
                    </Panel>
                </form>
            </div>

            {advertiser && (
                <ConfirmDialog
                    open={deleting}
                    title={tr('Delete advertiser?')}
                    message={tr(
                        '“{0}” and its campaigns will be removed. Advertisers with active or paused campaigns cannot be deleted.',
                        [advertiser.brand ?? advertiser.name],
                    )}
                    confirmLabel={tr('Delete')}
                    processing={removing}
                    onClose={() => setDeleting(false)}
                    onConfirm={() =>
                        router.delete(
                            `/admin/ads/advertisers/${advertiser.id}`,
                            {
                                onStart: () => setRemoving(true),
                                onFinish: () => {
                                    setRemoving(false);
                                    setDeleting(false);
                                },
                            },
                        )
                    }
                />
            )}
        </AdminLayout>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
                {tr(label)}
            </span>
            {children}
            <InputError message={error} />
        </div>
    );
}
