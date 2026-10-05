import AdSlot from '@/components/ads/ad-slot';
import {
    ConnectionBadge,
    RoomEntry,
    RoomError,
} from '@/components/multiplayer/room';
import {
    clock,
    formatScore,
    LanTester,
    PacketValidator,
    Panel,
    Piece,
    Podium,
    POWER_STYLE,
    type TesterResult,
    useNow,
    useRemaining,
} from '@/components/order-rush/shared';
import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import {
    type PowerUp,
    type RushState,
    type SequenceQuestion,
    type useOrderRush,
} from '@/hooks/use-order-rush';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    Coins,
    DoorOpen,
    Flame,
    FlaskConical,
    Shield,
    Timer,
    Trophy,
    Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type Status = ReturnType<typeof useOrderRush>['status'];
type Act = (msg: Record<string, unknown>) => boolean;

const AUTO_SUBMIT_KEY = 'order-rush.auto-submit';

/** Wall clock for event handlers (never called during render). */
function timestamp(): number {
    return Date.now();
}

/** Student controller: status bar, numbered slots, piece pool, validator. */
export function PlayerScreen({
    state,
    status,
    error,
    online,
    name,
    character,
    act,
    onJoin,
    onHost,
}: {
    state: RushState;
    status: Status;
    error: string | null;
    online: boolean;
    name: string;
    character: CharacterLook | null;
    act: Act;
    onJoin: (pin: string) => void;
    onHost: () => void;
}) {
    const { t } = useTranslations();

    if (state.phase === 'NONE' || !state.pin) {
        return (
            <RoomEntry
                status={status}
                error={error}
                intro={t('orderRush.playerIntro', { name })}
                createLabel={t('orderRush.openHost')}
                onCreate={onHost}
                onJoin={onJoin}
            >
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('orderRush.roomClosed')}
                    </p>
                )}
            </RoomEntry>
        );
    }

    const you = state.you;
    const look = you?.character ?? character;
    const leave = (
        <Button
            variant="ghost"
            onClick={() => act({ t: 'leave_room' })}
            data-testid="or-leave"
            className="min-h-11 self-center rounded-xl border-2 border-[#1f2a44]/20 bg-white/70 px-4 text-xs font-bold text-slate-700"
        >
            <DoorOpen className="size-4" />
            {t('orderRush.leave')}
        </Button>
    );

    if (state.phase === 'LOBBY') {
        return (
            <Panel className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <ConnectionBadge status={status} />
                    <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                        PIN {state.pin}
                    </span>
                </div>
                <span className="size-24" data-testid="or-lobby-avatar">
                    <PlayerAvatar character={look} seat={you?.user_id ?? 0} />
                </span>
                <p
                    className="font-display text-xl font-black"
                    data-testid="or-waiting"
                >
                    {t('orderRush.waitingStart')}
                </p>
                <p className="text-sm font-bold text-slate-600">
                    {state.mode === 'RACE'
                        ? t('orderRush.raceLabel', { count: state.modules })
                        : t('orderRush.timeLabel', { count: state.minutes })}
                    {' · '}
                    {t('orderRush.playersCount', {
                        count: state.players.filter((p) => !p.left).length,
                    })}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('orderRush.rules')}
                </p>
                {error && <RoomError code={error} />}
                {leave}
            </Panel>
        );
    }

    if (state.phase === 'GAME_OVER') {
        const result = state.result;
        return (
            <Panel className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
                <Trophy className="size-14 text-[#0f766e]" aria-hidden="true" />
                <h2
                    className="font-display text-2xl font-black"
                    data-testid="or-result"
                >
                    {result?.won
                        ? t('orderRush.youWon')
                        : t('orderRush.yourRank', {
                              rank: result?.rank ?? '–',
                              total: state.ranking?.length ?? 0,
                          })}
                </h2>
                {result && (
                    <div className="flex flex-wrap justify-center gap-2 text-sm font-black">
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-3 py-1">
                            <Coins className="size-4" aria-hidden="true" />
                            {t('orderRush.earned', { points: result.points })}
                        </span>
                        <span className="rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1">
                            {t('orderRush.stats', {
                                modules: result.step,
                                accuracy: result.accuracy,
                                streak: result.best_streak,
                            })}
                        </span>
                    </div>
                )}
                <div className="w-full text-left">
                    <Podium state={state} />
                </div>
                <p className="text-xs font-bold text-slate-600">
                    {t('orderRush.waitingHost')}
                </p>
                <AdSlot placement="arena.result" className="w-full max-w-md" />
                {leave}
            </Panel>
        );
    }

    if (!you?.question) {
        return (
            <Panel className="mx-auto max-w-xl text-center font-bold">
                {t('orderRush.loading')}
            </Panel>
        );
    }

    return (
        <Arena
            key={you.user_id}
            state={state}
            status={status}
            error={error}
            online={online}
            character={look}
            act={act}
            leave={leave}
        />
    );
}

function Arena({
    state,
    status,
    error,
    online,
    character,
    act,
    leave,
}: {
    state: RushState;
    status: Status;
    error: string | null;
    online: boolean;
    character: CharacterLook | null | undefined;
    act: Act;
    leave: React.ReactNode;
}) {
    const { t, i18n } = useTranslations();
    const you = state.you!;
    const question = you.question as SequenceQuestion;
    const v = state.validation;
    const sabotage = state.sabotage;
    const remaining = useRemaining(state);

    // Slots hold piece ids; reset per module.
    const [slots, setSlots] = useState<(string | null)[]>(() =>
        Array(question.total_slots).fill(null),
    );
    const [slotsFor, setSlotsFor] = useState(question.id);
    /** The pending submission: module id and send time. */
    const [sent, setSent] = useState<{ id: string; at: number } | null>(null);
    /** Verdict time the player already reacted to (hides the red slot). */
    const [dismissed, setDismissed] = useState(0);
    const shownAt = useRef(0);
    const [aiming, setAiming] = useState<PowerUp | null>(null);
    const [autoSubmit, setAutoSubmit] = useState(() =>
        typeof window === 'undefined'
            ? false
            : window.localStorage.getItem(AUTO_SUBMIT_KEY) === '1',
    );
    /** Latest slots, updated synchronously so rapid taps never use a stale render. */
    const slotsRef = useRef(slots);
    if (slotsFor !== question.id) {
        const empty = Array(question.total_slots).fill(null);
        setSlotsFor(question.id);
        setSlots(empty);
        setSent(null);
    }
    const writeSlots = (next: (string | null)[]) => {
        slotsRef.current = next;
        setSlots(next);
    };
    useEffect(() => {
        slotsRef.current = slots;
    }, [slots]);
    useEffect(() => {
        shownAt.current = timestamp();
    }, [question.id]);

    const verdict = v && v.question_id === question.id ? v : undefined;
    // Waiting for the referee: no verdict newer than the send and no error
    // (act() clears the error on send, so an error means a rejection).
    const pending =
        sent !== null &&
        sent.id === question.id &&
        error === null &&
        !(verdict && verdict.at >= sent.at);
    const errorSlot =
        !pending && verdict && !verdict.is_correct && verdict.at > dismissed
            ? verdict.error_slot_index
            : null;

    const now = useNow(
        Boolean(sabotage && !sabotage.blocked) || Boolean(v?.is_correct),
        150,
    );
    const frozen =
        sabotage?.type === 'FREEZE' &&
        !sabotage.blocked &&
        sabotage.at + sabotage.duration_ms > now;
    const tangled =
        sabotage?.type === 'TANGLE' &&
        !sabotage.blocked &&
        sabotage.at + sabotage.duration_ms > now;
    const tangleTick = tangled ? Math.floor(now / 450) : 0;

    const byId = useMemo(
        () => new Map(question.pool_items.map((item) => [item.id, item])),
        [question.pool_items],
    );
    const pool = useMemo(() => {
        const free = question.pool_items.filter(
            (item) => !slots.includes(item.id),
        );
        if (!tangled) {
            return free;
        }
        // Kabel kusut: reshuffle the visible pool on every tick, never
        // keeping the order of the previous tick.
        const out = [...free];
        let seed = (tangleTick * 0x9e3779b1) >>> 0;
        const random = () => {
            seed = (seed + 0x6d2b79f5) >>> 0;
            let x = seed;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        if (out.length > 1) {
            const shift = 1 + (tangleTick % (out.length - 1));
            out.push(...out.splice(0, shift));
        }
        return out;
    }, [question.pool_items, slots, tangled, tangleTick]);

    const locked = !online || frozen || pending;
    const full = slots.every((id) => id !== null);

    const submit = (order: (string | null)[]) => {
        if (order.some((id) => id === null) || locked) {
            return;
        }
        const at = timestamp();
        setSent({ id: question.id, at });
        if (
            !act({
                t: 'submit_sequence',
                question_id: question.id,
                submitted_order: order,
                client_duration_ms: at - shownAt.current,
            })
        ) {
            setSent(null);
        }
    };

    const place = (id: string) => {
        const current = slotsRef.current;
        if (locked || current.length !== question.total_slots) {
            return;
        }
        const index = current.indexOf(null);
        if (index < 0 || current.includes(id)) {
            return;
        }
        const next = [...current];
        next[index] = id;
        writeSlots(next);
        setDismissed(v?.at ?? 0);
        if (autoSubmit && next.every((slot) => slot !== null)) {
            submit(next);
        }
    };
    const unplace = (index: number) => {
        const current = slotsRef.current;
        if (locked || current[index] === null || current[index] === undefined) {
            return;
        }
        const next = [...current];
        next[index] = null;
        writeSlots(next);
        setDismissed(v?.at ?? 0);
    };

    // Validator animation follows the latest server verdict.
    let result: TesterResult = 'idle';
    let testerSlot = -1;
    let testerAt = 0;
    if (pending && sent) {
        result = 'running';
        testerAt = sent.at;
    } else if (v) {
        result = v.is_correct ? 'ok' : 'bad';
        testerSlot = v.error_slot_index;
        testerAt = v.at;
    }
    const lastKind = v?.kind ?? question.kind;
    const lastSlots = v?.total_slots ?? question.total_slots;
    const combo =
        v?.is_correct &&
        v.streak > 0 &&
        v.streak % state.combo_every === 0 &&
        now - v.at < 2500;
    const rivals = state.leaderboard.filter(
        (row) => row.user_id !== you.user_id && !row.left,
    );

    const firePower = (power: PowerUp, target?: number) => {
        setAiming(null);
        act({
            t: 'use_powerup',
            powerup_type: power,
            ...(target ? { target_player_id: String(target) } : {}),
        });
    };

    return (
        <div
            className={cn(
                'relative mx-auto flex w-full max-w-xl flex-col gap-3',
                tangled && 'or-tangle rounded-3xl',
            )}
            data-testid="or-arena"
            data-frozen={frozen ? 'true' : 'false'}
            data-tangled={tangled ? 'true' : 'false'}
        >
            {/* Status bar */}
            <div className="flex items-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-white p-2 shadow-[3px_3px_0px_#1f2a44]">
                <span
                    className={cn(
                        'relative size-12 shrink-0 rounded-xl bg-[#ccfbf1]',
                        (frozen || tangled) && 'or-track-avatar',
                    )}
                    data-hit={frozen || tangled ? 'true' : 'false'}
                    data-testid="or-you-avatar"
                >
                    <PlayerAvatar character={character} seat={you.user_id} />
                    {you.shield && (
                        <Shield
                            className="absolute -right-1 -bottom-1 size-5 fill-[#c7d2fe] text-[#4338ca]"
                            aria-label={t('orderRush.shieldOn')}
                        />
                    )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                    <span
                        className="font-display text-xl leading-none font-black tabular-nums"
                        data-testid="or-score"
                    >
                        {formatScore(you.score, i18n.language)}
                    </span>
                    <span className="truncate text-[11px] font-bold text-slate-600">
                        {state.mode === 'RACE'
                            ? t('orderRush.progress', {
                                  step: you.step,
                                  total: state.modules,
                              })
                            : t('orderRush.solved', { count: you.step })}
                    </span>
                </div>
                <span
                    className={cn(
                        'inline-flex min-h-9 items-center gap-1 rounded-xl border-2 border-[#1f2a44] px-2 text-sm font-black tabular-nums',
                        you.streak > 0 ? 'bg-[#fed7aa]' : 'bg-white',
                    )}
                    data-testid="or-streak"
                    aria-label={t('orderRush.streak', { count: you.streak })}
                >
                    <Flame
                        className="size-4 text-[#c2410c]"
                        aria-hidden="true"
                    />
                    {you.streak}
                </span>
                {state.mode === 'TIME_ATTACK' && (
                    <span className="inline-flex min-h-9 items-center gap-1 rounded-xl border-2 border-[#1f2a44] bg-white px-2 text-sm font-black tabular-nums">
                        <Timer className="size-4" aria-hidden="true" />
                        {clock(remaining)}
                    </span>
                )}
                <ConnectionBadge status={status} />
            </div>

            {combo && (
                <div
                    className="or-combo flex items-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#fde047] px-3 py-2 shadow-[3px_3px_0px_#1f2a44]"
                    role="status"
                    data-testid="or-combo"
                >
                    <span className="size-10 shrink-0">
                        <PlayerAvatar
                            character={character}
                            seat={you.user_id}
                        />
                    </span>
                    <span className="font-display text-sm font-black">
                        {t('orderRush.combo', { count: v!.streak })}
                        {v!.powerup_granted && (
                            <>
                                {' '}
                                {t('orderRush.powerGranted', {
                                    power: t(
                                        `orderRush.power.${v!.powerup_granted}`,
                                    ),
                                })}
                            </>
                        )}
                    </span>
                </div>
            )}

            <Panel className="relative flex flex-col gap-3 !p-3 sm:!p-4">
                <div>
                    <h2
                        className="font-display text-lg leading-tight font-black"
                        data-testid="or-question-title"
                    >
                        {question.title}
                    </h2>
                    <p className="text-xs font-bold text-slate-600">
                        {question.description}
                    </p>
                </div>

                {/* Target slots */}
                <ol
                    className={cn(
                        'grid gap-1.5',
                        question.total_slots > 8
                            ? 'grid-cols-4'
                            : question.total_slots > 5
                              ? 'grid-cols-4'
                              : question.total_slots === 3
                                ? 'grid-cols-3'
                                : 'grid-cols-2 sm:grid-cols-5',
                    )}
                    data-testid="or-slots"
                    aria-label={t('orderRush.slotsLabel')}
                >
                    {slots.map((id, index) => {
                        const item = id ? byId.get(id) : undefined;
                        return (
                            <li key={index}>
                                <button
                                    type="button"
                                    onClick={() => unplace(index)}
                                    disabled={!item || locked}
                                    data-testid={`or-slot-${index}`}
                                    data-error={
                                        errorSlot === index ? 'true' : 'false'
                                    }
                                    aria-label={
                                        item
                                            ? t('orderRush.slotFilled', {
                                                  slot: index + 1,
                                                  label: item.label,
                                              })
                                            : t('orderRush.slotEmpty', {
                                                  slot: index + 1,
                                              })
                                    }
                                    className="or-piece or-slot relative flex w-full flex-col items-stretch gap-0.5 rounded-xl border-2 border-dashed border-[#1f2a44]/50 bg-[#f8fafc] p-1 disabled:cursor-default"
                                >
                                    <span className="absolute -top-2 -left-1.5 z-10 grid size-5 place-items-center rounded-full border-2 border-[#1f2a44] bg-white text-[10px] font-black tabular-nums">
                                        {index + 1}
                                    </span>
                                    {item ? (
                                        <Piece
                                            item={item}
                                            kind={question.kind}
                                            size="sm"
                                        />
                                    ) : (
                                        <span className="min-h-9" />
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ol>

                {/* Validator */}
                {lastKind === 'cable' ? (
                    <LanTester
                        slots={lastSlots}
                        result={result}
                        errorSlot={testerSlot}
                        startedAt={testerAt}
                        stepMs={result === 'running' ? 90 : 55}
                    />
                ) : (
                    <PacketValidator
                        labels={slots.map((id) =>
                            id ? (byId.get(id)?.label ?? '') : '',
                        )}
                        result={result}
                        errorSlot={testerSlot}
                        startedAt={testerAt}
                    />
                )}

                {/* Piece pool */}
                <div
                    className={cn(
                        'grid gap-1.5',
                        question.total_slots > 6
                            ? 'grid-cols-3 sm:grid-cols-4'
                            : 'grid-cols-2 sm:grid-cols-3',
                    )}
                    data-testid="or-pool"
                    aria-label={t('orderRush.poolLabel')}
                >
                    {pool.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => place(item.id)}
                            disabled={locked || full}
                            data-testid="or-piece"
                            data-piece={item.id}
                            className="or-piece rounded-xl shadow-[2px_2px_0px_#1f2a44] disabled:opacity-60"
                        >
                            <Piece item={item} kind={question.kind} />
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex min-h-11 items-center gap-2 text-xs font-bold text-slate-700">
                        <input
                            type="checkbox"
                            className="size-4"
                            checked={autoSubmit}
                            onChange={(e) => {
                                setAutoSubmit(e.target.checked);
                                window.localStorage.setItem(
                                    AUTO_SUBMIT_KEY,
                                    e.target.checked ? '1' : '0',
                                );
                            }}
                        />
                        {t('orderRush.autoSubmit')}
                    </label>
                    <Button
                        onClick={() => submit(slots)}
                        disabled={!full || locked}
                        data-testid="or-submit"
                        className="min-h-12 flex-1 rounded-2xl border-3 border-[#1f2a44] bg-[#0f766e] px-5 font-display text-base font-black text-white shadow-[3px_3px_0px_#1f2a44] hover:bg-[#115e59] disabled:opacity-50 sm:flex-none"
                    >
                        <FlaskConical className="size-5" />
                        {t('orderRush.test')}
                    </Button>
                </div>

                {frozen && (
                    <div
                        className="or-freeze absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-3xl text-center"
                        role="alert"
                        data-testid="or-frozen"
                    >
                        <span className="size-16">
                            <PlayerAvatar
                                character={character}
                                seat={you.user_id}
                            />
                        </span>
                        <span className="rounded-xl border-2 border-[#0369a1] bg-white px-3 py-1 font-display text-sm font-black text-[#0c4a6e]">
                            {t('orderRush.frozenBy', {
                                name: sabotage?.attacker_name ?? '',
                            })}
                        </span>
                    </div>
                )}
                {tangled && (
                    <p
                        className="rounded-xl border-2 border-[#c2410c] bg-[#ffedd5] px-3 py-1.5 text-center text-xs font-black text-[#9a3412]"
                        role="alert"
                        data-testid="or-tangled"
                    >
                        {t('orderRush.tangledBy', {
                            name: sabotage?.attacker_name ?? '',
                        })}
                    </p>
                )}
            </Panel>

            {/* Power-ups */}
            <div className="flex flex-col gap-2" data-testid="or-powerups">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-700 uppercase">
                        {t('orderRush.powerUps')}
                    </span>
                    {you.inventory.length === 0 && (
                        <span className="text-xs font-bold text-slate-600">
                            {t('orderRush.noPowerUps', {
                                count: state.combo_every,
                            })}
                        </span>
                    )}
                    {you.inventory.map((power, index) => {
                        const style = POWER_STYLE[power];
                        const Icon = style.icon;
                        return (
                            <button
                                key={`${power}-${index}`}
                                type="button"
                                disabled={
                                    !online ||
                                    (power === 'SHIELD' && you.shield)
                                }
                                onClick={() =>
                                    power === 'SHIELD'
                                        ? firePower(power)
                                        : setAiming(
                                              aiming === power ? null : power,
                                          )
                                }
                                aria-pressed={aiming === power}
                                data-testid={`or-power-${power}`}
                                className="or-piece inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 text-sm font-black text-white shadow-[2px_2px_0px_#1f2a44] disabled:opacity-50"
                                style={{ background: style.tone }}
                            >
                                <Icon className="size-4" aria-hidden="true" />
                                {t(`orderRush.power.${power}`)}
                            </button>
                        );
                    })}
                </div>
                {aiming && (
                    <div
                        className="flex flex-wrap gap-1.5 rounded-2xl border-2 border-dashed border-[#1f2a44] bg-white p-2"
                        data-testid="or-targets"
                    >
                        <span className="w-full text-xs font-black text-slate-700">
                            {t('orderRush.pickTarget')}
                        </span>
                        <button
                            type="button"
                            onClick={() => firePower(aiming)}
                            className="or-piece inline-flex min-h-11 items-center gap-1 rounded-xl border-2 border-[#1f2a44] bg-[#fde047] px-3 text-xs font-black"
                        >
                            <Zap className="size-4" aria-hidden="true" />
                            {t('orderRush.targetLeader')}
                        </button>
                        {rivals.slice(0, 8).map((row) => (
                            <button
                                key={row.user_id}
                                type="button"
                                onClick={() => firePower(aiming, row.user_id)}
                                className="or-piece inline-flex min-h-11 max-w-40 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-2 text-xs font-black"
                            >
                                <span className="size-7 shrink-0">
                                    <PlayerAvatar
                                        character={row.avatar ?? row.character}
                                        seat={row.user_id}
                                    />
                                </span>
                                <span className="truncate">{row.username}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {error && <RoomError code={error} />}
            {leave}
        </div>
    );
}
