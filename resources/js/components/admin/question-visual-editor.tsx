import { fieldClass } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import {
    hasQuestionMedia,
    QuestionMedia,
    type QuestionMediaData,
    TOPOLOGY_SHAPES,
    type TopologyShape,
} from '@/components/question-media';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import {
    Cable,
    ImageIcon,
    ImageOff,
    Loader2,
    Network,
    Plus,
    TerminalSquare,
    Upload,
    X,
} from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';

type Bilingual = { id: string; en: string };

/** Editable shape of a question visual (all kinds' fields kept while editing). */
export interface VisualDraft {
    kind: '' | 'image' | 'cable' | 'topology' | 'terminal';
    src: string;
    alt: Bilingual;
    style: 'utp' | 'fiber';
    wires: { color: string; stripe: string }[];
    shape: TopologyShape;
    lines: string;
    caption: Bilingual;
}

const ORANGE = '#f97316';
const GREEN = '#16a34a';
const BLUE = '#2563eb';
const BROWN = '#7c4a1e';
const WHITE = '#f8fafc';

/** Ready-made wire orders (mirror database/data/sequence_sets.php). */
const CABLE_PRESETS: {
    key: string;
    label: string;
    style: 'utp' | 'fiber';
    wires: { color: string; stripe: string }[];
}[] = [
    {
        key: 't568b',
        label: 'UTP T568B',
        style: 'utp',
        wires: [
            { color: WHITE, stripe: ORANGE },
            { color: ORANGE, stripe: '' },
            { color: WHITE, stripe: GREEN },
            { color: BLUE, stripe: '' },
            { color: WHITE, stripe: BLUE },
            { color: GREEN, stripe: '' },
            { color: WHITE, stripe: BROWN },
            { color: BROWN, stripe: '' },
        ],
    },
    {
        key: 't568a',
        label: 'UTP T568A',
        style: 'utp',
        wires: [
            { color: WHITE, stripe: GREEN },
            { color: GREEN, stripe: '' },
            { color: WHITE, stripe: ORANGE },
            { color: BLUE, stripe: '' },
            { color: WHITE, stripe: BLUE },
            { color: ORANGE, stripe: '' },
            { color: WHITE, stripe: BROWN },
            { color: BROWN, stripe: '' },
        ],
    },
    {
        key: 'fiber12',
        label: 'Fiber TIA-598 (12)',
        style: 'fiber',
        wires: [
            BLUE,
            ORANGE,
            GREEN,
            BROWN,
            '#64748b',
            WHITE,
            '#dc2626',
            '#111827',
            '#facc15',
            '#7c3aed',
            '#ec4899',
            '#22d3ee',
        ].map((color) => ({ color, stripe: '' })),
    },
];

const KINDS: {
    value: VisualDraft['kind'];
    label: string;
    icon: typeof ImageIcon;
}[] = [
    { value: '', label: 'No visual', icon: ImageOff },
    { value: 'image', label: 'Picture', icon: ImageIcon },
    { value: 'cable', label: 'Cable', icon: Cable },
    { value: 'topology', label: 'Topology', icon: Network },
    { value: 'terminal', label: 'Terminal', icon: TerminalSquare },
];

const TOPOLOGY_LABELS: Record<TopologyShape, string> = {
    star: 'Star',
    bus: 'Bus',
    ring: 'Ring',
    mesh: 'Mesh',
    tree: 'Tree',
    point: 'Point-to-point',
};

const MAX_WIRES = 12;
const MIN_WIRES = 2;

const blankText = (): Bilingual => ({ id: '', en: '' });

/** Draft from a stored visual (or an empty draft). */
export function visualDraft(visual: QuestionMediaData | null): VisualDraft {
    const draft: VisualDraft = {
        kind: '',
        src: '',
        alt: blankText(),
        style: 'utp',
        wires: CABLE_PRESETS[0].wires.map((wire) => ({ ...wire })),
        shape: 'star',
        lines: '',
        caption: { ...blankText(), ...(visual?.caption ?? {}) },
    };
    if (!visual) {
        return draft;
    }
    switch (visual.kind) {
        case 'image':
            return {
                ...draft,
                kind: 'image',
                src: visual.src,
                alt: { ...blankText(), ...(visual.alt ?? {}) },
            };
        case 'cable':
            return {
                ...draft,
                kind: 'cable',
                style: visual.style ?? 'utp',
                wires: visual.wires.map((wire) => ({
                    color: wire.color,
                    stripe: wire.stripe ?? '',
                })),
            };
        case 'topology':
            return { ...draft, kind: 'topology', shape: visual.shape };
        case 'terminal':
            return {
                ...draft,
                kind: 'terminal',
                lines: visual.lines.join('\n'),
            };
        default:
            return draft;
    }
}

/** Payload sent to the server (null when the question has no visual). */
export function visualPayload(draft: VisualDraft): QuestionMediaData | null {
    const caption =
        draft.caption.id.trim() || draft.caption.en.trim()
            ? draft.caption
            : undefined;
    switch (draft.kind) {
        case 'image':
            return {
                kind: 'image',
                src: draft.src,
                alt: draft.alt.id || draft.alt.en ? draft.alt : undefined,
                caption,
            };
        case 'cable':
            return {
                kind: 'cable',
                style: draft.style,
                wires: draft.wires.map((wire) => ({
                    color: wire.color,
                    stripe: wire.stripe || undefined,
                })),
                caption,
            };
        case 'topology':
            return { kind: 'topology', shape: draft.shape, caption };
        case 'terminal':
            return {
                kind: 'terminal',
                lines: draft.lines.replace(/\r/g, '').split('\n').slice(0, 12),
                caption,
            };
        default:
            return null;
    }
}

function csrf(): string {
    return decodeURIComponent(
        document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '',
    );
}

/**
 * Admin editor for a question visual: uploaded picture, UTP/fibre cable,
 * topology or terminal output, with a live preview identical to the game.
 */
export function QuestionVisualEditor({
    value,
    onChange,
    errors,
}: {
    value: VisualDraft;
    onChange: (next: VisualDraft) => void;
    errors: Record<string, string>;
}) {
    const fileInput = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const set = (patch: Partial<VisualDraft>) =>
        onChange({ ...value, ...patch });
    const errorFor = (key: string): string | undefined =>
        errors[`visual.${key}`];
    const wireError = Object.entries(errors).find(([key]) =>
        key.startsWith('visual.wires'),
    )?.[1];
    const preview = visualPayload(value);

    const upload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) {
            return;
        }
        setUploading(true);
        setUploadError(null);
        try {
            const body = new FormData();
            body.append('image', file);
            const response = await fetch('/admin/questions/media', {
                method: 'POST',
                body,
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': csrf(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            const json = (await response.json().catch(() => ({}))) as {
                src?: string;
                message?: string;
                errors?: Record<string, string[]>;
            };
            if (!response.ok || !json.src) {
                setUploadError(
                    json.errors?.image?.[0] ??
                        json.message ??
                        tr('Upload failed. Try again.'),
                );
                return;
            }
            set({ src: json.src });
        } catch {
            setUploadError(tr('Upload failed. Try again.'));
        } finally {
            setUploading(false);
        }
    };

    const updateWire = (
        index: number,
        field: 'color' | 'stripe',
        color: string,
    ) =>
        set({
            wires: value.wires.map((wire, i) =>
                i === index ? { ...wire, [field]: color } : wire,
            ),
        });

    return (
        <div className="flex flex-col gap-4" data-testid="question-visual">
            <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={tr('Visual type')}
            >
                {KINDS.map(({ value: kind, label, icon: Icon }) => (
                    <button
                        key={kind || 'none'}
                        type="button"
                        aria-pressed={value.kind === kind}
                        onClick={() => set({ kind })}
                        data-testid={`question-visual-kind-${kind || 'none'}`}
                        className={cn(
                            'inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
                            value.kind === kind
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-input text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon className="size-4" aria-hidden />
                        {tr(label)}
                    </button>
                ))}
            </div>

            {value.kind !== '' && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                    <div className="flex min-w-0 flex-col gap-4">
                        {value.kind === 'image' && (
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        ref={fileInput}
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="sr-only"
                                        onChange={upload}
                                        data-testid="question-visual-file"
                                        aria-label={tr('Upload picture')}
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            fileInput.current?.click()
                                        }
                                        disabled={uploading}
                                        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                                    >
                                        {uploading ? (
                                            <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                            <Upload className="size-4" />
                                        )}
                                        {value.src
                                            ? tr('Replace picture')
                                            : tr('Upload picture')}
                                    </button>
                                    <span className="text-xs text-muted-foreground">
                                        {tr(
                                            'JPG, PNG or WEBP, max 2 MB. Diagrams and photos of devices work best.',
                                        )}
                                    </span>
                                </div>
                                <InputError
                                    message={uploadError ?? errorFor('src')}
                                />
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <input
                                        value={value.alt.id}
                                        onChange={(e) =>
                                            set({
                                                alt: {
                                                    ...value.alt,
                                                    id: e.target.value,
                                                },
                                            })
                                        }
                                        placeholder={tr(
                                            'Picture description (Indonesian)',
                                        )}
                                        aria-label={tr(
                                            'Picture description (Indonesian)',
                                        )}
                                        maxLength={120}
                                        className={cn(fieldClass, 'w-full')}
                                    />
                                    <input
                                        value={value.alt.en}
                                        onChange={(e) =>
                                            set({
                                                alt: {
                                                    ...value.alt,
                                                    en: e.target.value,
                                                },
                                            })
                                        }
                                        placeholder={tr(
                                            'Picture description (English)',
                                        )}
                                        aria-label={tr(
                                            'Picture description (English)',
                                        )}
                                        maxLength={120}
                                        className={cn(fieldClass, 'w-full')}
                                    />
                                </div>
                            </div>
                        )}

                        {value.kind === 'cable' && (
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                        {tr('Preset')}
                                    </span>
                                    {CABLE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            onClick={() =>
                                                set({
                                                    style: preset.style,
                                                    wires: preset.wires.map(
                                                        (wire) => ({ ...wire }),
                                                    ),
                                                })
                                            }
                                            data-testid={`question-visual-preset-${preset.key}`}
                                            className="min-h-9 rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <div
                                    className="inline-flex w-fit rounded-lg border border-input p-1"
                                    role="group"
                                    aria-label={tr('Cable type')}
                                >
                                    {(['utp', 'fiber'] as const).map(
                                        (style) => (
                                            <button
                                                key={style}
                                                type="button"
                                                aria-pressed={
                                                    value.style === style
                                                }
                                                onClick={() => set({ style })}
                                                className={cn(
                                                    'rounded-md px-3 py-1.5 text-sm font-medium',
                                                    value.style === style
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'text-muted-foreground hover:text-foreground',
                                                )}
                                            >
                                                {style === 'utp'
                                                    ? tr('UTP (RJ-45)')
                                                    : tr('Fibre cores')}
                                            </button>
                                        ),
                                    )}
                                </div>
                                <ol className="flex flex-col gap-2">
                                    {value.wires.map((wire, index) => (
                                        <li
                                            key={index}
                                            className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
                                        >
                                            <span className="w-6 text-center text-sm font-semibold text-muted-foreground tabular-nums">
                                                {index + 1}
                                            </span>
                                            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                {tr('Colour')}
                                                <input
                                                    type="color"
                                                    value={wire.color}
                                                    onChange={(e) =>
                                                        updateWire(
                                                            index,
                                                            'color',
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
                                                    aria-label={tr(
                                                        'Wire {0} colour',
                                                        [index + 1],
                                                    )}
                                                />
                                            </label>
                                            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <input
                                                    type="checkbox"
                                                    className="size-4 accent-[var(--primary)]"
                                                    checked={wire.stripe !== ''}
                                                    onChange={(e) =>
                                                        updateWire(
                                                            index,
                                                            'stripe',
                                                            e.target.checked
                                                                ? ORANGE
                                                                : '',
                                                        )
                                                    }
                                                />
                                                {tr('Stripe')}
                                            </label>
                                            {wire.stripe !== '' && (
                                                <input
                                                    type="color"
                                                    value={wire.stripe}
                                                    onChange={(e) =>
                                                        updateWire(
                                                            index,
                                                            'stripe',
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
                                                    aria-label={tr(
                                                        'Wire {0} stripe colour',
                                                        [index + 1],
                                                    )}
                                                />
                                            )}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    set({
                                                        wires: value.wires.filter(
                                                            (_, i) =>
                                                                i !== index,
                                                        ),
                                                    })
                                                }
                                                disabled={
                                                    value.wires.length <=
                                                    MIN_WIRES
                                                }
                                                aria-label={tr(
                                                    'Remove wire {0}',
                                                    [index + 1],
                                                )}
                                                className="ml-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"
                                            >
                                                <X className="size-4" />
                                            </button>
                                        </li>
                                    ))}
                                </ol>
                                {value.wires.length < MAX_WIRES && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            set({
                                                wires: [
                                                    ...value.wires,
                                                    { color: BLUE, stripe: '' },
                                                ],
                                            })
                                        }
                                        className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
                                    >
                                        <Plus className="size-4" />
                                        {tr('Add wire')}
                                    </button>
                                )}
                                <InputError
                                    message={errorFor('wires') ?? wireError}
                                />
                            </div>
                        )}

                        {value.kind === 'topology' && (
                            <div className="flex flex-col gap-2">
                                <div
                                    className="flex flex-wrap gap-2"
                                    role="group"
                                    aria-label={tr('Topology')}
                                >
                                    {TOPOLOGY_SHAPES.map((shape) => (
                                        <button
                                            key={shape}
                                            type="button"
                                            aria-pressed={value.shape === shape}
                                            onClick={() => set({ shape })}
                                            data-testid={`question-visual-shape-${shape}`}
                                            className={cn(
                                                'min-h-11 rounded-lg border px-3 py-2 text-sm font-medium',
                                                value.shape === shape
                                                    ? 'border-primary bg-primary/10 text-foreground'
                                                    : 'border-input text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {tr(TOPOLOGY_LABELS[shape])}
                                        </button>
                                    ))}
                                </div>
                                <InputError message={errorFor('shape')} />
                            </div>
                        )}

                        {value.kind === 'terminal' && (
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor="visual-lines"
                                    className="text-sm font-medium text-foreground"
                                >
                                    {tr('Terminal output (max 12 lines)')}
                                </label>
                                <textarea
                                    id="visual-lines"
                                    rows={6}
                                    value={value.lines}
                                    onChange={(e) =>
                                        set({ lines: e.target.value })
                                    }
                                    placeholder={'C:\\> ping 192.168.1.1'}
                                    className={cn(
                                        fieldClass,
                                        'h-auto w-full py-2 font-mono text-xs',
                                    )}
                                    data-testid="question-visual-lines"
                                    spellCheck={false}
                                />
                                <InputError
                                    message={
                                        errorFor('lines') ??
                                        Object.entries(errors).find(([key]) =>
                                            key.startsWith('visual.lines.'),
                                        )?.[1]
                                    }
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <input
                                value={value.caption.id}
                                onChange={(e) =>
                                    set({
                                        caption: {
                                            ...value.caption,
                                            id: e.target.value,
                                        },
                                    })
                                }
                                placeholder={tr(
                                    'Caption (Indonesian, optional)',
                                )}
                                aria-label={tr(
                                    'Caption (Indonesian, optional)',
                                )}
                                maxLength={120}
                                className={cn(fieldClass, 'w-full')}
                            />
                            <input
                                value={value.caption.en}
                                onChange={(e) =>
                                    set({
                                        caption: {
                                            ...value.caption,
                                            en: e.target.value,
                                        },
                                    })
                                }
                                placeholder={tr('Caption (English, optional)')}
                                aria-label={tr('Caption (English, optional)')}
                                maxLength={120}
                                className={cn(fieldClass, 'w-full')}
                            />
                        </div>
                        <InputError message={errorFor('kind')} />
                    </div>

                    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-dashed border-border bg-[#fff9e6] p-3 dark:bg-[#fff9e6]">
                        <span className="text-xs font-semibold text-[#1f2a44] uppercase">
                            {tr('Preview in game')}
                        </span>
                        {hasQuestionMedia(preview) ? (
                            <QuestionMedia media={preview} />
                        ) : (
                            <p className="py-6 text-center text-xs text-slate-600">
                                {tr('Upload a picture to see the preview.')}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
