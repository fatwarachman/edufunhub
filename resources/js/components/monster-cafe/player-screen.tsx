import AdSlot from '@/components/ads/ad-slot';
import {
    DishView,
    IngredientIcon,
    MonsterSprite,
    PieSplat,
    RatSprite,
} from '@/components/monster-cafe/art';
import {
    clock,
    CoinValue,
    Leaderboard,
    moodOf,
    Panel,
    PatienceBar,
    Podium,
    seconds,
    useCafeNames,
    useNow,
    useRemaining,
} from '@/components/monster-cafe/shared';
import { RoomLeaveControl } from '@/components/multiplayer/host-controls';
import {
    ConnectionBadge,
    RoomEntry,
    RoomError,
} from '@/components/multiplayer/room';
import {
    isGameSubject,
    MIX_SUBJECT,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { QuestionMedia } from '@/components/question-media';
import { Button } from '@/components/ui/button';
import {
    type Ingredient,
    type MonsterCafeKitchen,
    type MonsterCafeOrder,
    type MonsterCafeSend,
    type MonsterCafeState,
    type MonsterCafeStatus,
    PANTRY,
} from '@/hooks/use-monster-cafe';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { type CafeSound } from '@/lib/monster-cafe-sounds';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    CakeSlice,
    Check,
    ChefHat,
    Coins,
    CookingPot,
    DoorOpen,
    Flame,
    Hand,
    HandPlatter,
    Hourglass,
    OctagonX,
    Play,
    RotateCcw,
    Timer,
    Trash2,
    Trophy,
    Undo2,
    X,
    Zap,
} from 'lucide-react';
import {
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';

const LETTERS = ['A', 'B', 'C', 'D'];
/** High-contrast answer colours (white text passes AA on each). */
const OPTION_COLORS = ['#c2185b', '#1565c0', '#b45309', '#2e7d32'];
const TRAY_MAX = 8;
const PLATE_MAX = 6;
/** Wrong-answer cooldown of the contract (ring scale). */
const COOLDOWN_MS = 2000;

export interface CafeNotice {
    id: number;
    tone: 'good' | 'bad' | 'info';
    text: string;
}

/** Student kitchen pad: orders, pantry + quiz, tray, plate, oven, serve. */
export function PlayerScreen({
    state,
    status,
    error,
    online,
    name,
    character,
    notices,
    act,
    play,
    onJoin,
    onHost,
    solo = false,
    onCreateSolo,
}: {
    state: MonsterCafeState;
    status: MonsterCafeStatus;
    error: string | null;
    online: boolean;
    name: string;
    character: CharacterLook | null;
    notices: CafeNotice[];
    act: MonsterCafeSend;
    play: (sound: CafeSound) => void;
    onJoin: (pin: string) => void;
    onHost: () => void;
    /** Solo kitchen page (`?role=solo`): the player owns the room. */
    solo?: boolean;
    onCreateSolo?: () => void;
}) {
    const { t } = useTranslations();
    const isSolo = solo || state.solo === true;

    if (solo && state.phase === 'NONE') {
        return (
            <Panel
                className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center"
                testId="mc-solo-entry"
            >
                <ConnectionBadge status={status} />
                <ChefHat
                    className="size-12 text-[#ea580c]"
                    aria-hidden="true"
                />
                <p className="font-display text-xl font-black">
                    {t('monsterCafe.player.soloPreparing', { name })}
                </p>
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('monsterCafe.player.soloClosed')}
                    </p>
                )}
                {error && <RoomError code={error} />}
                <Button
                    onClick={onCreateSolo}
                    disabled={!online}
                    data-testid="mc-solo-create"
                    className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#ea580c] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#c2410c] disabled:bg-[#fed7aa] disabled:text-[#1f2a44] disabled:opacity-100"
                >
                    <ChefHat className="size-5" aria-hidden="true" />
                    {t('monsterCafe.player.soloCreate')}
                </Button>
            </Panel>
        );
    }

    if (state.phase === 'NONE' || (!state.pin && !isSolo)) {
        return (
            <RoomEntry
                game="monster-cafe"
                status={status}
                error={error}
                intro={t('monsterCafe.player.intro', { name })}
                createLabel={t('monsterCafe.page.openHost')}
                onCreate={onHost}
                onJoin={onJoin}
            >
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('monsterCafe.player.roomClosed')}
                    </p>
                )}
            </RoomEntry>
        );
    }

    const me = state.roster.find((r) => r.user_id === state.you);
    const look = me?.character ?? character;
    const leave = isSolo ? (
        <SoloEndControl
            playing={state.phase === 'PLAYING'}
            online={online}
            act={act}
        />
    ) : (
        <RoomLeaveControl
            isHost={false}
            onLeave={() => act({ t: 'leave_room' })}
            onStop={() => {}}
            testId="mc-leave"
            className="rounded-xl border-2 border-[#1f2a44]/20 bg-white/70 px-4 text-slate-700"
        />
    );

    if (state.phase === 'LOBBY' && isSolo) {
        return (
            <SoloLobby
                state={state}
                status={status}
                error={error}
                online={online}
                act={act}
                leave={leave}
            />
        );
    }

    if (state.phase === 'LOBBY') {
        return (
            <Panel
                className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center"
                testId="mc-lobby"
            >
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <ConnectionBadge status={status} />
                    <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                        {t('monsterCafe.common.pin', { pin: state.pin })}
                    </span>
                </div>
                <span className="size-24" data-testid="mc-lobby-avatar">
                    <PlayerAvatar
                        character={look}
                        seat={state.you ?? 0}
                        userId={state.you ?? 0}
                    />
                </span>
                <p
                    className="font-display text-xl font-black"
                    data-testid="mc-waiting"
                >
                    {t('monsterCafe.player.waitingStart')}
                </p>
                <p className="text-sm font-bold text-slate-600">
                    {t('monsterCafe.common.playersCount', {
                        count: state.roster.filter((p) => !p.left).length,
                    })}
                    {' · '}
                    {t('monsterCafe.common.minutes', { count: state.minutes })}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('monsterCafe.page.rules')}
                </p>
                {error && <RoomError code={error} />}
                {leave}
            </Panel>
        );
    }

    if (state.phase === 'GAME_OVER') {
        const result = state.result;
        return (
            <Panel
                className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center"
                testId="mc-result-panel"
            >
                <Trophy className="size-14 text-[#b45309]" aria-hidden="true" />
                <h2
                    className="font-display text-2xl font-black"
                    data-testid="mc-result"
                >
                    {result?.won
                        ? t('monsterCafe.player.youWon')
                        : t('monsterCafe.player.yourRank', {
                              rank: result?.rank ?? '–',
                              total: state.ranking?.length ?? 0,
                          })}
                </h2>
                {result && (
                    <div className="flex flex-wrap justify-center gap-2 text-sm font-black">
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-3 py-1">
                            <Coins className="size-4" aria-hidden="true" />
                            {t('monsterCafe.player.earned', {
                                points: result.points,
                            })}
                        </span>
                        <span className="rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1">
                            {t('monsterCafe.common.stats', {
                                served: result.served,
                                correct: result.correct ?? 0,
                                answered: result.answered ?? 0,
                            })}
                        </span>
                    </div>
                )}
                <div className="w-full text-left">
                    <Podium state={state} you={state.you} />
                </div>
                {isSolo ? (
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online}
                        data-testid="mc-solo-again"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#ea580c] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#c2410c] disabled:bg-[#fed7aa] disabled:text-[#1f2a44] disabled:opacity-100"
                    >
                        <RotateCcw className="size-5" aria-hidden="true" />
                        {t('monsterCafe.player.soloAgain')}
                    </Button>
                ) : (
                    <p className="text-xs font-bold text-slate-600">
                        {t('monsterCafe.player.waitingHost')}
                    </p>
                )}
                <AdSlot placement="arena.result" className="w-full max-w-md" />
                {leave}
            </Panel>
        );
    }

    return (
        <div
            className="relative mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3"
            data-testid="mc-player-pad"
        >
            {state.kitchen ? (
                <Kitchen
                    solo={isSolo}
                    state={state}
                    kitchen={state.kitchen}
                    online={online}
                    error={error}
                    notices={notices}
                    act={act}
                    play={play}
                />
            ) : (
                <Panel className="text-center font-bold">
                    {t('monsterCafe.player.preparing')}
                </Panel>
            )}
            {status === 'reconnecting' && (
                <p
                    role="alert"
                    className="rounded-2xl border-2 border-[#1f2a44] bg-[#FFEBF0] px-4 py-2.5 text-center text-sm font-bold text-[#AD1457]"
                >
                    {t('monsterCafe.player.connectionLost')}
                </p>
            )}
            {error && <RoomError code={error} />}
            {!isSolo && state.leaderboard.length > 0 && (
                <details className="rounded-2xl border-2 border-[#1f2a44] bg-white p-3">
                    <summary
                        className="flex min-h-11 cursor-pointer items-center font-display text-sm font-black"
                        data-testid="mc-board-toggle"
                    >
                        {t('monsterCafe.common.leaderboard')}
                    </summary>
                    <div className="mt-2">
                        <Leaderboard
                            rows={state.leaderboard}
                            you={state.you}
                            limit={10}
                        />
                    </div>
                </details>
            )}
            {leave}
        </div>
    );
}

/** Tray/plate with optimistic local moves so fast taps never read stale state. */
interface LocalStack {
    base: MonsterCafeKitchen;
    tray: Ingredient[];
    plate: Ingredient[];
}

function Kitchen({
    solo,
    state,
    kitchen,
    online,
    error,
    notices,
    act,
    play,
}: {
    solo: boolean;
    state: MonsterCafeState;
    kitchen: MonsterCafeKitchen;
    online: boolean;
    error: string | null;
    notices: CafeNotice[];
    act: MonsterCafeSend;
    play: (sound: CafeSound) => void;
}) {
    const { t } = useTranslations();
    const names = useCafeNames();
    const now = useNow(true, 200);
    const kitchenRef = useRef(kitchen);
    const localRef = useRef<LocalStack | null>(null);
    const [local, setLocal] = useState<LocalStack | null>(null);
    useLayoutEffect(() => {
        kitchenRef.current = kitchen;
    }, [kitchen]);

    const view =
        local && local.base === kitchen
            ? local
            : { base: kitchen, tray: kitchen.tray, plate: kitchen.plate };
    const commit = (next: LocalStack) => {
        localRef.current = next;
        setLocal(next);
    };
    const current = (): LocalStack => {
        const base = kitchenRef.current;
        const mine = localRef.current;
        return mine && mine.base === base
            ? mine
            : { base, tray: base.tray, plate: base.plate };
    };

    const addToPlate = (index: number) => {
        const cur = current();
        const ingredient = cur.tray[index];
        if (!ingredient || cur.plate.length >= PLATE_MAX) {
            return;
        }
        if (act({ t: 'plate_add', ingredient })) {
            play('plate');
            commit({
                base: cur.base,
                tray: cur.tray.filter((_, i) => i !== index),
                plate: [...cur.plate, ingredient],
            });
        }
    };
    const clearPlate = () => {
        const cur = current();
        if (cur.plate.length === 0) {
            return;
        }
        if (act({ t: 'plate_clear' })) {
            commit({
                base: cur.base,
                tray: [...cur.tray, ...cur.plate],
                plate: [],
            });
        }
    };
    const cook = () => {
        const cur = current();
        if (cur.plate.length === 0) {
            return;
        }
        if (act({ t: 'cook' })) {
            commit({ base: cur.base, tray: cur.tray, plate: [] });
        }
    };

    const blurred = state.pieHit !== undefined && state.pieHit.until > now;
    const rat =
        kitchen.rat && kitchen.rat.stealAt > now - 500 ? kitchen.rat : null;
    const ovenBusy = kitchen.oven.state !== 'EMPTY' || kitchen.dish !== null;

    return (
        <>
            <Hud
                solo={solo}
                state={state}
                kitchen={kitchen}
                online={online}
                act={act}
            />
            {notices.length > 0 && (
                <ul
                    className="flex flex-col gap-1.5"
                    aria-live="polite"
                    data-testid="mc-toasts"
                >
                    {notices.map((n) => (
                        <li
                            key={n.id}
                            role="status"
                            className={cn(
                                'mc-pop rounded-2xl border-2 border-[#1f2a44] px-4 py-2 text-center text-sm font-black',
                                n.tone === 'good' && 'bg-[#c9f5e5]',
                                n.tone === 'bad' &&
                                    'bg-[#FFEBF0] text-[#AD1457]',
                                n.tone === 'info' && 'bg-[#dbeafe]',
                            )}
                        >
                            {n.text}
                        </li>
                    ))}
                </ul>
            )}
            <div
                className={cn(
                    'mc-kitchen flex min-w-0 flex-col gap-3',
                    blurred && 'mc-blurred',
                )}
                data-testid="mc-kitchen"
                data-blurred={blurred ? 'true' : 'false'}
            >
                <Orders
                    kitchen={kitchen}
                    now={now}
                    online={online}
                    act={act}
                    play={play}
                />
                {kitchen.question && (
                    <QuestionCard
                        kitchen={kitchen}
                        answer={state.answer}
                        online={online}
                        error={error}
                        act={act}
                    />
                )}
                <Pantry
                    kitchen={kitchen}
                    trayCount={view.tray.length}
                    now={now}
                    online={online}
                    act={act}
                    play={play}
                />
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
                    <Panel className="flex min-w-0 flex-col gap-2 !p-3 sm:!p-4">
                        <h2 className="flex items-center justify-between gap-2 font-display text-base font-black">
                            {t('monsterCafe.player.tray')}
                            <span className="text-xs font-bold text-slate-600">
                                {t('monsterCafe.player.trayCount', {
                                    count: view.tray.length,
                                    max: TRAY_MAX,
                                })}
                            </span>
                        </h2>
                        {view.tray.length === 0 ? (
                            <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-3 py-4 text-center text-xs font-bold text-slate-600">
                                {t('monsterCafe.player.trayEmpty')}
                            </p>
                        ) : (
                            <ul
                                className="grid grid-cols-4 gap-1.5"
                                data-testid="mc-tray"
                            >
                                {view.tray.map((ingredient, index) => (
                                    <li key={`${ingredient}-${index}`}>
                                        <button
                                            type="button"
                                            disabled={
                                                !online ||
                                                view.plate.length >= PLATE_MAX
                                            }
                                            onClick={() => addToPlate(index)}
                                            data-testid={`mc-tray-${index}`}
                                            data-ingredient={ingredient}
                                            aria-label={t(
                                                'monsterCafe.player.addToPlate',
                                                {
                                                    ingredient:
                                                        names.ingredient(
                                                            ingredient,
                                                        ),
                                                },
                                            )}
                                            className={cn(
                                                'mc-press grid min-h-14 w-full place-items-center rounded-xl border-2 border-[#1f2a44] bg-[#fff7ed] p-1 shadow-[2px_2px_0px_#1f2a44] disabled:opacity-60',
                                                rat?.ingredient ===
                                                    ingredient &&
                                                    'mc-threat ring-4 ring-[#be123c]/60',
                                            )}
                                        >
                                            <IngredientIcon
                                                ingredient={ingredient}
                                                size={40}
                                            />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel
                        className="flex min-w-0 flex-col gap-2 !p-3 sm:!p-4"
                        testId="mc-plate"
                    >
                        <h2 className="flex items-center justify-between gap-2 font-display text-base font-black">
                            {t('monsterCafe.player.plate')}
                            <span className="text-xs font-bold text-slate-600">
                                {view.plate.length > 0
                                    ? names.dish(
                                          view.plate.includes('BUN')
                                              ? 'BURGER'
                                              : view.plate.includes('DOUGH')
                                                ? 'PIZZA'
                                                : 'MESS',
                                      )
                                    : t('monsterCafe.player.plateCount', {
                                          count: 0,
                                          max: PLATE_MAX,
                                      })}
                            </span>
                        </h2>
                        <div className="flex min-h-24 items-center justify-center rounded-2xl border-2 border-dashed border-[#1f2a44]/40 bg-[#fffbf5] p-2">
                            {view.plate.length === 0 ? (
                                <p className="text-center text-xs font-bold text-slate-600">
                                    {t('monsterCafe.player.plateEmpty')}
                                </p>
                            ) : (
                                <DishView
                                    dish={
                                        view.plate.includes('BUN')
                                            ? 'BURGER'
                                            : view.plate.includes('DOUGH')
                                              ? 'PIZZA'
                                              : 'MESS'
                                    }
                                    items={view.plate}
                                    size={96}
                                />
                            )}
                        </div>
                        {view.plate.length > 0 && (
                            <ul className="flex flex-wrap gap-1">
                                {view.plate.map((ingredient, index) => (
                                    <li
                                        key={`${ingredient}-${index}`}
                                        className="rounded-full border border-[#1f2a44]/30 bg-white px-2 py-0.5 text-[11px] font-bold"
                                    >
                                        {names.ingredient(ingredient)}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                onClick={clearPlate}
                                disabled={!online || view.plate.length === 0}
                                data-testid="mc-plate-clear"
                                className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-white font-black text-[#1f2a44]"
                            >
                                <Undo2 className="size-4" aria-hidden="true" />
                                {t('monsterCafe.player.clear')}
                            </Button>
                            <Button
                                onClick={cook}
                                disabled={
                                    !online ||
                                    view.plate.length === 0 ||
                                    ovenBusy
                                }
                                data-testid="mc-cook"
                                className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-[#ea580c] font-black text-white shadow-[2px_2px_0px_#1f2a44] hover:bg-[#c2410c] disabled:bg-[#fed7aa] disabled:text-[#1f2a44] disabled:opacity-100"
                            >
                                <Flame className="size-4" aria-hidden="true" />
                                {t('monsterCafe.player.cook')}
                            </Button>
                        </div>
                    </Panel>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
                    <Oven
                        kitchen={kitchen}
                        now={now}
                        online={online}
                        act={act}
                    />
                    <HeldDish kitchen={kitchen} online={online} act={act} />
                </div>
            </div>
            {blurred && state.pieHit && (
                <div
                    className="mc-splat pointer-events-none fixed inset-0 z-40"
                    data-testid="mc-pie-splat"
                    role="alert"
                >
                    <PieSplat className="h-full w-full opacity-90" />
                    <p className="absolute inset-x-0 top-1/3 px-4 text-center font-display text-2xl font-black text-[#1f2a44]">
                        {t('monsterCafe.player.pieHit', {
                            name: state.pieHit.attacker?.name ?? '',
                        })}
                    </p>
                </div>
            )}
            {rat && (
                <div
                    className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3"
                    data-testid="mc-rat"
                    role="alertdialog"
                    aria-label={t('monsterCafe.player.ratTitle')}
                >
                    <div className="mc-rat flex w-full max-w-md items-center gap-3 rounded-3xl border-3 border-[#1f2a44] bg-[#fef3c7] p-3 shadow-[5px_5px_0px_#1f2a44]">
                        <RatSprite size={64} className="shrink-0" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <p className="font-display text-base leading-tight font-black">
                                {t('monsterCafe.player.ratTitle')}
                            </p>
                            <p className="text-xs font-bold text-slate-700">
                                {t('monsterCafe.player.ratBody', {
                                    ingredient: names.ingredient(
                                        rat.ingredient,
                                    ),
                                    seconds: seconds(rat.stealAt - now),
                                })}
                            </p>
                        </div>
                        <Button
                            onClick={() => {
                                act({ t: 'shoo_rat', rat_id: rat.rat_id });
                            }}
                            disabled={!online}
                            data-testid="mc-shoo"
                            className="min-h-16 shrink-0 rounded-2xl border-3 border-[#1f2a44] bg-[#be123c] px-4 font-display text-lg font-black text-white shadow-[3px_3px_0px_#1f2a44] hover:bg-[#9f1239]"
                        >
                            <Hand className="size-5" aria-hidden="true" />
                            {t('monsterCafe.player.shoo')}
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}

/** Sticky top bar: coins, served, streak, clock, rank, pies. */
function Hud({
    solo,
    state,
    kitchen,
    online,
    act,
}: {
    solo: boolean;
    state: MonsterCafeState;
    kitchen: MonsterCafeKitchen;
    online: boolean;
    act: MonsterCafeSend;
}) {
    const { t } = useTranslations();
    const remaining = useRemaining(state);
    const [open, setOpen] = useState(false);
    const rivals = state.leaderboard.filter(
        (r) => r.user_id !== state.you && !r.left,
    );
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);
    const throwAt = (target?: number) => {
        setOpen(false);
        act(
            target === undefined
                ? { t: 'throw_pie' }
                : { t: 'throw_pie', target_player_id: target },
        );
    };
    const chip =
        'inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border-2 border-[#1f2a44] px-2 font-display text-sm font-black tabular-nums';
    return (
        <div
            className="sticky top-[4.5rem] z-30 rounded-2xl border-3 border-[#1f2a44] bg-white p-2 shadow-[3px_3px_0px_#1f2a44]"
            data-testid="mc-hud"
        >
            <div
                className={cn(
                    'grid gap-1.5',
                    solo
                        ? 'grid-cols-3 sm:grid-cols-5'
                        : 'grid-cols-3 sm:grid-cols-6',
                )}
            >
                <span
                    className={cn(chip, 'bg-[#ffd93d]')}
                    data-testid="mc-coins"
                    title={t('monsterCafe.player.coinsLabel')}
                >
                    <Coins className="size-4 shrink-0" aria-hidden="true" />
                    <span className="sr-only">
                        {t('monsterCafe.player.coinsLabel')}
                    </span>
                    <CoinValue value={kitchen.score} className="truncate" />
                </span>
                <span
                    className={cn(chip, 'bg-[#c9f5e5]')}
                    data-testid="mc-served"
                    title={t('monsterCafe.player.servedLabel')}
                >
                    <HandPlatter
                        className="size-4 shrink-0"
                        aria-hidden="true"
                    />
                    <span className="sr-only">
                        {t('monsterCafe.player.servedLabel')}
                    </span>
                    {kitchen.served}
                </span>
                <span
                    className={cn(
                        chip,
                        kitchen.streak > 0 ? 'bg-[#fed7aa]' : 'bg-white',
                    )}
                    data-testid="mc-streak"
                    title={t('monsterCafe.player.streakLabel')}
                >
                    <Zap className="size-4 shrink-0" aria-hidden="true" />
                    <span className="sr-only">
                        {t('monsterCafe.player.streakLabel')}
                    </span>
                    {kitchen.streak}
                </span>
                <span
                    className={cn(chip, 'bg-[#FFFDE6]')}
                    data-testid="mc-timer"
                    title={t('monsterCafe.common.timeLeft')}
                >
                    <Timer className="size-4 shrink-0" aria-hidden="true" />
                    {clock(remaining)}
                </span>
                <span
                    className={cn(chip, 'bg-white')}
                    data-testid="mc-rank"
                    title={t('monsterCafe.player.rankLabel')}
                >
                    {kitchen.rank > 0
                        ? t('monsterCafe.player.rankOf', {
                              rank: kitchen.rank,
                              of: kitchen.of,
                          })
                        : '–'}
                </span>
                {!solo && (
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        disabled={!online || kitchen.pies <= 0}
                        aria-expanded={open}
                        data-testid="mc-pie"
                        data-pies={kitchen.pies}
                        className={cn(
                            chip,
                            'mc-press bg-[#dbeafe] disabled:bg-white disabled:text-slate-500',
                            kitchen.pies > 0 && 'mc-glow',
                        )}
                        aria-label={t('monsterCafe.player.pieButton', {
                            count: kitchen.pies,
                        })}
                    >
                        <CakeSlice
                            className="size-4 shrink-0"
                            aria-hidden="true"
                        />
                        {kitchen.pies}
                    </button>
                )}
            </div>
            {open && !solo && (
                <div
                    className="mt-2 flex flex-col gap-1.5 rounded-2xl border-2 border-[#1f2a44] bg-[#eff6ff] p-2"
                    data-testid="mc-pie-picker"
                >
                    <p className="text-xs font-black">
                        {t('monsterCafe.player.pieTarget')}
                    </p>
                    <button
                        type="button"
                        onClick={() => throwAt()}
                        data-testid="mc-pie-target-auto"
                        className="mc-press flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-left text-sm font-black"
                    >
                        <Trophy
                            className="size-4 shrink-0 text-[#b45309]"
                            aria-hidden="true"
                        />
                        {t('monsterCafe.player.pieLeader')}
                    </button>
                    <ul className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                        {rivals.map((r) => (
                            <li key={r.user_id}>
                                <button
                                    type="button"
                                    onClick={() => throwAt(r.user_id)}
                                    data-testid={`mc-pie-target-${r.user_id}`}
                                    className="mc-press flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-2 text-left text-sm font-black"
                                >
                                    <span className="size-8 shrink-0">
                                        <PlayerAvatar
                                            character={r.character}
                                            seat={r.user_id}
                                            userId={r.user_id}
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">
                                        {r.name}
                                    </span>
                                    <span className="shrink-0 text-xs text-slate-600">
                                        {t('monsterCafe.common.rank', {
                                            rank: r.rank,
                                        })}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {rivals.length === 0 && (
                        <p className="text-xs font-bold text-slate-600">
                            {t('monsterCafe.player.pieNoRivals')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/** Multiset equality of a dish and a recipe. */
function sameItems(a: Ingredient[], b: Ingredient[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    const x = [...a].sort();
    const y = [...b].sort();
    return x.every((v, i) => v === y[i]);
}

function Orders({
    kitchen,
    now,
    online,
    act,
    play,
}: {
    kitchen: MonsterCafeKitchen;
    now: number;
    online: boolean;
    act: MonsterCafeSend;
    play: (sound: CafeSound) => void;
}) {
    const { t } = useTranslations();
    if (kitchen.orders.length === 0) {
        return (
            <Panel className="flex items-center justify-center gap-2 !p-4 text-center text-sm font-bold text-slate-600">
                <Hourglass className="size-4" aria-hidden="true" />
                {t('monsterCafe.player.noOrders')}
            </Panel>
        );
    }
    return (
        <ul
            className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
            data-testid="mc-orders"
        >
            {kitchen.orders.map((order) => (
                <OrderTicket
                    key={order.id}
                    order={order}
                    kitchen={kitchen}
                    now={now}
                    online={online}
                    act={act}
                    play={play}
                />
            ))}
        </ul>
    );
}

function OrderTicket({
    order,
    kitchen,
    now,
    online,
    act,
    play,
}: {
    order: MonsterCafeOrder;
    kitchen: MonsterCafeKitchen;
    now: number;
    online: boolean;
    act: MonsterCafeSend;
    play: (sound: CafeSound) => void;
}) {
    const { t } = useTranslations();
    const names = useCafeNames();
    const left = Math.max(0, order.deadlineAt - now);
    const mood = moodOf(left / order.patience_total_ms);
    const dish = kitchen.dish;
    const matches =
        dish !== null &&
        dish.dish === order.dish &&
        sameItems(dish.items, order.recipe);
    const have = [...kitchen.tray, ...kitchen.plate];
    return (
        <li
            className={cn(
                'mc-ticket flex min-w-0 flex-col gap-2 rounded-3xl border-3 border-[#1f2a44] bg-white p-3 shadow-[4px_4px_0px_#1f2a44]',
                mood === 'ANGRY' && 'mc-angry',
            )}
            data-testid={`mc-order-${order.id}`}
            data-mood={mood}
            data-dish={order.dish}
        >
            <div className="flex min-w-0 items-center gap-2">
                <MonsterSprite
                    kind={order.monster}
                    mood={mood}
                    size={64}
                    className="shrink-0"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-xs font-black text-slate-600">
                        {names.monster(order.monster)}
                    </span>
                    <span className="font-display text-lg leading-tight font-black">
                        {names.dish(order.dish)}
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                        {t(`monsterCafe.common.moods.${mood}`)} ·{' '}
                        {t('monsterCafe.common.secondsLeft', {
                            seconds: seconds(left),
                        })}
                    </span>
                </div>
            </div>
            <ul
                className="flex flex-wrap gap-1.5"
                aria-label={t('monsterCafe.player.recipe')}
            >
                {order.recipe.map((ingredient, index) => (
                    <li
                        key={`${ingredient}-${index}`}
                        className={cn(
                            'flex items-center gap-1 rounded-xl border-2 px-1.5 py-0.5 text-[11px] font-black',
                            have.includes(ingredient)
                                ? 'border-[#15803d] bg-[#dcfce7]'
                                : 'border-[#1f2a44]/30 bg-[#fff7ed]',
                        )}
                        title={names.ingredient(ingredient)}
                    >
                        <IngredientIcon ingredient={ingredient} size={24} />
                        <span className="max-w-20 truncate">
                            {names.ingredient(ingredient)}
                        </span>
                    </li>
                ))}
            </ul>
            <PatienceBar
                deadlineAt={order.deadlineAt}
                total={order.patience_total_ms}
                now={now}
            />
            <Button
                onClick={() => {
                    if (act({ t: 'serve', order_id: order.id })) {
                        play('pick');
                    }
                }}
                disabled={!online || dish === null}
                data-testid={`mc-serve-${order.id}`}
                data-match={matches ? 'true' : 'false'}
                className={cn(
                    'min-h-12 rounded-xl border-2 border-[#1f2a44] font-black shadow-[2px_2px_0px_#1f2a44] disabled:opacity-100',
                    matches
                        ? 'bg-[#15803d] text-white hover:bg-[#166534]'
                        : 'bg-[#1f2a44] text-white hover:bg-[#111827] disabled:bg-[#e2e8f0] disabled:text-slate-600',
                )}
            >
                <HandPlatter className="size-4" aria-hidden="true" />
                {matches
                    ? t('monsterCafe.player.serveMatch')
                    : t('monsterCafe.player.serve')}
            </Button>
        </li>
    );
}

function QuestionCard({
    kitchen,
    answer,
    online,
    error,
    act,
}: {
    kitchen: MonsterCafeKitchen;
    answer: MonsterCafeState['answer'];
    online: boolean;
    error: string | null;
    act: MonsterCafeSend;
}) {
    const { t } = useTranslations();
    const names = useCafeNames();
    const question = kitchen.question;
    const [sent, setSent] = useState<string | null>(null);
    if (!question) {
        return null;
    }
    const result =
        answer && answer.question_id === question.question_id
            ? answer
            : undefined;
    // A refused answer (error from the referee) unlocks the options again.
    const locked =
        !online ||
        (result !== undefined && !result.correct) ||
        (sent === question.question_id && error === null && !result);
    return (
        <Panel
            className="mc-pop flex flex-col gap-3 !p-3 sm:!p-4"
            testId="mc-question"
        >
            <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-[#1f2a44] bg-[#fff7ed]">
                    <IngredientIcon
                        ingredient={question.ingredient}
                        size={36}
                    />
                </span>
                <div className="flex min-w-0 flex-col">
                    <span className="text-xs font-black text-slate-600 uppercase">
                        {t('monsterCafe.player.questionFor', {
                            ingredient: names.ingredient(question.ingredient),
                        })}
                    </span>
                    <h2 className="font-display text-lg leading-snug font-black break-words sm:text-xl">
                        {question.text}
                    </h2>
                </div>
            </div>
            <QuestionMedia media={question.media} size="sm" />
            <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                role="group"
                aria-label={t('monsterCafe.player.pickAnswer')}
            >
                {question.options.map((text, index) => {
                    const isCorrect =
                        result !== undefined && result.correct_index === index;
                    const isChoice =
                        result !== undefined && result.choice === index;
                    return (
                        <button
                            key={`${question.question_id}-${index}`}
                            type="button"
                            disabled={locked}
                            data-testid={`mc-answer-${index}`}
                            data-result={
                                isCorrect
                                    ? 'correct'
                                    : isChoice
                                      ? 'wrong'
                                      : undefined
                            }
                            onClick={() => {
                                setSent(question.question_id);
                                act({
                                    t: 'submit_answer',
                                    question_id: question.question_id,
                                    answer_index: index,
                                });
                            }}
                            className={cn(
                                'mc-press flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border-3 border-[#1f2a44] p-2.5 text-left text-white shadow-[3px_3px_0px_#1f2a44] disabled:opacity-70',
                                isCorrect && 'ring-4 ring-[#22c55e]',
                                isChoice && !isCorrect && 'mc-shake',
                            )}
                            style={{
                                background: OPTION_COLORS[index % 4],
                            }}
                        >
                            <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white font-display text-lg font-black text-[#1f2a44]">
                                {isCorrect ? (
                                    <Check
                                        className="size-5"
                                        aria-hidden="true"
                                    />
                                ) : isChoice ? (
                                    <X className="size-5" aria-hidden="true" />
                                ) : (
                                    LETTERS[index]
                                )}
                            </span>
                            <span className="min-w-0 flex-1 font-display text-base leading-tight font-black break-words sm:text-lg">
                                {text}
                            </span>
                        </button>
                    );
                })}
            </div>
            {result && !result.correct && (
                <p
                    className="text-center text-sm font-black text-[#AD1457]"
                    data-testid="mc-answer-wrong"
                >
                    {t('monsterCafe.player.wrongAnswer')}
                    {result.hint ? ` ${result.hint}` : ''}
                </p>
            )}
        </Panel>
    );
}

function Pantry({
    kitchen,
    trayCount,
    now,
    online,
    act,
    play,
}: {
    kitchen: MonsterCafeKitchen;
    trayCount: number;
    now: number;
    online: boolean;
    act: MonsterCafeSend;
    play: (sound: CafeSound) => void;
}) {
    const { t } = useTranslations();
    const names = useCafeNames();
    const cooldown =
        kitchen.cooldownAt > 0 ? Math.max(0, kitchen.cooldownAt - now) : 0;
    const total = Math.max(COOLDOWN_MS, kitchen.cooldown_ms);
    const full = trayCount >= TRAY_MAX;
    const needed = new Set(kitchen.orders.flatMap((o) => o.recipe));
    const asking = kitchen.question?.ingredient;
    return (
        <Panel
            className="relative flex flex-col gap-2 !p-3 sm:!p-4"
            testId="mc-pantry"
        >
            <h2 className="flex items-center justify-between gap-2 font-display text-base font-black">
                <span className="inline-flex items-center gap-1.5">
                    <ChefHat className="size-4" aria-hidden="true" />
                    {t('monsterCafe.player.pantry')}
                </span>
                <span className="text-xs font-bold text-slate-600">
                    {full
                        ? t('monsterCafe.player.trayFull')
                        : t('monsterCafe.player.pantryHint')}
                </span>
            </h2>
            <ul className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {PANTRY.map((ingredient) => (
                    <li key={ingredient} className="min-w-0">
                        <button
                            type="button"
                            disabled={!online || full || cooldown > 0}
                            onClick={() => {
                                if (
                                    act({
                                        t: 'request_ingredient',
                                        ingredient,
                                    })
                                ) {
                                    play('pick');
                                }
                            }}
                            data-testid={`mc-ingredient-${ingredient}`}
                            data-needed={
                                needed.has(ingredient) ? 'true' : 'false'
                            }
                            aria-pressed={asking === ingredient}
                            className={cn(
                                'mc-press flex min-h-16 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-[#1f2a44] bg-white p-1 shadow-[2px_2px_0px_#1f2a44] disabled:opacity-50',
                                needed.has(ingredient) && 'bg-[#fff7ed]',
                                asking === ingredient &&
                                    'bg-[#fed7aa] ring-4 ring-[#ea580c]/50',
                            )}
                        >
                            <IngredientIcon ingredient={ingredient} size={32} />
                            <span className="line-clamp-2 w-full text-center text-[10px] leading-tight font-black [overflow-wrap:anywhere] sm:text-xs">
                                {names.ingredient(ingredient)}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            {cooldown > 0 && (
                <div
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-3xl bg-white/85"
                    data-testid="mc-cooldown"
                    role="status"
                >
                    <CooldownRing fraction={cooldown / total} />
                    <p className="text-sm font-black">
                        {t('monsterCafe.player.cooldown', {
                            seconds: seconds(cooldown),
                        })}
                    </p>
                </div>
            )}
        </Panel>
    );
}

function CooldownRing({ fraction }: { fraction: number }) {
    const r = 20;
    const c = 2 * Math.PI * r;
    return (
        <svg viewBox="0 0 48 48" className="size-14" aria-hidden="true">
            <circle
                cx="24"
                cy="24"
                r={r}
                fill="none"
                stroke="#fecdd3"
                strokeWidth="6"
            />
            <circle
                cx="24"
                cy="24"
                r={r}
                fill="none"
                stroke="#be123c"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))}
                transform="rotate(-90 24 24)"
            />
        </svg>
    );
}

function Oven({
    kitchen,
    now,
    online,
    act,
}: {
    kitchen: MonsterCafeKitchen;
    now: number;
    online: boolean;
    act: MonsterCafeSend;
}) {
    const { t } = useTranslations();
    const names = useCafeNames();
    const oven = kitchen.oven;
    const cookLeft = Math.max(0, oven.readyAt - now);
    const burnLeft = Math.max(0, oven.burnAt - now);
    const cookTotal = 3000;
    const dish = oven.dish === '' ? 'MESS' : oven.dish;
    return (
        <Panel
            className={cn(
                'mc-oven flex min-w-0 flex-col gap-2 !p-3 sm:!p-4',
                oven.state === 'READY' && 'bg-[#fef9c3]',
                oven.state === 'BURNT' && 'bg-[#e5e7eb]',
            )}
            testId="mc-oven"
            dataState={oven.state}
        >
            <h2 className="flex items-center justify-between gap-2 font-display text-base font-black">
                <span className="inline-flex items-center gap-1.5">
                    <CookingPot className="size-4" aria-hidden="true" />
                    {t('monsterCafe.player.oven')}
                </span>
                <span
                    className="rounded-full border-2 border-[#1f2a44] bg-white px-2 py-0.5 text-xs font-black"
                    data-testid="mc-oven-state"
                    data-state={oven.state}
                >
                    {t(`monsterCafe.common.oven.${oven.state}`)}
                </span>
            </h2>
            <div className="flex min-h-24 items-center justify-center">
                {oven.state === 'EMPTY' ? (
                    <p className="text-center text-xs font-bold text-slate-600">
                        {t('monsterCafe.player.ovenEmpty')}
                    </p>
                ) : (
                    <DishView
                        dish={dish}
                        items={oven.items}
                        burnt={oven.state === 'BURNT'}
                        size={96}
                        className={cn(
                            oven.state === 'COOKING' && 'mc-cooking',
                            oven.state === 'READY' && 'mc-ready',
                        )}
                    />
                )}
            </div>
            {oven.state === 'COOKING' && (
                <div
                    className="h-3 w-full overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white"
                    role="progressbar"
                    aria-label={t('monsterCafe.player.cooking', {
                        dish: names.dish(dish),
                    })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((1 - cookLeft / cookTotal) * 100)}
                >
                    <div
                        className="mc-bar h-full bg-[#ea580c]"
                        style={{
                            width: `${Math.min(100, (1 - cookLeft / cookTotal) * 100)}%`,
                        }}
                    />
                </div>
            )}
            {oven.state === 'READY' && (
                <>
                    <p
                        className="mc-blink text-center text-sm font-black text-[#be123c]"
                        data-testid="mc-burn-countdown"
                    >
                        {t('monsterCafe.player.burnIn', {
                            seconds: seconds(burnLeft),
                        })}
                    </p>
                    <Button
                        onClick={() => act({ t: 'take_out' })}
                        disabled={!online || kitchen.dish !== null}
                        data-testid="mc-take-out"
                        className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-[#15803d] font-black text-white shadow-[2px_2px_0px_#1f2a44] hover:bg-[#166534]"
                    >
                        <HandPlatter className="size-4" aria-hidden="true" />
                        {t('monsterCafe.player.takeOut')}
                    </Button>
                </>
            )}
            {oven.state === 'BURNT' && (
                <Button
                    onClick={() => act({ t: 'discard' })}
                    disabled={!online}
                    data-testid="mc-discard"
                    className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-[#111827] font-black text-white shadow-[2px_2px_0px_#1f2a44]"
                >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {t('monsterCafe.player.discardBurnt')}
                </Button>
            )}
        </Panel>
    );
}

function HeldDish({
    kitchen,
    online,
    act,
}: {
    kitchen: MonsterCafeKitchen;
    online: boolean;
    act: MonsterCafeSend;
}) {
    const { t } = useTranslations();
    const names = useCafeNames();
    const dish = kitchen.dish;
    return (
        <Panel
            className="flex min-w-0 flex-col gap-2 !p-3 sm:!p-4"
            testId="mc-held"
        >
            <h2 className="flex items-center justify-between gap-2 font-display text-base font-black">
                <span className="inline-flex items-center gap-1.5">
                    <HandPlatter className="size-4" aria-hidden="true" />
                    {t('monsterCafe.player.held')}
                </span>
                {dish && (
                    <span className="text-xs font-bold text-slate-600">
                        {names.dish(dish.dish)}
                    </span>
                )}
            </h2>
            <div className="flex min-h-24 items-center justify-center">
                {dish ? (
                    <DishView dish={dish.dish} items={dish.items} size={96} />
                ) : (
                    <p className="text-center text-xs font-bold text-slate-600">
                        {t('monsterCafe.player.heldEmpty')}
                    </p>
                )}
            </div>
            {dish && (
                <>
                    <p className="text-center text-xs font-bold text-slate-700">
                        {t('monsterCafe.player.serveHint')}
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'discard' })}
                        disabled={!online}
                        data-testid="mc-discard-dish"
                        className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white font-black text-[#1f2a44]"
                    >
                        <Trash2 className="size-4" aria-hidden="true" />
                        {t('monsterCafe.player.discardDish')}
                    </Button>
                </>
            )}
        </Panel>
    );
}

/** Solo kitchen settings: duration, subject and a big start button. */
function SoloLobby({
    state,
    status,
    error,
    online,
    act,
    leave,
}: {
    state: MonsterCafeState;
    status: MonsterCafeStatus;
    error: string | null;
    online: boolean;
    act: MonsterCafeSend;
    leave: ReactNode;
}) {
    const { t } = useTranslations();
    const subject = isGameSubject(state.subject) ? state.subject : MIX_SUBJECT;
    return (
        <Panel
            className="mx-auto flex w-full max-w-xl flex-col gap-4"
            testId="mc-solo-lobby"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="inline-flex items-center gap-2 font-display text-xl font-black">
                    <ChefHat
                        className="size-6 text-[#ea580c]"
                        aria-hidden="true"
                    />
                    {t('monsterCafe.player.soloTitle')}
                </h2>
                <ConnectionBadge status={status} />
            </div>
            <p className="text-sm font-bold text-slate-700">
                {t('monsterCafe.player.soloIntro')}
            </p>
            <fieldset className="flex flex-col gap-2" disabled={!online}>
                <legend className="mb-1 text-sm font-black">
                    {t('monsterCafe.player.soloDuration')}
                </legend>
                <div
                    className="grid grid-cols-5 gap-2"
                    role="group"
                    data-testid="mc-solo-minutes"
                >
                    {state.minutes_options.map((minutes) => (
                        <button
                            key={minutes}
                            type="button"
                            onClick={() => act({ t: 'configure', minutes })}
                            aria-pressed={state.minutes === minutes}
                            data-testid={`mc-solo-minutes-${minutes}`}
                            className={cn(
                                'mc-press flex min-h-14 flex-col items-center justify-center rounded-2xl border-3 border-[#1f2a44] font-display font-black shadow-[3px_3px_0px_#1f2a44]',
                                state.minutes === minutes
                                    ? 'bg-[#ea580c] text-white'
                                    : 'bg-white text-[#1f2a44]',
                            )}
                        >
                            <span className="text-2xl leading-none">
                                {minutes}
                            </span>
                            <span className="text-xs">
                                {t('monsterCafe.player.soloMinuteUnit')}
                            </span>
                        </button>
                    ))}
                </div>
            </fieldset>
            <SubjectPicker
                value={subject}
                onChange={(value) => act({ t: 'set_subject', subject: value })}
                disabled={!online}
                compact
            />
            {error && <RoomError code={error} />}
            <Button
                onClick={() => act({ t: 'start_game' })}
                disabled={!online}
                data-testid="mc-solo-start"
                className="h-auto min-h-14 w-full rounded-2xl border-3 border-[#1f2a44] bg-[#ea580c] px-6 font-display text-xl font-black whitespace-normal text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#c2410c] disabled:bg-[#fed7aa] disabled:text-[#1f2a44] disabled:opacity-100"
            >
                <Play className="size-6 shrink-0" aria-hidden="true" />
                {t('monsterCafe.player.soloStart', { count: state.minutes })}
            </Button>
            {leave}
        </Panel>
    );
}

/** Solo: end the run now (with confirmation) or leave the kitchen. */
function SoloEndControl({
    playing,
    online,
    act,
}: {
    playing: boolean;
    online: boolean;
    act: MonsterCafeSend;
}) {
    const { t } = useTranslations();
    const [confirm, setConfirm] = useState(false);
    if (!playing) {
        return (
            <Button
                variant="ghost"
                onClick={() => {
                    act({ t: 'leave_room' });
                    router.visit('/games/monster-cafe');
                }}
                data-testid="mc-leave"
                className="min-h-11 self-center rounded-xl border-2 border-[#1f2a44]/20 bg-white/70 px-4 text-xs font-bold text-slate-700"
            >
                <DoorOpen className="size-4" aria-hidden="true" />
                {t('monsterCafe.player.soloLeave')}
            </Button>
        );
    }
    if (!confirm) {
        return (
            <Button
                variant="ghost"
                onClick={() => setConfirm(true)}
                disabled={!online}
                data-testid="mc-solo-end"
                className="min-h-11 self-center rounded-xl border-2 border-[#1f2a44]/20 bg-white/70 px-4 text-xs font-bold text-slate-700"
            >
                <OctagonX className="size-4" aria-hidden="true" />
                {t('monsterCafe.player.soloEnd')}
            </Button>
        );
    }
    return (
        <div
            role="alertdialog"
            aria-label={t('monsterCafe.player.soloEndConfirm')}
            className="flex flex-col items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-3 text-center"
            data-testid="mc-solo-end-dialog"
        >
            <p className="text-sm font-black">
                {t('monsterCafe.player.soloEndConfirm')}
            </p>
            <div className="grid w-full grid-cols-2 gap-2">
                <Button
                    variant="outline"
                    onClick={() => setConfirm(false)}
                    data-testid="mc-solo-end-cancel"
                    className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white font-black text-[#1f2a44]"
                >
                    {t('monsterCafe.player.soloEndCancel')}
                </Button>
                <Button
                    onClick={() => {
                        setConfirm(false);
                        act({ t: 'end_game' });
                    }}
                    data-testid="mc-solo-end-confirm"
                    className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-[#be123c] font-black text-white hover:bg-[#9f1239]"
                >
                    {t('monsterCafe.player.soloEndNow')}
                </Button>
            </div>
        </div>
    );
}
