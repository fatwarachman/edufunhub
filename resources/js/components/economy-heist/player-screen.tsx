import AdSlot from '@/components/ads/ad-slot';
import {
    ChestArt,
    clock,
    formatGold,
    GoldValue,
    Leaderboard,
    OUTCOME_STYLE,
    Panel,
    Podium,
    seconds,
    useNow,
    useOutcomeValue,
    useRemaining,
} from '@/components/economy-heist/shared';
import {
    ConnectionBadge,
    RoomEntry,
    RoomError,
} from '@/components/multiplayer/room';
import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import {
    type HeistBoardEntry,
    type HeistChestResult,
    type HeistState,
    type useEconomyHeist,
} from '@/hooks/use-economy-heist';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    Check,
    Coins,
    DoorOpen,
    Hourglass,
    Shield,
    ShieldOff,
    Target,
    Timer,
    Trophy,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type Status = ReturnType<typeof useEconomyHeist>['status'];
type Act = (msg: Record<string, unknown>) => void;

const LETTERS = ['A', 'B', 'C', 'D'];
/** High-contrast answer colours (white text passes AA on each). */
const OPTION_COLORS = ['#c2185b', '#1565c0', '#b45309', '#2e7d32'];
/** How long a chest reveal stays before the next question shows. */
const REVEAL_MS = 2600;

export interface HeistNotice {
    id: number;
    tone: 'good' | 'bad' | 'info';
    text: string;
}

/** Student controller: question card, three chests, target picker. */
export function PlayerScreen({
    state,
    status,
    error,
    online,
    name,
    character,
    notice,
    act,
    onJoin,
    onHost,
}: {
    state: HeistState;
    status: Status;
    error: string | null;
    online: boolean;
    name: string;
    character: CharacterLook | null;
    notice: HeistNotice | null;
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
                intro={t('economyHeist.playerIntro', { name })}
                createLabel={t('economyHeist.openHost')}
                onCreate={onHost}
                onJoin={onJoin}
            >
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('economyHeist.roomClosed')}
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
            data-testid="eh-leave"
            className="min-h-11 self-center rounded-xl border-2 border-[#1f2a44]/20 bg-white/70 px-4 text-xs font-bold text-slate-700"
        >
            <DoorOpen className="size-4" />
            {t('economyHeist.leave')}
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
                <span className="size-24" data-testid="eh-lobby-avatar">
                    <PlayerAvatar character={look} seat={you?.user_id ?? 0} />
                </span>
                <p
                    className="font-display text-xl font-black"
                    data-testid="eh-waiting"
                >
                    {t('economyHeist.waitingStart')}
                </p>
                <p className="text-sm font-bold text-slate-600">
                    {t('economyHeist.playersCount', {
                        count: state.players.filter((p) => !p.left).length,
                    })}
                    {state.host && !state.host.online && (
                        <> · {t('economyHeist.hostOffline')}</>
                    )}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('economyHeist.rules')}
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
                <Trophy className="size-14 text-[#b45309]" aria-hidden="true" />
                <h2
                    className="font-display text-2xl font-black"
                    data-testid="eh-result"
                >
                    {result?.won
                        ? t('economyHeist.youWon')
                        : t('economyHeist.yourRank', {
                              rank: result?.rank ?? '–',
                              total: state.ranking?.length ?? 0,
                          })}
                </h2>
                {result && (
                    <div className="flex flex-wrap justify-center gap-2 text-sm font-black">
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-3 py-1">
                            <Coins className="size-4" aria-hidden="true" />
                            {t('economyHeist.earned', {
                                points: result.points,
                            })}
                        </span>
                        <span className="rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1">
                            {t('economyHeist.stats', {
                                correct: result.correct,
                                steals: result.steals,
                                swaps: result.swaps,
                            })}
                        </span>
                    </div>
                )}
                <div className="w-full text-left">
                    <Podium state={state} />
                </div>
                <p className="text-xs font-bold text-slate-600">
                    {t('economyHeist.waitingHost')}
                </p>
                <AdSlot placement="arena.result" className="w-full max-w-md" />
                {leave}
            </Panel>
        );
    }

    return (
        <div
            className="relative mx-auto flex w-full max-w-2xl flex-col gap-4"
            data-testid="eh-player-pad"
            data-stage={you?.stage ?? ''}
        >
            <StatusBar state={state} character={look} />
            {notice && (
                <p
                    key={notice.id}
                    role="status"
                    data-testid="eh-notice"
                    className={cn(
                        'eh-reveal rounded-2xl border-2 border-[#1f2a44] px-4 py-2.5 text-center text-sm font-black',
                        notice.tone === 'good' && 'bg-[#c9f5e5]',
                        notice.tone === 'bad' && 'bg-[#FFEBF0] text-[#AD1457]',
                        notice.tone === 'info' && 'bg-[#dbeafe]',
                    )}
                >
                    {notice.text}
                </p>
            )}
            <Stage state={state} online={online} error={error} act={act} />
            {status === 'reconnecting' && (
                <p
                    role="alert"
                    className="rounded-2xl border-2 border-[#1f2a44] bg-[#FFEBF0] px-4 py-2.5 text-center text-sm font-bold text-[#AD1457]"
                >
                    {t('economyHeist.connectionLost')}
                </p>
            )}
            {error && <RoomError code={error} />}
            <details className="rounded-2xl border-2 border-[#1f2a44] bg-white p-3">
                <summary className="min-h-8 cursor-pointer font-display text-sm font-black">
                    {t('economyHeist.leaderboard')}
                </summary>
                <div className="mt-2">
                    <Leaderboard
                        rows={state.leaderboard}
                        you={you?.user_id}
                        limit={10}
                    />
                </div>
            </details>
            {leave}
        </div>
    );
}

/** Sticky top bar: own avatar, gold, shield, rank and game clock. */
function StatusBar({
    state,
    character,
}: {
    state: HeistState;
    character: CharacterLook | null | undefined;
}) {
    const { t, i18n } = useTranslations();
    const remaining = useRemaining(state);
    const you = state.you;
    const rank = state.leaderboard.find(
        (r) => r.user_id === you?.user_id,
    )?.rank;
    return (
        <div
            className="sticky top-[4.5rem] z-20 flex items-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-white p-2 shadow-[3px_3px_0px_#1f2a44] sm:gap-3 sm:p-3"
            data-testid="eh-status"
        >
            <span className="size-12 shrink-0 sm:size-14">
                <PlayerAvatar character={character} seat={you?.user_id ?? 0} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-black text-slate-600">
                    {you?.name}
                    {rank !== undefined &&
                        ` · ${t('economyHeist.rank', { rank })}`}
                </span>
                <span
                    className="inline-flex items-center gap-1 font-display text-2xl leading-none font-black"
                    data-testid="eh-my-gold"
                >
                    <Coins
                        className="size-5 shrink-0 text-[#b45309]"
                        aria-hidden="true"
                    />
                    <GoldValue value={you?.gold ?? 0} />
                </span>
            </div>
            <span
                className={cn(
                    'inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border-2 border-[#1f2a44] px-2 text-xs font-black',
                    you?.has_shield
                        ? 'bg-[#1d4ed8] text-white'
                        : 'bg-white text-slate-500',
                )}
                data-testid="eh-shield"
                data-active={you?.has_shield ? 'true' : 'false'}
            >
                {you?.has_shield ? (
                    <Shield className="size-4" aria-hidden="true" />
                ) : (
                    <ShieldOff className="size-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">
                    {you?.has_shield
                        ? t('economyHeist.shieldOn')
                        : t('economyHeist.shieldOff')}
                </span>
                <span className="sr-only sm:hidden">
                    {you?.has_shield
                        ? t('economyHeist.shieldOn')
                        : t('economyHeist.shieldOff')}
                </span>
            </span>
            <span className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-2 font-display text-sm font-black tabular-nums">
                {state.win === 'GOLD_TARGET' ? (
                    <>
                        <Target className="size-4" aria-hidden="true" />
                        {formatGold(state.target_gold, i18n.language)}
                    </>
                ) : (
                    <>
                        <Timer className="size-4" aria-hidden="true" />
                        {clock(remaining)}
                    </>
                )}
            </span>
        </div>
    );
}

/** The current step of the self-paced loop. */
function Stage({
    state,
    online,
    error,
    act,
}: {
    state: HeistState;
    online: boolean;
    error: string | null;
    act: Act;
}) {
    const you = state.you;
    const [ackSeq, setAckSeq] = useState(0);
    const revealing =
        state.chest !== undefined &&
        !state.chest.requires_target &&
        state.chestSeq !== ackSeq;

    useEffect(() => {
        if (!revealing) {
            return;
        }
        const seq = state.chestSeq;
        const id = setTimeout(() => setAckSeq(seq), REVEAL_MS);
        return () => clearTimeout(id);
    }, [revealing, state.chestSeq]);

    if (!you) {
        return null;
    }
    if (revealing && state.chest) {
        return (
            <ChestReveal
                chest={state.chest}
                onContinue={() => setAckSeq(state.chestSeq)}
            />
        );
    }
    switch (you.stage) {
        case 'CHEST':
            return <ChestPicker online={online} error={error} act={act} />;
        case 'TARGET':
            return (
                <TargetPicker
                    state={state}
                    online={online}
                    error={error}
                    act={act}
                />
            );
        case 'COOLDOWN':
            return <Cooldown state={state} />;
        case 'QUESTION':
            return (
                <QuestionCard
                    state={state}
                    online={online}
                    error={error}
                    act={act}
                />
            );
        default:
            return null;
    }
}

function QuestionCard({
    state,
    online,
    error,
    act,
}: {
    state: HeistState;
    online: boolean;
    error: string | null;
    act: Act;
}) {
    const { t } = useTranslations();
    const question = state.you?.question;
    const [sent, setSent] = useState<string | null>(null);
    if (!question) {
        return null;
    }
    // A refused answer (error from the referee) unlocks the options again.
    const locked = !online || (sent === question.id && error === null);
    return (
        <div className="flex flex-col gap-3" data-testid="eh-question">
            <Panel className="flex flex-col gap-2 !p-4 sm:!p-5">
                <span className="text-xs font-black text-slate-600 uppercase">
                    {t('economyHeist.question', { number: question.number })}
                </span>
                <h2 className="font-display text-xl leading-snug font-black sm:text-2xl">
                    {question.text}
                </h2>
            </Panel>
            <div
                className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                role="group"
                aria-label={t('economyHeist.pickAnswer')}
            >
                {question.options.map((text, index) => (
                    <button
                        key={`${question.id}-${index}`}
                        type="button"
                        disabled={locked}
                        data-testid={`eh-option-${index}`}
                        onClick={() => {
                            setSent(question.id);
                            act({
                                t: 'submit_answer',
                                question_id: question.id,
                                answer_index: index,
                            });
                        }}
                        className="eh-chest flex min-h-16 items-center gap-3 rounded-2xl border-3 border-[#1f2a44] p-3 text-left text-white shadow-[4px_4px_0px_#1f2a44] disabled:opacity-60"
                        style={{ background: OPTION_COLORS[index] }}
                    >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white font-display text-lg font-black text-[#1f2a44]">
                            {LETTERS[index]}
                        </span>
                        <span className="min-w-0 flex-1 font-display text-lg leading-tight font-black break-words sm:text-xl">
                            {text}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function Cooldown({ state }: { state: HeistState }) {
    const { t } = useTranslations();
    const now = useNow(true, 100);
    const left = Math.max(
        0,
        (state.you?.cooldown_ms ?? 0) - (now - state.youAt),
    );
    const total = Math.max(1, state.cooldown_ms);
    const answer = state.answer;
    return (
        <Panel className="eh-shake flex flex-col items-center gap-3 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-[#be123c] text-white">
                <X className="size-7" aria-hidden="true" />
            </span>
            <h2
                className="font-display text-xl font-black"
                data-testid="eh-wrong"
            >
                {t('economyHeist.wrong')}
            </h2>
            {answer?.hint && (
                <p className="text-sm font-bold text-slate-600">
                    {answer.hint}
                </p>
            )}
            <div
                className="h-3 w-full max-w-sm overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((left / total) * 100)}
            >
                <div
                    className="eh-countdown h-full bg-[#be123c]"
                    style={{ width: `${(left / total) * 100}%` }}
                />
            </div>
            <p className="inline-flex items-center gap-1.5 text-sm font-black">
                <Hourglass className="size-4" aria-hidden="true" />
                {t('economyHeist.cooldown', { seconds: seconds(left) })}
            </p>
        </Panel>
    );
}

function ChestPicker({
    online,
    error,
    act,
}: {
    online: boolean;
    error: string | null;
    act: Act;
}) {
    const { t } = useTranslations();
    const [chosen, setPicked] = useState<number | null>(null);
    const picked = error === null ? chosen : null;
    return (
        <Panel className="flex flex-col items-center gap-4 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#c9f5e5] px-3 py-1 text-sm font-black">
                <Check className="size-4" aria-hidden="true" />
                {t('economyHeist.correct')}
            </span>
            <h2 className="font-display text-2xl font-black">
                {t('economyHeist.chooseChest')}
            </h2>
            <div
                className="grid w-full grid-cols-3 gap-2 sm:gap-4"
                data-testid="eh-chests"
            >
                {[0, 1, 2].map((index) => (
                    <button
                        key={index}
                        type="button"
                        disabled={!online || picked !== null}
                        data-testid={`eh-chest-${index}`}
                        data-state={
                            picked === null
                                ? 'closed'
                                : picked === index
                                  ? 'picked'
                                  : 'other'
                        }
                        aria-label={t('economyHeist.chest', {
                            number: index + 1,
                        })}
                        onClick={() => {
                            setPicked(index);
                            act({ t: 'select_chest', chest_index: index });
                        }}
                        className={cn(
                            'eh-chest flex flex-col items-center gap-1 rounded-3xl border-3 border-[#1f2a44] bg-[#fff1c2] p-2 shadow-[4px_4px_0px_#1f2a44] sm:p-4',
                            picked === null && 'eh-chest-idle',
                        )}
                    >
                        <ChestArt open={picked === index} />
                        <span className="font-display text-sm font-black sm:text-base">
                            {picked === index
                                ? t('economyHeist.opening')
                                : t('economyHeist.chest', {
                                      number: index + 1,
                                  })}
                        </span>
                    </button>
                ))}
            </div>
        </Panel>
    );
}

/** Celebration after a chest: picked outcome plus the two missed chests. */
function ChestReveal({
    chest,
    onContinue,
}: {
    chest: HeistChestResult;
    onContinue?: () => void;
}) {
    const { t, i18n } = useTranslations();
    const valueOf = useOutcomeValue();
    const style = OUTCOME_STYLE[chest.type];
    const Icon = style.icon;
    return (
        <Panel className="eh-reveal flex flex-col items-center gap-4 text-center">
            <div
                data-testid="eh-chest-result"
                data-type={chest.type}
                className="flex flex-col items-center gap-2"
            >
                <span
                    className="grid size-16 place-items-center rounded-3xl border-3 border-[#1f2a44] text-white shadow-[3px_3px_0px_#1f2a44]"
                    style={{ background: style.tone }}
                >
                    <Icon className="size-8" aria-hidden="true" />
                </span>
                <h2 className="font-display text-2xl font-black">
                    {t(`economyHeist.outcomes.${chest.type}`)}{' '}
                    <span style={{ color: style.tone }}>{valueOf(chest)}</span>
                </h2>
                <p className="text-sm font-bold text-slate-700">
                    {t(`economyHeist.outcomeBody.${chest.type}`, {
                        amount: formatGold(
                            Math.abs(chest.delta),
                            i18n.language,
                        ),
                        value: chest.value,
                    })}
                </p>
            </div>
            <ul className="grid w-full grid-cols-3 gap-2" aria-hidden="true">
                {chest.chests.map((c, index) => {
                    const s = OUTCOME_STYLE[c.type];
                    const CIcon = s.icon;
                    return (
                        <li
                            key={index}
                            className={cn(
                                'flex flex-col items-center gap-1 rounded-2xl border-2 border-[#1f2a44] p-2 text-xs font-black',
                                index === chest.chest_index
                                    ? 'bg-[#fff1c2] ring-4 ring-[#ffd93d]'
                                    : 'bg-white opacity-60',
                            )}
                        >
                            <CIcon
                                className="size-5"
                                style={{ color: s.tone }}
                            />
                            <span className="text-center leading-tight">
                                {t(`economyHeist.outcomes.${c.type}`)}
                            </span>
                            <span style={{ color: s.tone }}>{valueOf(c)}</span>
                        </li>
                    );
                })}
            </ul>
            {onContinue && (
                <Button
                    onClick={onContinue}
                    data-testid="eh-continue"
                    className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                >
                    {t('economyHeist.nextQuestion')}
                </Button>
            )}
        </Panel>
    );
}

function TargetPicker({
    state,
    online,
    error,
    act,
}: {
    state: HeistState;
    online: boolean;
    error: string | null;
    act: Act;
}) {
    const { t, i18n } = useTranslations();
    const you = state.you;
    const now = useNow(true, 200);
    const [sent, setSent] = useState(false);
    const left = Math.max(0, (you?.target_ms ?? 0) - (now - state.youAt));
    const pending = you?.pending;
    const rivals: HeistBoardEntry[] = state.leaderboard.filter(
        (r) => r.user_id !== you?.user_id && !r.left,
    );
    const swap = pending?.type === 'SWAP_GOLD';
    return (
        <div className="flex flex-col gap-3" data-testid="eh-targets">
            {state.chest && <ChestReveal chest={state.chest} />}
            <Panel className="flex flex-col gap-3 !p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-xl font-black">
                        {swap
                            ? t('economyHeist.chooseSwapTarget')
                            : t('economyHeist.chooseTarget')}
                    </h2>
                    <span className="inline-flex min-h-9 items-center gap-1 rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-2.5 text-sm font-black tabular-nums">
                        <Timer className="size-4" aria-hidden="true" />
                        {t('economyHeist.targetTime', {
                            seconds: seconds(left),
                        })}
                    </span>
                </div>
                <p className="text-xs font-bold text-slate-600">
                    {t('economyHeist.targetHint')}
                </p>
                {rivals.length === 0 ? (
                    <p className="text-sm font-bold">
                        {t('economyHeist.noRivals')}
                    </p>
                ) : (
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {rivals.map((r) => (
                            <li key={r.user_id}>
                                <button
                                    type="button"
                                    disabled={
                                        !online || (sent && error === null)
                                    }
                                    data-testid={`eh-target-${r.user_id}`}
                                    onClick={() => {
                                        setSent(true);
                                        act({
                                            t: 'execute_heist_target',
                                            target_player_id: r.user_id,
                                        });
                                    }}
                                    className="eh-chest flex w-full items-center gap-3 rounded-2xl border-3 border-[#1f2a44] bg-white p-2.5 text-left shadow-[3px_3px_0px_#1f2a44] hover:bg-[#fff1c2] disabled:opacity-60"
                                >
                                    <span className="size-12 shrink-0">
                                        <PlayerAvatar
                                            character={r.character}
                                            seat={r.user_id}
                                        />
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate font-black">
                                            {r.name}
                                        </span>
                                        <span className="text-xs font-bold text-slate-600">
                                            {t('economyHeist.rank', {
                                                rank: r.rank,
                                            })}
                                        </span>
                                    </span>
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2 py-0.5 font-display text-sm font-black">
                                        <Coins
                                            className="size-3.5"
                                            aria-hidden="true"
                                        />
                                        {formatGold(r.gold, i18n.language)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
        </div>
    );
}
