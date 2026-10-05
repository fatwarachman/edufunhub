import { buttonPrimary } from '@/components/admin/ads/shared';
import { Panel, fieldClass } from '@/components/admin/game-stats';
import { cn } from '@/lib/utils';
import { router, useForm } from '@inertiajs/react';
import {
    EyeOff,
    Loader2,
    Power,
    Repeat,
    Search,
    SlidersHorizontal,
    UserX,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export interface PlacementRule {
    is_enabled: boolean;
    mode: 'static' | 'rotate';
    rotate_seconds: number;
    max_creatives: number;
}

export interface AdControls {
    enabled: boolean;
    placements: Record<string, PlacementRule>;
    excluded_users: { id: number; name: string; email: string }[];
    excluded_count: number;
    max_creatives: number;
}

interface FoundUser {
    id: number;
    name: string;
    email: string;
    ads_disabled: boolean;
}

/**
 * Ad delivery controls: global kill switch, per-placement rules
 * (on/off, static or rotating) and the list of users who never see ads.
 */
export function AdSettings({
    controls,
    labels,
}: {
    controls: AdControls;
    labels: Record<string, string>;
}) {
    return (
        <div className="flex flex-col gap-6" data-testid="ads-settings">
            <GlobalSwitch enabled={controls.enabled} />
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
                <PlacementRules
                    placements={controls.placements}
                    labels={labels}
                    maxCreatives={controls.max_creatives}
                />
                <ExcludedUsers
                    users={controls.excluded_users}
                    total={controls.excluded_count}
                />
            </div>
        </div>
    );
}

function GlobalSwitch({ enabled }: { enabled: boolean }) {
    const [processing, setProcessing] = useState(false);
    return (
        <section
            className={cn(
                'flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 shadow-sm',
                enabled
                    ? 'border-border bg-card'
                    : 'border-amber-500/40 bg-amber-500/10',
            )}
        >
            <div className="flex items-start gap-3">
                <span
                    className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-xl text-white',
                        enabled ? 'bg-emerald-500' : 'bg-amber-500',
                    )}
                >
                    <Power className="size-5" />
                </span>
                <div>
                    <h3 className="font-semibold text-foreground">
                        {enabled
                            ? 'Ads are on for all users'
                            : 'Ads are off for all users'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {enabled
                            ? 'Turning ads off hides every ad space, sponsor item label and jingle immediately. Campaigns keep their settings.'
                            : 'No ad space is rendered anywhere. Campaign flights keep running on the calendar but deliver nothing.'}
                    </p>
                </div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={processing}
                onClick={() =>
                    router.patch(
                        '/admin/ads/settings/global',
                        { enabled: !enabled },
                        {
                            preserveScroll: true,
                            onStart: () => setProcessing(true),
                            onFinish: () => setProcessing(false),
                        },
                    )
                }
                className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium disabled:opacity-50',
                    enabled
                        ? 'border border-border text-foreground hover:bg-muted'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
                data-testid="ads-global-toggle"
            >
                {processing && <Loader2 className="size-4 animate-spin" />}
                {enabled ? 'Disable all ads' : 'Enable ads'}
            </button>
        </section>
    );
}

function PlacementRules({
    placements,
    labels,
    maxCreatives,
}: {
    placements: Record<string, PlacementRule>;
    labels: Record<string, string>;
    maxCreatives: number;
}) {
    const form = useForm({ placements });
    const { data, setData, processing, errors, isDirty } = form;
    const update = (key: string, patch: Partial<PlacementRule>) =>
        setData('placements', {
            ...data.placements,
            [key]: { ...data.placements[key], ...patch },
        });

    return (
        <Panel
            title="Placement rules"
            description="Static shows one creative per page view. Rotating cycles through several creatives on the same spot."
            icon={SlidersHorizontal}
            actions={
                <button
                    type="button"
                    disabled={processing || !isDirty}
                    onClick={() =>
                        form.put('/admin/ads/settings/placements', {
                            preserveScroll: true,
                        })
                    }
                    className={buttonPrimary}
                    data-testid="ads-placements-save"
                >
                    {processing && <Loader2 className="size-4 animate-spin" />}
                    Save rules
                </button>
            }
        >
            <div className="-mx-5 -my-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                        <tr>
                            <th className="px-5 py-3 font-medium">Placement</th>
                            <th className="px-3 py-3 font-medium">Shown</th>
                            <th className="px-3 py-3 font-medium">Display</th>
                            <th className="px-3 py-3 font-medium">Every</th>
                            <th className="px-5 py-3 font-medium">
                                Creatives in rotation
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {Object.entries(data.placements).map(([key, rule]) => {
                            const fixed =
                                key.startsWith('jingle.') ||
                                key === 'shop.item';
                            const rotating = !fixed && rule.mode === 'rotate';
                            return (
                                <tr
                                    key={key}
                                    className={cn(
                                        !rule.is_enabled && 'bg-muted/30',
                                    )}
                                    data-testid={`ads-rule-${key}`}
                                >
                                    <td className="px-5 py-2.5">
                                        <p className="font-medium text-foreground">
                                            {labels[key] ?? key}
                                        </p>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {key}
                                        </p>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <label className="inline-flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={rule.is_enabled}
                                                onChange={(event) =>
                                                    update(key, {
                                                        is_enabled:
                                                            event.target
                                                                .checked,
                                                    })
                                                }
                                                className="size-4 rounded border-input"
                                                data-testid={`ads-rule-enabled-${key}`}
                                            />
                                            <span className="text-xs text-muted-foreground">
                                                {rule.is_enabled
                                                    ? 'On'
                                                    : 'Hidden'}
                                            </span>
                                        </label>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {fixed ? (
                                            <span className="text-xs text-muted-foreground">
                                                {key === 'shop.item'
                                                    ? 'Per item'
                                                    : 'Once per moment'}
                                            </span>
                                        ) : (
                                            <div
                                                className="inline-flex rounded-lg border border-border p-0.5"
                                                role="radiogroup"
                                            >
                                                {(
                                                    [
                                                        'static',
                                                        'rotate',
                                                    ] as const
                                                ).map((mode) => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={
                                                            rule.mode === mode
                                                        }
                                                        disabled={
                                                            !rule.is_enabled
                                                        }
                                                        onClick={() =>
                                                            update(key, {
                                                                mode,
                                                            })
                                                        }
                                                        data-testid={`ads-rule-mode-${key}-${mode}`}
                                                        className={cn(
                                                            'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium disabled:opacity-50',
                                                            rule.mode === mode
                                                                ? 'bg-primary text-primary-foreground'
                                                                : 'text-muted-foreground hover:text-foreground',
                                                        )}
                                                    >
                                                        {mode === 'rotate' && (
                                                            <Repeat className="size-3" />
                                                        )}
                                                        {mode === 'static'
                                                            ? 'Static'
                                                            : 'Rotating'}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    {fixed ? (
                                        <td
                                            colSpan={2}
                                            className="px-3 py-2.5 text-xs text-muted-foreground"
                                        >
                                            —
                                        </td>
                                    ) : (
                                        <>
                                            <td className="px-3 py-2.5">
                                                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <input
                                                        type="number"
                                                        min={3}
                                                        max={120}
                                                        value={
                                                            rule.rotate_seconds
                                                        }
                                                        disabled={!rotating}
                                                        onChange={(event) =>
                                                            update(key, {
                                                                rotate_seconds:
                                                                    Number(
                                                                        event
                                                                            .target
                                                                            .value,
                                                                    ),
                                                            })
                                                        }
                                                        className={cn(
                                                            fieldClass,
                                                            'h-8 w-20 disabled:opacity-40',
                                                        )}
                                                        aria-label="Seconds"
                                                    />
                                                    sec
                                                </label>
                                            </td>
                                            <td className="px-5 py-2.5">
                                                <select
                                                    value={rule.max_creatives}
                                                    disabled={!rotating}
                                                    onChange={(event) =>
                                                        update(key, {
                                                            max_creatives:
                                                                Number(
                                                                    event.target
                                                                        .value,
                                                                ),
                                                        })
                                                    }
                                                    className={cn(
                                                        fieldClass,
                                                        'h-8 disabled:opacity-40',
                                                    )}
                                                    aria-label="Creatives in rotation"
                                                >
                                                    {Array.from(
                                                        {
                                                            length:
                                                                maxCreatives -
                                                                1,
                                                        },
                                                        (_, i) => i + 2,
                                                    ).map((n) => (
                                                        <option
                                                            key={n}
                                                            value={n}
                                                        >
                                                            up to {n}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {Object.keys(errors).length > 0 && (
                <p className="mt-6 text-sm text-destructive">
                    {Object.values(errors)[0]}
                </p>
            )}
        </Panel>
    );
}

function ExcludedUsers({
    users,
    total,
}: {
    users: AdControls['excluded_users'];
    total: number;
}) {
    const [query, setQuery] = useState('');
    const [found, setFound] = useState<FoundUser[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) return;
        const controller = new AbortController();
        const id = window.setTimeout(() => {
            setSearching(true);
            fetch(`/admin/ads/settings/users?q=${encodeURIComponent(term)}`, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
                signal: controller.signal,
            })
                .then((r) => (r.ok ? r.json() : []))
                .then((rows: FoundUser[]) => setFound(rows))
                .catch(() => {})
                .finally(() => setSearching(false));
        }, 300);
        return () => {
            controller.abort();
            window.clearTimeout(id);
        };
    }, [query]);

    const setAds = (id: number, disabled: boolean) =>
        router.patch(
            `/admin/ads/users/${id}`,
            { ads_disabled: disabled },
            {
                preserveScroll: true,
                onSuccess: () =>
                    setFound((rows) =>
                        rows.map((row) =>
                            row.id === id
                                ? { ...row, ads_disabled: disabled }
                                : row,
                        ),
                    ),
            },
        );

    const results = query.trim().length >= 2 ? found : [];

    return (
        <Panel
            title="Users without ads"
            description={`${total} account(s) never see ads, sponsor labels or jingles`}
            icon={EyeOff}
        >
            <div className="flex flex-col gap-4">
                <label className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Find a user by name or email"
                        className={cn(fieldClass, 'w-full pl-8')}
                        data-testid="ads-user-search"
                    />
                    {searching && (
                        <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                </label>
                {results.length > 0 && (
                    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                        {results.map((user) => (
                            <li
                                key={user.id}
                                className="flex items-center gap-3 px-3 py-2"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-foreground">
                                        {user.name}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {user.email}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setAds(user.id, !user.ads_disabled)
                                    }
                                    className={cn(
                                        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium',
                                        user.ads_disabled
                                            ? 'border border-border text-foreground hover:bg-muted'
                                            : 'bg-primary text-primary-foreground hover:bg-primary/90',
                                    )}
                                    data-testid={`ads-user-toggle-${user.id}`}
                                >
                                    {user.ads_disabled
                                        ? 'Show ads'
                                        : 'Hide ads'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {users.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <UserX className="size-4" />
                        Everyone sees ads.
                    </p>
                ) : (
                    <ul
                        className="flex flex-wrap gap-2"
                        data-testid="ads-excluded-users"
                    >
                        {users.map((user) => (
                            <li
                                key={user.id}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background py-1 pr-1 pl-3 text-xs"
                                title={user.email}
                            >
                                <span className="truncate font-medium text-foreground">
                                    {user.name}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAds(user.id, false)}
                                    className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                                    aria-label={`Show ads to ${user.name}`}
                                >
                                    <X className="size-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Panel>
    );
}
