import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { GameFinale, rankStandings } from '@/components/game-finale';
import {
    AnswerTimePicker,
    RoomLeaveControl,
} from '@/components/multiplayer/host-controls';
import {
    ConnectionBadge,
    RoomEntry,
    RoomError,
    RoomLobby,
    type RoomPayload,
    useRoomPin,
} from '@/components/multiplayer/room';
import { PlayerAvatar } from '@/components/player-avatar';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import { Button } from '@/components/ui/button';
import { useGameAudio } from '@/hooks/use-game-audio';
import {
    type MiniGameKey,
    type MiniSeat,
    type MiniState,
    type MiniVisual,
    useMiniGameConnection,
} from '@/hooks/use-mini-game-connection';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { GAME_ICONS } from '@/lib/games';
import { cn } from '@/lib/utils';
import { Head } from '@inertiajs/react';
import {
    Apple,
    Atom,
    Banana,
    BatteryFull,
    Bird,
    BookOpen,
    Box,
    Bug,
    Candy,
    Carrot,
    Check,
    Coins,
    Cookie,
    Croissant,
    DoorOpen,
    Droplets,
    Egg,
    Flame,
    FlaskConical,
    Flower2,
    Gamepad2,
    IceCreamCone,
    Leaf,
    Lightbulb,
    type LucideIcon,
    Magnet,
    MapPin,
    Milk,
    Palette,
    Pencil,
    Rocket,
    Scale,
    Shirt,
    Snail,
    Snowflake,
    Sprout,
    Sun,
    Thermometer,
    TreePine,
    Trophy,
    Volume2,
    VolumeX,
    Waves,
    WifiOff,
    X,
    Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface MiniGameProps {
    game: MiniGameKey;
    player: { name: string; grade: number | null };
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

interface Received extends MiniState {
    receivedAt: number;
}

/** Look of each game: catalog icon key, accent and page background. */
const THEMES: Record<
    MiniGameKey,
    { icon: string; accent: string; bg: string; soft: string }
> = {
    'market-math': {
        icon: 'cart',
        accent: '#f97316',
        bg: '#fff7ed',
        soft: '#ffedd5',
    },
    'number-garden': {
        icon: 'flower',
        accent: '#16a34a',
        bg: '#f0fdf4',
        soft: '#dcfce7',
    },
    'explore-indonesia': {
        icon: 'map',
        accent: '#e11d48',
        bg: '#fff1f2',
        soft: '#ffe4e6',
    },
    'mini-lab': {
        icon: 'flask',
        accent: '#7c3aed',
        bg: '#f5f3ff',
        soft: '#ede9fe',
    },
};

/** Icon keys sent by the Go content (minigames/content.go). */
const ITEM_ICONS: Record<string, LucideIcon> = {
    apple: Apple,
    banana: Banana,
    milk: Milk,
    egg: Egg,
    pencil: Pencil,
    book: BookOpen,
    cookie: Cookie,
    candy: Candy,
    carrot: Carrot,
    croissant: Croissant,
    shirt: Shirt,
    'ice-cream': IceCreamCone,
    flower: Flower2,
    leaf: Leaf,
    bug: Bug,
    tree: TreePine,
    sun: Sun,
    bird: Bird,
    snail: Snail,
    droplets: Droplets,
    sprout: Sprout,
    'map-pin': MapPin,
    snowflake: Snowflake,
    waves: Waves,
    magnet: Magnet,
    flask: FlaskConical,
    palette: Palette,
    thermometer: Thermometer,
    flame: Flame,
    lightbulb: Lightbulb,
    battery: BatteryFull,
    scale: Scale,
    box: Box,
    rocket: Rocket,
    zap: Zap,
    atom: Atom,
};

const SEAT_COLORS = ['#ffd6e0', '#bceaf2', '#e3dbf9', '#c9f5e5'];
const LETTERS = ['A', 'B', 'C', 'D'];
const OPTION_COLORS = [
    'bg-[#ffd6e0]',
    'bg-[#bceaf2]',
    'bg-[#fff3b0]',
    'bg-[#c9f5e5]',
];

function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) {
            return;
        }
        const id = setInterval(() => setNow(Date.now()), 200);
        return () => clearInterval(id);
    }, [active]);
    return now;
}

function GameBadgeIcon({ icon }: { icon: string }) {
    const Icon = GAME_ICONS[icon] ?? Gamepad2;
    return <Icon className="size-5" aria-hidden="true" />;
}

function ItemIcon({
    icon,
    color,
    className,
}: {
    icon: string;
    color?: string;
    className?: string;
}) {
    const Icon = ITEM_ICONS[icon] ?? Sprout;
    return (
        <Icon
            className={cn('size-7 shrink-0', className)}
            style={color ? { color, fill: `${color}55` } : undefined}
            aria-hidden="true"
        />
    );
}

/** Server-sent illustration of a question (shop, garden, map, lab…). */
function Illustration({
    visual,
    accent,
    soft,
}: {
    visual: MiniVisual;
    accent: string;
    soft: string;
}) {
    if (!visual.kind || visual.items.length === 0) {
        return null;
    }
    const frame =
        'flex flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-[#1f2a44] p-3';

    return (
        <figure
            className="flex flex-col gap-1.5"
            data-testid="mini-visual"
            data-kind={visual.kind}
        >
            {visual.kind === 'garden' ? (
                <div className={frame} style={{ background: '#dcfce7' }}>
                    {visual.items.flatMap((item, group) =>
                        Array.from({ length: item.count }, (_, i) => (
                            <ItemIcon
                                key={`${group}-${i}`}
                                icon={item.icon}
                                color={item.color}
                                className="size-8"
                            />
                        )),
                    )}
                </div>
            ) : visual.kind === 'sequence' ? (
                <div className={frame} style={{ background: soft }}>
                    {visual.items.map((item, i) => (
                        <span
                            key={i}
                            className="flex flex-col items-center gap-0.5"
                        >
                            <ItemIcon icon={item.icon} color={item.color} />
                            <span className="min-w-9 rounded-lg border-2 border-[#1f2a44] bg-white px-1.5 text-center font-display text-lg font-black tabular-nums">
                                {item.value}
                            </span>
                        </span>
                    ))}
                </div>
            ) : visual.kind === 'tiles' || visual.kind === 'letters' ? (
                <div className={frame} style={{ background: soft }}>
                    {visual.items.map((item, i) =>
                        item.icon ? (
                            <span
                                key={i}
                                className="flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-2.5 py-1 text-sm font-black"
                            >
                                <ItemIcon icon={item.icon} color={accent} />
                                {item.label}
                            </span>
                        ) : (
                            <span
                                key={i}
                                className={cn(
                                    'grid size-10 place-items-center rounded-lg border-2 border-[#1f2a44] font-display text-xl font-black',
                                    item.value === '_'
                                        ? 'bg-[#ffd93d]'
                                        : 'bg-white',
                                )}
                            >
                                {item.value === '_' ? '?' : item.value}
                            </span>
                        ),
                    )}
                </div>
            ) : (
                <div className={frame} style={{ background: soft }}>
                    {visual.items.map((item, i) => (
                        <span
                            key={i}
                            className="flex min-w-24 flex-col items-center gap-1 rounded-xl border-2 border-[#1f2a44] bg-white px-3 py-2 text-center"
                        >
                            <span className="flex items-center gap-0.5">
                                <ItemIcon
                                    icon={item.icon}
                                    color={item.color || accent}
                                />
                                {item.count > 1 && (
                                    <span className="text-sm font-black">
                                        ×{item.count}
                                    </span>
                                )}
                            </span>
                            {item.label && (
                                <span className="text-xs font-black">
                                    {item.label}
                                </span>
                            )}
                            {item.value && (
                                <span className="text-xs font-bold text-slate-600 tabular-nums">
                                    {item.value}
                                </span>
                            )}
                        </span>
                    ))}
                </div>
            )}
            {visual.note && (
                <figcaption className="text-center text-xs font-bold text-slate-600">
                    {visual.note}
                </figcaption>
            )}
        </figure>
    );
}

function Scoreboard({
    players,
    you,
    total,
}: {
    players: MiniSeat[];
    you: number;
    total: number;
}) {
    const { t } = useTranslations();
    return (
        <ul
            className="grid grid-cols-2 gap-2 lg:grid-cols-1"
            data-testid="mini-players"
        >
            {players.map((p) => (
                <li
                    key={p.seat}
                    className={cn(
                        'flex flex-col gap-1.5 rounded-2xl border-2 border-[#1f2a44] p-2',
                        (p.left || !p.online) && 'opacity-60',
                    )}
                    style={{
                        backgroundColor:
                            SEAT_COLORS[p.seat % SEAT_COLORS.length],
                    }}
                >
                    <div className="flex items-center gap-2">
                        <div className="size-10 shrink-0">
                            <PlayerAvatar
                                character={p.character}
                                seat={p.seat}
                                userId={p.user_id}
                            />
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm font-black">
                            {p.name}
                            {p.seat === you && ` (${t('mini.you')})`}
                        </span>
                        {p.answered && (
                            <Check
                                className="size-4 shrink-0 text-[#00695C]"
                                aria-label={t('mini.answered')}
                            />
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <ol className="flex gap-0.5" aria-hidden="true">
                            {Array.from({ length: total }, (_, i) => (
                                <li
                                    key={i}
                                    className={cn(
                                        'h-2 w-2.5 rounded-sm border border-[#1f2a44]',
                                        p.history[i] === true && 'bg-[#00c9a7]',
                                        p.history[i] === false &&
                                            'bg-[#ff6584]',
                                        p.history[i] === undefined &&
                                            'bg-white',
                                    )}
                                />
                            ))}
                        </ol>
                        <span className="rounded-lg border border-[#1f2a44] bg-white px-2 py-0.5 text-xs font-black tabular-nums">
                            {t('mini.score', { score: p.score })}
                        </span>
                    </div>
                </li>
            ))}
        </ul>
    );
}

export default function MiniGame({
    game,
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
}: MiniGameProps) {
    const { t, i18n } = useTranslations();
    const backHref = useGameBackHref();
    const { play, muted, toggleMuted } = useGameAudio();
    const theme = THEMES[game];
    const [state, setState] = useState<Received | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [earned, setEarned] = useState(0);
    const lastReveal = useRef<string | null>(null);
    const lastDone = useRef<string | null>(null);
    const playRef = useRef(play);
    useEffect(() => {
        playRef.current = play;
    }, [play]);

    const onState = useCallback((next: MiniState) => {
        setError(null);
        setState({ ...next, receivedAt: Date.now() });
        if (next.step === 'reveal' && next.question && next.reveal) {
            if (lastReveal.current !== next.question.id) {
                lastReveal.current = next.question.id;
                playRef.current(
                    next.question.choice === next.reveal.answer
                        ? 'correct'
                        : 'wrong',
                );
            }
        }
    }, []);
    const onError = useCallback((code: string) => setError(code), []);

    const connection = useMiniGameConnection(
        game,
        serviceReady ? wsUrl : null,
        i18n.language,
        { onState, onError },
    );
    const online = connection.status === 'online';
    const send = (msg: Record<string, unknown>) => {
        setError(null);
        if (!connection.send(msg)) {
            setError('unknown');
        }
    };
    const join = useCallback(
        (code: string) => connection.send({ t: 'join', pin: code }),
        [connection],
    );
    useRoomPin(online, state?.pin, pin, join);

    const playing = state?.phase === 'playing';
    useAdMoments(
        playing ? 'playing' : state?.phase === 'done' ? 'done' : 'idle',
        { muted, won: state?.result?.won ?? false },
    );
    const now = useNow(playing);
    const since = state ? now - state.receivedAt : 0;

    useEffect(() => {
        if (state?.phase !== 'done' || !state.pin || !state.result) {
            return;
        }
        const key = `${state.pin}-${state.seq}`;
        if (lastDone.current === key) {
            return;
        }
        lastDone.current = key;
        setEarned((value) => value + (state.result?.points ?? 0));
    }, [state]);

    const title = t(`mini.games.${game}.title`);
    const players = (state?.players ?? []) as MiniSeat[];
    const isHost = state?.host === state?.you;
    const room = state as unknown as RoomPayload;
    const total = state?.total ?? 8;

    let body;
    if (!serviceReady || connection.status === 'offline') {
        body = (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-8 text-center font-bold shadow-[5px_5px_0px_#1f2a44]">
                <WifiOff className="size-10" />
                {t('mini.unavailable')}
            </div>
        );
    } else if (!state || state.phase === 'none' || !state.pin) {
        body = (
            <RoomEntry
                status={connection.status}
                error={error}
                intro={t('mini.intro', { name: player.name })}
                onCreate={() => send({ t: 'create' })}
                onJoin={(code) => send({ t: 'join', pin: code })}
            >
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('mini.rules', { rounds: total })}
                </p>
            </RoomEntry>
        );
    } else if (state.phase === 'lobby') {
        body = (
            <RoomLobby
                game={game}
                title={title}
                room={room}
                status={connection.status}
                error={error}
                onStart={() => send({ t: 'start' })}
                onLeave={() => send({ t: 'leave' })}
                soloHint={t('mini.soloHint')}
                settings={
                    <AnswerTimePicker
                        value={state.answer_seconds ?? 0}
                        options={
                            state.answer_times ?? [0, 10, 15, 20, 30, 45, 60]
                        }
                        disabled={!isHost}
                        onChange={(seconds) =>
                            send({ t: 'answer_time', seconds })
                        }
                    />
                }
            />
        );
    } else {
        const question = state.question;
        const reveal = state.step === 'reveal' ? state.reveal : undefined;
        const remaining = Math.max(
            0,
            (question?.remaining_ms ?? 0) -
                (state.step === 'question' ? since : 0),
        );
        const roundMs = question?.round_ms ?? 1;
        const countdown = Math.max(0, (state.countdown_ms ?? 0) - since);
        const winner =
            state.phase === 'done' && (state.winner ?? -1) >= 0
                ? players[state.winner ?? -1]
                : undefined;
        const solo = players.length === 1;

        body = (
            <div
                className="grid gap-5 lg:grid-cols-12"
                data-testid="mini-board"
                data-step={state.step ?? state.phase}
            >
                <section
                    className="flex min-h-[22rem] flex-col gap-4 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[5px_5px_0px_#1f2a44] sm:p-6 lg:col-span-8"
                    data-testid="mini-arena"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <ConnectionBadge status={connection.status} />
                            <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                                PIN {state.pin}
                            </span>
                        </div>
                        {playing && state.step !== 'countdown' && (
                            <span className="text-sm font-black">
                                {t('mini.round', {
                                    round: Math.min(
                                        (state.round ?? 0) +
                                            (state.step === 'question' ? 1 : 0),
                                        total,
                                    ),
                                    total,
                                })}
                            </span>
                        )}
                    </div>

                    {playing && state.step === 'countdown' && (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2">
                            <p className="font-bold">{t('mini.countdown')}</p>
                            <span
                                className="font-display text-7xl font-black tabular-nums"
                                style={{ color: theme.accent }}
                                aria-live="polite"
                            >
                                {Math.max(1, Math.ceil(countdown / 1000))}
                            </span>
                        </div>
                    )}

                    {playing && question && state.step !== 'countdown' && (
                        <>
                            <div
                                className="h-2.5 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-[#eef5f7]"
                                aria-hidden="true"
                            >
                                <div
                                    className="h-full transition-[width] duration-200 ease-linear"
                                    style={{
                                        width: `${state.step === 'question' ? (remaining / roundMs) * 100 : 0}%`,
                                        background:
                                            remaining < 5000
                                                ? '#ff6584'
                                                : theme.accent,
                                    }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                                <span>
                                    +{question.worth}{' '}
                                    <Coins className="inline size-3.5" />
                                </span>
                                {state.step === 'question' && (
                                    <span className="tabular-nums">
                                        {t('mini.timeLeft', {
                                            seconds: Math.ceil(
                                                remaining / 1000,
                                            ),
                                        })}
                                    </span>
                                )}
                            </div>
                            <Illustration
                                visual={question.visual}
                                accent={theme.accent}
                                soft={theme.soft}
                            />
                            <h2
                                className="text-center font-display text-xl leading-snug font-black sm:text-2xl"
                                data-testid="mini-question"
                            >
                                {question.text}
                            </h2>
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                                {question.options.map((text, index) => {
                                    const chosen = question.choice === index;
                                    const isAnswer = reveal?.answer === index;
                                    const wrongPick =
                                        reveal !== undefined &&
                                        chosen &&
                                        !isAnswer;
                                    const locked =
                                        state.step !== 'question' ||
                                        question.choice >= 0 ||
                                        !online;
                                    return (
                                        <button
                                            key={`${question.id}-${index}`}
                                            type="button"
                                            onClick={() =>
                                                send({
                                                    t: 'answer',
                                                    option: index,
                                                })
                                            }
                                            disabled={locked}
                                            data-testid={`mini-option-${index}`}
                                            aria-label={t('mini.answerLabel', {
                                                letter: LETTERS[index],
                                                text,
                                            })}
                                            className={cn(
                                                'flex min-h-14 items-center gap-3 rounded-2xl border-2 border-[#1f2a44] px-4 py-3 text-left font-bold transition-transform',
                                                OPTION_COLORS[index],
                                                !locked &&
                                                    'hover:-translate-y-0.5 active:translate-y-0',
                                                chosen &&
                                                    state.step === 'question' &&
                                                    'ring-4 ring-[#1f2a44]/30',
                                                isAnswer &&
                                                    'bg-[#00c9a7] text-white',
                                                wrongPick &&
                                                    'bg-[#ff6584] text-white',
                                                locked &&
                                                    !chosen &&
                                                    !isAnswer &&
                                                    'opacity-60',
                                            )}
                                        >
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-current bg-white/70 text-sm text-[#1f2a44]">
                                                {isAnswer ? (
                                                    <Check className="size-4" />
                                                ) : wrongPick ? (
                                                    <X className="size-4" />
                                                ) : (
                                                    LETTERS[index]
                                                )}
                                            </span>
                                            <span className="min-w-0 break-words">
                                                {text}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p
                                className="min-h-10 rounded-xl bg-[#eef5f7] px-3 py-2 text-center text-sm font-bold"
                                aria-live="polite"
                                data-testid="mini-status"
                            >
                                {reveal
                                    ? `${
                                          question.choice < 0
                                              ? t('mini.timeout')
                                              : question.choice ===
                                                  reveal.answer
                                                ? t('mini.correct', {
                                                      score: reveal.gained,
                                                  })
                                                : t('mini.wrong')
                                      } ${t('mini.answer', { answer: question.options[reveal.answer] })}${reveal.hint ? ` • ${reveal.hint}` : ''}`
                                    : question.choice >= 0
                                      ? t('mini.waiting')
                                      : t('mini.thinking')}
                            </p>
                        </>
                    )}

                    {error && <RoomError code={error} />}

                    {playing && (
                        <RoomLeaveControl
                            isHost={isHost}
                            onLeave={() => send({ t: 'leave' })}
                            onStop={() => send({ t: 'stop' })}
                            testId="mini-leave"
                        />
                    )}

                    {state.phase === 'done' && (
                        <div
                            className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl p-4 text-center"
                            style={{ background: theme.soft }}
                            data-testid="mini-result"
                            data-won={state.result?.won ? 'true' : 'false'}
                        >
                            <Trophy
                                className="size-14"
                                style={{ color: theme.accent }}
                            />
                            {state.stopped && (
                                <p
                                    className="rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-xs font-black"
                                    data-testid="room-stopped"
                                >
                                    {t('room.hostExit.stopped')}
                                </p>
                            )}
                            <h2 className="font-display text-2xl font-black">
                                {state.result?.won
                                    ? solo
                                        ? t('mini.result.pass')
                                        : t('mini.result.win')
                                    : winner
                                      ? t('mini.result.winner', {
                                            name: winner.name,
                                        })
                                      : solo
                                        ? t('mini.result.tryAgain')
                                        : t('mini.result.draw')}
                            </h2>
                            {state.result && (
                                <>
                                    <p className="text-sm font-bold text-slate-700">
                                        {t('mini.result.summary', {
                                            correct: state.result.correct,
                                            wrong: state.result.wrong,
                                            score: state.result.score,
                                        })}
                                    </p>
                                    <p
                                        className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-sm font-black"
                                        data-testid="mini-points"
                                    >
                                        <Coins className="size-4" />
                                        {t('mini.result.earned', {
                                            points: state.result.points,
                                        })}
                                    </p>
                                </>
                            )}
                            <div className="flex flex-col justify-center gap-2 sm:flex-row">
                                {isHost ? (
                                    <Button
                                        onClick={() => send({ t: 'start' })}
                                        disabled={!online}
                                        data-testid="mini-again"
                                        className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                                    >
                                        {t('mini.result.again')}
                                    </Button>
                                ) : (
                                    <p className="text-xs font-bold text-slate-700">
                                        {t('mini.result.waitingHost')}
                                    </p>
                                )}
                                <Button
                                    variant="outline"
                                    onClick={() => send({ t: 'leave' })}
                                    className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white font-black"
                                >
                                    <DoorOpen className="size-4" />
                                    {t('mini.result.leave')}
                                </Button>
                            </div>
                            <AdSlot
                                placement="arena.result"
                                className="w-full max-w-md"
                            />
                        </div>
                    )}
                </section>
                <aside className="flex flex-col gap-4 lg:col-span-4">
                    <AdSlot placement="arena.sidebar" />
                    <Scoreboard
                        players={players}
                        you={state.you}
                        total={total}
                    />
                </aside>
            </div>
        );
    }

    return (
        <div
            className="min-h-dvh text-[#1f2a44]"
            style={{ background: theme.bg }}
            data-testid="mini-game"
            data-game={game}
        >
            <Head title={`${title} — EduFunHub`} />
            <header
                className="sticky top-0 z-30 border-b-4 border-[#1f2a44]"
                style={{ background: theme.bg }}
            >
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('nav.backToPortal')}
                            iconOnly
                        />
                        <BrandLink variant="mark" />
                        <span
                            className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid"
                            style={{ background: theme.accent }}
                        >
                            <GameBadgeIcon icon={theme.icon} />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black sm:text-2xl">
                                {title}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t(`mini.games.${game}.tagline`)}
                            </span>
                        </div>
                        <DigitalClock className="edu-clock--game" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <span
                            className="hidden min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#ffd93d] px-3 text-sm font-black sm:inline-flex"
                            data-testid="mini-total-points"
                        >
                            <Coins className="size-4" />
                            {t('mini.points', { count: points + earned })}
                        </span>
                        <button
                            type="button"
                            onClick={toggleMuted}
                            aria-pressed={!muted}
                            aria-label={
                                muted
                                    ? t('snakes.sound.off')
                                    : t('snakes.sound.on')
                            }
                            className="edu-nav-btn edu-nav-btn--icon"
                        >
                            {muted ? (
                                <VolumeX aria-hidden="true" />
                            ) : (
                                <Volume2 aria-hidden="true" />
                            )}
                        </button>
                        <SiteNav compact />
                    </div>
                </div>
            </header>
            <main className="mx-auto flex flex-col gap-4 px-3 py-5 sm:px-6 lg:px-8">
                <GameAdStrip />
                {body}
            </main>
            <GameFinale
                game={game}
                done={state?.phase === 'done'}
                matchKey={state?.pin}
                won={state?.result?.won ?? false}
                points={state?.result?.points}
                title={
                    state?.phase === 'done' &&
                    !state.result?.won &&
                    players.length > 1
                        ? (state.winner ?? -1) >= 0
                            ? t('finale.winner', {
                                  name: players[state.winner ?? -1]?.name,
                              })
                            : t('finale.draw')
                        : undefined
                }
                standings={
                    players.length > 1
                        ? rankStandings(
                              players.filter((p) => !p.left),
                              (p) => p.score,
                              (p, rank) => ({
                                  key: p.seat,
                                  name: p.name,
                                  rank,
                                  score: p.score,
                                  detail: t('finale.correctWrong', {
                                      correct: p.correct,
                                      wrong: (p.history ?? []).filter(
                                          (ok) => !ok,
                                      ).length,
                                  }),
                                  character: p.character,
                                  seat: p.seat,
                                  userId: p.user_id,
                                  isYou: p.seat === state?.you,
                              }),
                          )
                        : []
                }
                onPlayAgain={isHost ? () => send({ t: 'start' }) : undefined}
            />
        </div>
    );
}
