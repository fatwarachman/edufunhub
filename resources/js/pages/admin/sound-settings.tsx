import { FlashMessages } from '@/components/admin/admin-kit';
import { Panel } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import {
    type CorrectSound,
    type GameSoundSettings,
    playGameSound,
    type WrongSound,
} from '@/lib/game-sounds';
import { cn } from '@/lib/utils';
import { Head, useForm } from '@inertiajs/react';
import {
    CircleCheck,
    CircleX,
    Loader2,
    Play,
    RotateCcw,
    Volume2,
    VolumeX,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef } from 'react';

interface Props {
    settings: GameSoundSettings;
    defaults: GameSoundSettings;
    options: { correct: CorrectSound[]; wrong: WrongSound[] };
}

const LABELS: Record<
    CorrectSound | WrongSound,
    { name: string; hint: string }
> = {
    bell: { name: 'Bell', hint: 'Bright two-note bell (default)' },
    chime: { name: 'Chime', hint: 'Rising four-note chime' },
    coin: { name: 'Coin', hint: 'Retro arcade coin' },
    classic: { name: 'Classic', hint: 'The original short blip' },
    buzzer: { name: 'Buzzer', hint: 'Double quiz-show buzzer (default)' },
    boing: { name: 'Boing', hint: 'Playful falling boing' },
    thud: { name: 'Thud', hint: 'Soft low thud' },
};

export default function SoundSettings({ settings, defaults, options }: Props) {
    const form = useForm<GameSoundSettings>({ ...settings });
    const { data, setData, errors, processing, isDirty } = form;
    const context = useRef<AudioContext | null>(null);

    useEffect(
        () => () => {
            void context.current?.close().catch(() => {});
        },
        [],
    );

    const preview = (
        sound: 'correct' | 'wrong',
        next: Partial<GameSoundSettings> = {},
    ) => {
        if (typeof window.AudioContext === 'undefined') {
            return;
        }
        context.current ??= new AudioContext();
        void context.current.resume().catch(() => {});
        playGameSound(context.current, sound, {
            ...data,
            ...next,
            enabled: true,
        });
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.put('/admin/sound-settings', { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title="Sound Settings" />
            <div className="flex w-full flex-col gap-6">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Volume2 className="size-6 text-sky-500" />
                        Sound Settings
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Answer sounds for every game. Players can still mute
                        sound on their own device.
                    </p>
                </div>

                <FlashMessages />

                <form
                    onSubmit={submit}
                    className="flex flex-col gap-6"
                    data-testid="sound-settings-form"
                >
                    <Panel
                        title="Playback"
                        icon={data.enabled ? Volume2 : VolumeX}
                    >
                        <div className="flex flex-col gap-5">
                            <label className="flex items-center justify-between gap-4">
                                <span className="flex flex-col">
                                    <span className="text-sm font-medium text-foreground">
                                        Game sounds
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        Turn off to silence answer and game
                                        effects for everyone.
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={data.enabled}
                                    onClick={() =>
                                        setData('enabled', !data.enabled)
                                    }
                                    data-testid="sound-enabled"
                                    className={cn(
                                        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                                        data.enabled
                                            ? 'bg-primary'
                                            : 'bg-muted-foreground/30',
                                    )}
                                >
                                    <span className="sr-only">Game sounds</span>
                                    <span
                                        className={cn(
                                            'inline-block size-5 rounded-full bg-white shadow transition-transform',
                                            data.enabled
                                                ? 'translate-x-5'
                                                : 'translate-x-0.5',
                                        )}
                                    />
                                </button>
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="flex items-center justify-between text-sm font-medium text-foreground">
                                    Volume
                                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                                        {data.volume}%
                                    </span>
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={data.volume}
                                    disabled={!data.enabled}
                                    onChange={(event) =>
                                        setData(
                                            'volume',
                                            Number(event.target.value),
                                        )
                                    }
                                    className="h-9 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                                    data-testid="sound-volume"
                                />
                                <InputError message={errors.volume} />
                            </label>
                        </div>
                    </Panel>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <SoundPicker
                            title="Correct answer"
                            icon={CircleCheck}
                            tone="text-emerald-600 dark:text-emerald-400"
                            name="correct"
                            options={options.correct}
                            value={data.correct}
                            onChange={(value) => {
                                setData('correct', value as CorrectSound);
                                preview('correct', {
                                    correct: value as CorrectSound,
                                });
                            }}
                            onPreview={(value) =>
                                preview('correct', {
                                    correct: value as CorrectSound,
                                })
                            }
                            error={errors.correct}
                        />
                        <SoundPicker
                            title="Wrong answer"
                            icon={CircleX}
                            tone="text-red-600 dark:text-red-400"
                            name="wrong"
                            options={options.wrong}
                            value={data.wrong}
                            onChange={(value) => {
                                setData('wrong', value as WrongSound);
                                preview('wrong', {
                                    wrong: value as WrongSound,
                                });
                            }}
                            onPreview={(value) =>
                                preview('wrong', { wrong: value as WrongSound })
                            }
                            error={errors.wrong}
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setData({ ...defaults })}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent"
                        >
                            <RotateCcw className="size-4" />
                            Use defaults
                        </button>
                        <button
                            type="submit"
                            disabled={processing || !isDirty}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            data-testid="sound-settings-save"
                        >
                            {processing && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            Save sounds
                        </button>
                    </div>
                </form>
            </div>
        </AdminLayout>
    );
}

function SoundPicker({
    title,
    icon: Icon,
    tone,
    name,
    options,
    value,
    onChange,
    onPreview,
    error,
}: {
    title: string;
    icon: React.ElementType;
    tone: string;
    name: string;
    options: string[];
    value: string;
    onChange: (value: string) => void;
    onPreview: (value: string) => void;
    error?: string;
}) {
    return (
        <Panel title={title} icon={Icon}>
            <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">{title}</legend>
                {options.map((option) => {
                    const label = LABELS[option as CorrectSound | WrongSound];
                    const checked = value === option;
                    return (
                        <div
                            key={option}
                            className={cn(
                                'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                                checked
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:bg-accent/50',
                            )}
                        >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                                <input
                                    type="radio"
                                    name={name}
                                    value={option}
                                    checked={checked}
                                    onChange={() => onChange(option)}
                                    className="size-4 accent-primary"
                                    data-testid={`sound-${name}-${option}`}
                                />
                                <span className="flex min-w-0 flex-col">
                                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                        {checked && (
                                            <Icon
                                                className={`size-4 ${tone}`}
                                            />
                                        )}
                                        {label?.name ?? option}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {label?.hint}
                                    </span>
                                </span>
                            </label>
                            <button
                                type="button"
                                onClick={() => onPreview(option)}
                                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent"
                                aria-label={`Play ${label?.name ?? option}`}
                                title={`Play ${label?.name ?? option}`}
                                data-testid={`sound-preview-${name}-${option}`}
                            >
                                <Play className="size-4" />
                            </button>
                        </div>
                    );
                })}
                <InputError message={error} />
            </fieldset>
        </Panel>
    );
}
