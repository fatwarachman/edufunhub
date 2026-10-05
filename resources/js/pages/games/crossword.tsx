import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
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
import {
    type CrosswordLevel,
    type CrosswordState,
    type CrosswordWord,
    useCrosswordConnection,
} from '@/hooks/use-crossword-connection';
import { useGameAudio } from '@/hooks/use-game-audio';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { cn } from '@/lib/utils';
import { Head } from '@inertiajs/react';
import {
    Check,
    Coins,
    DoorOpen,
    Lightbulb,
    Timer,
    Trophy,
    Volume2,
    VolumeX,
    WifiOff,
} from 'lucide-react';
import {
    type FormEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

interface CrosswordProps {
    player: { name: string; grade: number | null };
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

interface Received extends CrosswordState {
    receivedAt: number;
}

const SEAT_COLORS = ['#ffd6e0', '#bceaf2', '#e3dbf9', '#c9f5e5'];

function useNow(active: boolean): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) {
            return;
        }
        const id = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(id);
    }, [active]);
    return now;
}

function formatClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function wordCells(word: CrosswordWord): [number, number][] {
    return Array.from({ length: word.length }, (_, i) =>
        word.dir === 'across'
            ? [word.row, word.col + i]
            : [word.row + i, word.col],
    );
}

/** Level picker shared by the entry screen and the host's lobby. */
function LevelPicker({
    levels,
    value,
    onChange,
    disabled,
}: {
    levels: CrosswordLevel[];
    value: number;
    onChange: (level: number) => void;
    disabled?: boolean;
}) {
    const { t } = useTranslations();
    return (
        <fieldset className="text-left" data-testid="crossword-levels">
            <legend className="mb-2 text-xs font-black text-slate-500 uppercase">
                {t('crossword.level.label')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
                {levels.map((level) => (
                    <button
                        key={level.level}
                        type="button"
                        disabled={disabled}
                        aria-pressed={value === level.level}
                        onClick={() => onChange(level.level)}
                        data-testid={`crossword-level-${level.level}`}
                        className={cn(
                            'flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-2xl border-2 border-[#1f2a44] px-3.5 py-2 text-left transition-colors disabled:cursor-default',
                            value === level.level
                                ? 'bg-[#0ea5e9] text-white shadow-[3px_3px_0px_#1f2a44]'
                                : 'bg-white text-[#1f2a44] enabled:hover:bg-[#e0f2fe]',
                        )}
                    >
                        <span className="font-display text-base font-black">
                            {t('crossword.level.name', {
                                level: level.level,
                            })}{' '}
                            · {t(`crossword.level.${level.level}`)}
                        </span>
                        <span className="text-xs font-bold opacity-80">
                            {t('crossword.level.detail', {
                                words: level.words,
                                size: level.size,
                                minutes: level.minutes,
                            })}
                        </span>
                    </button>
                ))}
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">
                {t('crossword.levelHint')}
            </p>
        </fieldset>
    );
}

export default function Crossword({
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
}: CrosswordProps) {
    const { t, i18n } = useTranslations();
    const backHref = useGameBackHref();
    const { play, muted, toggleMuted } = useGameAudio();
    const [state, setState] = useState<Received | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [level, setLevel] = useState(1);
    const [selected, setSelected] = useState<number | null>(null);
    const [draft, setDraft] = useState('');
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
    const [earned, setEarned] = useState(0);
    const pending = useRef<number | null>(null);
    const solvedBefore = useRef<Set<number>>(new Set());
    const lastDone = useRef<string | null>(null);
    const input = useRef<HTMLInputElement | null>(null);
    const playRef = useRef(play);
    useEffect(() => {
        playRef.current = play;
    }, [play]);

    const onState = useCallback((next: CrosswordState) => {
        setError(null);
        setState({ ...next, receivedAt: Date.now() });
        const solved = new Set(
            (next.words ?? [])
                .filter((w) => w.solved_by >= 0)
                .map((w) => w.index),
        );
        const fresh = [...solved].filter((i) => !solvedBefore.current.has(i));
        if (fresh.length && solvedBefore.current.size + fresh.length > 0) {
            if (pending.current !== null && fresh.includes(pending.current)) {
                setFeedback('correct');
                setDraft('');
            }
            playRef.current('correct');
        } else if (pending.current !== null) {
            const target = next.words?.[pending.current];
            if (target && target.solved_by < 0) {
                setFeedback('wrong');
                playRef.current('wrong');
            }
        }
        pending.current = null;
        solvedBefore.current = solved;
    }, []);
    const onError = useCallback((code: string) => {
        pending.current = null;
        setError(code);
    }, []);

    const connection = useCrosswordConnection(
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
        {
            muted,
            won: state?.phase === 'done' && state.winner === state.you,
        },
    );
    const now = useNow(playing);
    const remaining = state
        ? (state.remaining_ms ?? 0) - (playing ? now - state.receivedAt : 0)
        : 0;

    useEffect(() => {
        if (
            state?.phase !== 'done' ||
            !state.pin ||
            state.points === undefined
        ) {
            return;
        }
        const key = `${state.pin}-${state.seq}`;
        if (lastDone.current === key) {
            return;
        }
        lastDone.current = key;
        setEarned((value) => value + (state.points ?? 0));
    }, [state]);

    const words = useMemo(() => state?.words ?? [], [state?.words]);
    const cellWords = useMemo(() => {
        const map = new Map<string, number[]>();
        for (const w of words) {
            for (const [r, c] of wordCells(w)) {
                const key = `${r}-${c}`;
                map.set(key, [...(map.get(key) ?? []), w.index]);
            }
        }
        return map;
    }, [words]);
    const numbers = useMemo(() => {
        const map = new Map<string, number>();
        for (const w of words) {
            map.set(`${w.row}-${w.col}`, w.number);
        }
        return map;
    }, [words]);

    const current = selected !== null ? words[selected] : undefined;
    const activeCells = useMemo(
        () =>
            new Set(
                current ? wordCells(current).map(([r, c]) => `${r}-${c}`) : [],
            ),
        [current],
    );
    const players = state?.players ?? [];
    const me = players[state?.you ?? -1];

    const pick = (index: number) => {
        setSelected(index);
        setDraft('');
        setFeedback(null);
        setError(null);
        requestAnimationFrame(() => input.current?.focus());
    };
    const pickCell = (r: number, c: number) => {
        const owners = cellWords.get(`${r}-${c}`) ?? [];
        if (!owners.length) {
            return;
        }
        const open = owners.filter((i) => words[i].solved_by < 0);
        const pool = open.length ? open : owners;
        const next =
            selected !== null && pool.includes(selected) && pool.length > 1
                ? pool[(pool.indexOf(selected) + 1) % pool.length]
                : pool[0];
        pick(next);
    };
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!current || draft.length !== current.length) {
            setError('wrong_length');
            return;
        }
        setFeedback(null);
        pending.current = current.index;
        send({ t: 'guess', word: current.index, value: draft });
    };

    const letterAt = (r: number, c: number): string => {
        const cell = state?.grid?.cells[r]?.[c];
        if (cell?.letter) {
            return cell.letter;
        }
        if (state?.phase === 'done' && state.answers) {
            for (const i of cellWords.get(`${r}-${c}`) ?? []) {
                const w = words[i];
                const offset = w.dir === 'across' ? c - w.col : r - w.row;
                return state.answers[i]?.[offset] ?? '';
            }
        }
        if (current && activeCells.has(`${r}-${c}`)) {
            const offset =
                current.dir === 'across' ? c - current.col : r - current.row;
            return draft[offset] ?? '';
        }
        return '';
    };
    const ownerColor = (r: number, c: number): string | undefined => {
        for (const i of cellWords.get(`${r}-${c}`) ?? []) {
            const by = words[i].solved_by;
            if (by >= 0) {
                return SEAT_COLORS[by % SEAT_COLORS.length];
            }
        }
        return undefined;
    };

    const levels = state?.levels ?? [];
    const room = state as unknown as RoomPayload;
    const isHost = state?.host === state?.you;
    const solvedCount = words.filter((w) => w.solved_by >= 0).length;

    let body;
    if (!serviceReady || connection.status === 'offline') {
        body = (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-8 text-center font-bold shadow-[5px_5px_0px_#1f2a44]">
                <WifiOff className="size-10" />
                {t('duel.idle.unavailable')}
            </div>
        );
    } else if (!state || state.phase === 'none' || !state.pin) {
        body = (
            <RoomEntry
                status={connection.status}
                error={error}
                intro={t('crossword.intro', { name: player.name })}
                createLabel={t('room.create')}
                onCreate={() => send({ t: 'create', level })}
                onJoin={(code) => send({ t: 'join', pin: code })}
            >
                {levels.length > 0 && (
                    <LevelPicker
                        levels={levels}
                        value={level}
                        onChange={setLevel}
                    />
                )}
            </RoomEntry>
        );
    } else if (state.phase === 'lobby') {
        body = (
            <RoomLobby
                game="crossword"
                title={t('crossword.title')}
                room={room}
                status={connection.status}
                error={error}
                onStart={() => send({ t: 'start' })}
                onLeave={() => send({ t: 'leave' })}
                soloHint={t('crossword.soloHint')}
                settings={
                    <LevelPicker
                        levels={levels}
                        value={state.level ?? 1}
                        disabled={!isHost}
                        onChange={(value) => send({ t: 'level', level: value })}
                    />
                }
            />
        );
    } else {
        const grid = state.grid;
        const winner =
            state.phase === 'done' && (state.winner ?? -1) >= 0
                ? players[state.winner ?? -1]
                : undefined;
        body = (
            <div
                className="grid gap-6 lg:grid-cols-12"
                data-testid="crossword-board"
            >
                <div className="flex flex-col gap-4 lg:col-span-7">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border-3 border-[#1f2a44] bg-white p-3 shadow-[4px_4px_0px_#1f2a44]">
                        <div className="flex flex-wrap items-center gap-2">
                            <ConnectionBadge status={connection.status} />
                            <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                                PIN {state.pin}
                            </span>
                            <span className="rounded-xl border-2 border-[#1f2a44] bg-[#e0f2fe] px-3 py-1.5 text-xs font-black">
                                {t('crossword.level.name', {
                                    level: state.level,
                                })}
                            </span>
                        </div>
                        <span
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 py-1.5 font-display text-sm font-black tabular-nums',
                                playing && remaining < 60000
                                    ? 'bg-[#ffe1e1]'
                                    : 'bg-white',
                            )}
                            aria-label={t('crossword.timeLeft')}
                            data-testid="crossword-clock"
                        >
                            <Timer className="size-4" />
                            {formatClock(remaining)}
                        </span>
                    </div>

                    {grid && (
                        <div className="overflow-x-auto rounded-3xl border-3 border-[#1f2a44] bg-[#1f2a44] p-2 shadow-[5px_5px_0px_#1f2a44]">
                            <div
                                className="mx-auto grid w-full gap-0.5"
                                style={{
                                    gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
                                    maxWidth: `${grid.cols * 3.25}rem`,
                                    minWidth: `${grid.cols * 1.9}rem`,
                                }}
                                data-testid="crossword-grid"
                            >
                                {grid.cells.flatMap((row, r) =>
                                    row.map((cell, c) => {
                                        if (!cell) {
                                            return (
                                                <span
                                                    key={`${r}-${c}`}
                                                    className="aspect-square"
                                                    aria-hidden="true"
                                                />
                                            );
                                        }
                                        const key = `${r}-${c}`;
                                        const number = numbers.get(key);
                                        const letter = letterAt(r, c);
                                        const color = ownerColor(r, c);
                                        const active = activeCells.has(key);
                                        const revealed =
                                            state.phase === 'done' &&
                                            !color &&
                                            letter !== '';
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => pickCell(r, c)}
                                                disabled={!playing}
                                                data-testid={`crossword-cell-${key}`}
                                                data-revealed={
                                                    revealed || undefined
                                                }
                                                aria-label={
                                                    letter
                                                        ? letter
                                                        : t(
                                                              'crossword.pickWord',
                                                          )
                                                }
                                                className={cn(
                                                    'relative grid aspect-square place-items-center rounded-[4px] font-display text-[clamp(0.8rem,3.2vw,1.35rem)] leading-none font-black text-[#1f2a44] uppercase transition-colors',
                                                    active
                                                        ? 'bg-[#ffd93d]'
                                                        : color
                                                          ? ''
                                                          : revealed
                                                            ? 'bg-[#ffe1e1] text-[#c0392b]'
                                                            : 'bg-white',
                                                    playing &&
                                                        'cursor-pointer hover:brightness-95',
                                                )}
                                                style={
                                                    !active && color
                                                        ? {
                                                              backgroundColor:
                                                                  color,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {number && (
                                                    <span className="absolute top-0.5 left-0.5 text-[clamp(0.45rem,1.6vw,0.65rem)] leading-none font-bold">
                                                        {number}
                                                    </span>
                                                )}
                                                {letter}
                                            </button>
                                        );
                                    }),
                                )}
                            </div>
                        </div>
                    )}

                    {playing && (
                        <form
                            onSubmit={submit}
                            className="rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]"
                            data-testid="crossword-answer"
                        >
                            {current ? (
                                <>
                                    <p className="text-sm font-black text-[#1f2a44]">
                                        {current.number}{' '}
                                        {t(`crossword.${current.dir}`)} ·{' '}
                                        <span className="font-bold text-slate-700">
                                            {current.clue}
                                        </span>
                                    </p>
                                    {current.solved_by >= 0 ? (
                                        <p className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-[#00695C]">
                                            <Check className="size-4" />
                                            {t('crossword.solvedBy', {
                                                name:
                                                    players[current.solved_by]
                                                        ?.name ?? '',
                                            })}
                                        </p>
                                    ) : (
                                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                            <input
                                                ref={input}
                                                value={draft}
                                                onChange={(event) => {
                                                    setFeedback(null);
                                                    setDraft(
                                                        event.target.value
                                                            .toUpperCase()
                                                            .replace(
                                                                /[^A-Z]/g,
                                                                '',
                                                            )
                                                            .slice(
                                                                0,
                                                                current.length,
                                                            ),
                                                    );
                                                }}
                                                autoComplete="off"
                                                autoCapitalize="characters"
                                                spellCheck={false}
                                                aria-label={t(
                                                    'crossword.answerLabel',
                                                    {
                                                        number: current.number,
                                                        dir: t(
                                                            `crossword.${current.dir}`,
                                                        ),
                                                    },
                                                )}
                                                placeholder={t(
                                                    'crossword.answerPlaceholder',
                                                    { length: current.length },
                                                )}
                                                data-testid="crossword-input"
                                                className="min-h-12 flex-1 rounded-xl border-2 border-[#1f2a44] bg-white px-3.5 font-display text-lg tracking-[0.2em] uppercase outline-none focus-visible:ring-4 focus-visible:ring-[#0ea5e9]/40"
                                            />
                                            <Button
                                                type="submit"
                                                disabled={
                                                    !online ||
                                                    draft.length !==
                                                        current.length
                                                }
                                                data-testid="crossword-submit"
                                                className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-[#0ea5e9] px-6 font-display font-black text-white shadow-[3px_3px_0px_#1f2a44] disabled:opacity-50"
                                            >
                                                {t('crossword.submit')}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={
                                                    !online ||
                                                    (me?.hints ?? 0) <= 0
                                                }
                                                onClick={() =>
                                                    send({
                                                        t: 'hint',
                                                        word: current.index,
                                                    })
                                                }
                                                title={t('crossword.hintCost')}
                                                data-testid="crossword-hint"
                                                className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-white font-black"
                                            >
                                                <Lightbulb className="size-4" />
                                                {t('crossword.hint', {
                                                    count: me?.hints ?? 0,
                                                })}
                                            </Button>
                                        </div>
                                    )}
                                    {feedback && (
                                        <p
                                            role="status"
                                            className={cn(
                                                'mt-2 text-sm font-black',
                                                feedback === 'correct'
                                                    ? 'text-[#00695C]'
                                                    : 'text-[#AD1457]',
                                            )}
                                            data-testid="crossword-feedback"
                                            data-result={feedback}
                                        >
                                            {t(`crossword.${feedback}`)}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm font-bold text-slate-600">
                                    {t('crossword.pickWord')}
                                </p>
                            )}
                            {error && (
                                <div className="mt-3">
                                    <RoomError code={error} />
                                </div>
                            )}
                        </form>
                    )}

                    {playing && (
                        <Button
                            variant="ghost"
                            onClick={() => send({ t: 'leave' })}
                            data-testid="crossword-leave"
                            className="min-h-11 self-center text-xs font-bold text-slate-600"
                        >
                            <DoorOpen className="size-4" />
                            {t('room.leave')}
                        </Button>
                    )}

                    {state.phase === 'done' && (
                        <div
                            className="rounded-3xl border-3 border-[#1f2a44] bg-[#FFF176] p-6 text-center shadow-[5px_5px_0px_#1f2a44]"
                            data-testid="crossword-result"
                            data-reason={state.reason}
                        >
                            <Trophy className="mx-auto size-14 text-[#FF9E44]" />
                            <h2 className="mt-2 font-display text-2xl font-black">
                                {winner
                                    ? winner.seat === state.you
                                        ? t('crossword.result.win')
                                        : t('crossword.result.winner', {
                                              name: winner.name,
                                          })
                                    : state.draw
                                      ? t('crossword.result.draw')
                                      : t(`crossword.result.${state.reason}`)}
                            </h2>
                            {state.reason === 'time' &&
                                (state.unsolved ?? 0) > 0 && (
                                    <p
                                        className="mx-auto mt-2 max-w-md rounded-xl border-2 border-[#1f2a44] bg-white/80 px-3 py-2 text-sm font-bold text-[#1f2a44]"
                                        data-testid="crossword-time-up"
                                    >
                                        {t('crossword.result.timeUp', {
                                            count: state.unsolved,
                                        })}
                                    </p>
                                )}
                            {me && (
                                <p className="mt-1 text-sm font-bold text-slate-700">
                                    {t('crossword.result.summary', {
                                        solved: me.solved,
                                        score: me.score,
                                    })}
                                </p>
                            )}
                            {state.points !== undefined && (
                                <p
                                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-sm font-black"
                                    data-testid="crossword-points"
                                >
                                    <Coins className="size-4" />
                                    {t('room.points', {
                                        points: state.points,
                                    })}
                                </p>
                            )}
                            <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                                {isHost ? (
                                    <Button
                                        onClick={() => send({ t: 'start' })}
                                        data-testid="crossword-again"
                                        className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                                    >
                                        {t('crossword.result.again')}
                                    </Button>
                                ) : (
                                    <p className="text-xs font-bold text-slate-700">
                                        {t('crossword.result.waitingHost')}
                                    </p>
                                )}
                                <Button
                                    variant="outline"
                                    onClick={() => send({ t: 'leave' })}
                                    className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white font-black"
                                >
                                    <DoorOpen className="size-4" />
                                    {t('crossword.result.leave')}
                                </Button>
                            </div>
                        </div>
                    )}
                    {state.phase === 'done' && (
                        <AdSlot placement="arena.result" />
                    )}
                </div>

                <div className="flex flex-col gap-4 lg:col-span-5">
                    <AdSlot placement="arena.sidebar" />
                    <div className="rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-slate-500 uppercase">
                                {t('crossword.playing')}
                            </span>
                            <span className="text-xs font-black">
                                {t('crossword.words', {
                                    solved: solvedCount,
                                    total: words.length,
                                })}
                            </span>
                        </div>
                        <ul
                            className="mt-2 flex flex-col gap-2"
                            data-testid="crossword-players"
                        >
                            {players.map((p) => (
                                <li
                                    key={p.seat}
                                    className={cn(
                                        'flex items-center gap-2.5 rounded-2xl border-2 border-[#1f2a44] p-2',
                                        (p.left || !p.online) && 'opacity-60',
                                    )}
                                    style={{
                                        backgroundColor:
                                            SEAT_COLORS[
                                                p.seat % SEAT_COLORS.length
                                            ],
                                    }}
                                >
                                    <div className="size-10 shrink-0">
                                        <PlayerAvatar
                                            character={p.character}
                                            seat={p.seat}
                                        />
                                    </div>
                                    <span className="min-w-0 flex-1 truncate text-sm font-black">
                                        {p.name}
                                        {p.seat === state.you &&
                                            ` (${t('room.you')})`}
                                    </span>
                                    <span className="rounded-lg border border-[#1f2a44] bg-white px-2 py-0.5 text-xs font-black tabular-nums">
                                        {t('crossword.score', {
                                            score: p.score,
                                        })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {(['across', 'down'] as const).map((dir) => {
                        const list = words.filter((w) => w.dir === dir);
                        if (!list.length) {
                            return null;
                        }
                        return (
                            <section
                                key={dir}
                                className="rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]"
                                aria-labelledby={`clues-${dir}`}
                            >
                                <h3
                                    id={`clues-${dir}`}
                                    className="font-display text-lg font-black"
                                >
                                    {t(`crossword.${dir}`)}
                                </h3>
                                <ol
                                    className="mt-2 flex flex-col gap-1"
                                    data-testid={`crossword-clues-${dir}`}
                                >
                                    {list.map((w) => (
                                        <li key={w.index}>
                                            <button
                                                type="button"
                                                onClick={() => pick(w.index)}
                                                disabled={!playing}
                                                data-testid={`crossword-clue-${w.index}`}
                                                className={cn(
                                                    'flex min-h-11 w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                                                    selected === w.index
                                                        ? 'bg-[#ffd93d]'
                                                        : 'enabled:hover:bg-[#FFFDE6]',
                                                    w.solved_by >= 0 &&
                                                        'text-slate-500 line-through decoration-2',
                                                )}
                                            >
                                                <span className="w-6 shrink-0 font-black">
                                                    {w.number}
                                                </span>
                                                <span className="flex-1 font-semibold">
                                                    {w.clue}{' '}
                                                    <span className="text-xs text-slate-500">
                                                        ({w.length})
                                                    </span>
                                                </span>
                                                {w.solved_by >= 0 && (
                                                    <span
                                                        className="mt-1 size-3 shrink-0 rounded-full border border-[#1f2a44]"
                                                        style={{
                                                            backgroundColor:
                                                                SEAT_COLORS[
                                                                    w.solved_by %
                                                                        SEAT_COLORS.length
                                                                ],
                                                        }}
                                                        aria-label={t(
                                                            'crossword.solvedBy',
                                                            {
                                                                name:
                                                                    players[
                                                                        w
                                                                            .solved_by
                                                                    ]?.name ??
                                                                    '',
                                                            },
                                                        )}
                                                    />
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-[#f0f9ff] text-[#1f2a44]">
            <Head title={`${t('crossword.title')} — EduFunHub`}>
                <meta name="description" content={t('crossword.meta')} />
            </Head>
            <header className="sticky top-0 z-30 border-b-4 border-[#1f2a44] bg-[#f0f9ff]/95 backdrop-blur-md">
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('nav.backToPortal')}
                            iconOnly
                        />
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate font-display text-lg font-black sm:text-2xl">
                                {t('crossword.title')}
                            </span>
                            <span className="hidden text-xs font-bold text-slate-600 sm:block">
                                {t('crossword.tagline')}
                            </span>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <span
                            className="hidden min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#ffd93d] px-3 text-sm font-black sm:inline-flex"
                            data-testid="crossword-total-points"
                        >
                            <Coins className="size-4" />
                            {t('crossword.points', { count: points + earned })}
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
        </div>
    );
}
