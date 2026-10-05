import AdSlot from '@/components/ads/ad-slot';
import { IllustratedSnakesBoard } from '@/components/illustrated-snakes-board';
import { PlayerAvatar, avatarTint } from '@/components/player-avatar';
import {
    BoardLegend,
    DiceDialog,
    MoveLog,
    PlayerList,
    QuestionDialog,
} from '@/components/snakes/shared';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/hooks/use-translations';
import { AdMoment } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import {
    BOARD_LADDERS as LADDERS,
    BOARD_SNAKES as SNAKES,
    walkPath,
} from '@/lib/snakes-board';
import {
    OFFLINE_QUESTIONS,
    type OfflineQuestion,
} from '@/lib/snakes-questions';
import { cn } from '@/lib/utils';
import { Gamepad2, Shuffle, Trophy, Users } from 'lucide-react';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';

interface Player {
    id: number;
    name: string;
    position: number;
    skinIndex: number;
    character?: CharacterLook | null;
    score: number;
}

type Sound = 'dice' | 'correct' | 'step' | 'wrong';

export interface LocalGameHandle {
    reset: () => void;
}

const PLAYER_COUNTS = [1, 2, 3, 4] as const;

/**
 * Ular Tangga on one device: 1 player alone, or 2–4 players taking turns.
 * Only the chosen number of characters is placed on the board.
 */
export const LocalGame = forwardRef<
    LocalGameHandle,
    {
        firstName: string | null;
        character?: CharacterLook | null;
        play: (sound: Sound) => void;
        muted?: boolean;
    }
>(function LocalGame({ firstName, character, play, muted = false }, ref) {
    const { t } = useTranslations();
    const generation = useRef(0);
    const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    useEffect(
        () => () => {
            generation.current++;
            timers.current.forEach(clearTimeout);
            timers.current.clear();
        },
        [],
    );
    const later = (fn: () => void, delay: number) => {
        const epoch = generation.current;
        const timer = setTimeout(() => {
            timers.current.delete(timer);
            if (generation.current === epoch) {
                fn();
            }
        }, delay);
        timers.current.add(timer);
    };

    const makePlayers = (count: number): Player[] =>
        Array.from({ length: count }, (_, id) => ({
            id,
            name:
                id === 0 && firstName
                    ? firstName
                    : t('snakes.players.default', { number: id + 1 }),
            position: 1,
            skinIndex: id,
            character: id === 0 ? character : null,
            score: 0,
        }));

    const [numPlayers, setNumPlayers] = useState(1);
    const [players, setPlayers] = useState<Player[]>(() => makePlayers(1));
    const [turn, setTurn] = useState(0);
    const [dice, setDice] = useState(1);
    const [rolling, setRolling] = useState(false);
    const [showDice, setShowDice] = useState(false);
    const [moving, setMoving] = useState(false);
    const [winnerId, setWinnerId] = useState<number | null>(null);
    const [question, setQuestion] = useState<OfflineQuestion | null>(null);
    const [target, setTarget] = useState(1);
    const [choice, setChoice] = useState<number | null>(null);
    const [log, setLog] = useState<string[]>(() => [
        t('snakes.log.welcomeHint'),
        t('snakes.log.welcome'),
    ]);

    const current = players[turn] ?? players[0];
    const winner = players.find((p) => p.id === winnerId) ?? null;
    const addLog = (message: string) =>
        setLog((previous) => [message, ...previous.slice(0, 5)]);
    const busy =
        rolling || moving || question !== null || winner !== null || showDice;

    const restart = (count: number) => {
        generation.current++;
        timers.current.forEach(clearTimeout);
        timers.current.clear();
        setNumPlayers(count);
        setPlayers(makePlayers(count));
        setTurn(0);
        setDice(1);
        setRolling(false);
        setShowDice(false);
        setMoving(false);
        setWinnerId(null);
        setQuestion(null);
        setChoice(null);
        setLog([t('snakes.log.newGame')]);
    };

    useImperativeHandle(ref, () => ({ reset: () => restart(numPlayers) }));

    const nextTurn = () => setTurn((previous) => (previous + 1) % numPlayers);

    const rollDice = () => {
        if (busy) {
            return;
        }
        play('dice');
        setShowDice(true);
        setRolling(true);
        let count = 0;
        const tick = () => {
            const value = Math.floor(Math.random() * 6) + 1;
            setDice(value);
            play('dice');
            if (++count < 12) {
                later(tick, 85);
                return;
            }
            setRolling(false);
            const path = walkPath(current.position, value);
            setTarget(path[path.length - 1]);
            later(() => {
                setShowDice(false);
                setQuestion(
                    OFFLINE_QUESTIONS[
                        Math.floor(Math.random() * OFFLINE_QUESTIONS.length)
                    ],
                );
                setChoice(null);
                addLog(t('snakes.log.rolled', { name: current.name, value }));
            }, 650);
        };
        later(tick, 85);
    };

    const setPosition = (position: number, bonus = 0) => {
        setPlayers((previous) =>
            previous.map((p) =>
                p.id === current.id
                    ? { ...p, position, score: p.score + bonus }
                    : p,
            ),
        );
        play('step');
    };

    const finishMove = (position: number) => {
        setMoving(false);
        if (position === 100) {
            setWinnerId(current.id);
            setPlayers((previous) =>
                previous.map((p) =>
                    p.id === current.id ? { ...p, score: p.score + 100 } : p,
                ),
            );
            play('correct');
        } else if (dice === 6) {
            addLog(t('snakes.turn.extra', { name: current.name }));
        } else {
            nextTurn();
        }
    };

    const walk = () => {
        setMoving(true);
        const path = walkPath(current.position, dice);
        const step = (index: number) => {
            if (index < path.length) {
                setPosition(path[index]);
                later(() => step(index + 1), 310);
                return;
            }
            const landing = path[path.length - 1];
            const destination = LADDERS[landing] ?? SNAKES[landing];
            if (destination) {
                const ladder = Boolean(LADDERS[landing]);
                addLog(
                    t(ladder ? 'snakes.log.ladder' : 'snakes.log.snake', {
                        name: current.name,
                        from: landing,
                        to: destination,
                    }),
                );
                later(() => {
                    setPosition(destination, ladder ? 50 : 0);
                    later(() => finishMove(destination), 600);
                }, 250);
            } else {
                finishMove(landing);
            }
        };
        later(() => step(0), 150);
    };

    const answer = (option: number) => {
        if (!question || choice !== null) {
            return;
        }
        const correct = option === question.answer;
        setChoice(option);
        play(correct ? 'correct' : 'wrong');
        if (correct) {
            setPlayers((previous) =>
                previous.map((p) =>
                    p.id === current.id ? { ...p, score: p.score + 100 } : p,
                ),
            );
        }
        addLog(
            t(correct ? 'snakes.log.correct' : 'snakes.log.wrong', {
                name: current.name,
            }),
        );
        later(() => {
            setQuestion(null);
            setChoice(null);
            if (correct) {
                walk();
            } else {
                nextTurn();
            }
        }, 2400);
    };

    return (
        <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]">
                <div className="flex flex-wrap items-center gap-2">
                    <Users className="h-5 w-5 text-[#FF9E44]" />
                    <span className="text-sm font-black text-[#1f2a44]">
                        {t('snakes.players.label')}:
                    </span>
                    <div
                        className="flex flex-wrap gap-2"
                        role="group"
                        aria-label={t('snakes.players.label')}
                    >
                        {PLAYER_COUNTS.map((count) => (
                            <button
                                key={count}
                                type="button"
                                aria-pressed={numPlayers === count}
                                onClick={() => restart(count)}
                                data-testid={`snakes-count-${count}`}
                                className={cn(
                                    'min-h-11 cursor-pointer rounded-xl border-2 border-[#1f2a44] px-3.5 text-xs font-black transition-all',
                                    numPlayers === count
                                        ? 'bg-[#FF9E44] text-white shadow-[2px_2px_0px_#1f2a44]'
                                        : 'bg-white text-[#1f2a44] hover:bg-slate-50',
                                )}
                            >
                                {t('snakes.players.count', { count })}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500">
                        {t('snakes.turn.label')}:
                    </span>
                    <div
                        className="flex items-center gap-2 rounded-2xl border-3 border-[#1f2a44] px-3.5 py-1.5 font-display text-xs font-black text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44]"
                        style={{
                            backgroundColor: avatarTint(
                                current.character,
                                current.skinIndex,
                            ),
                        }}
                        data-testid="snakes-turn"
                    >
                        <div className="size-8">
                            <PlayerAvatar
                                character={current.character}
                                seat={current.skinIndex}
                            />
                        </div>
                        <span>{current.name}</span>
                        <span className="rounded-md border border-[#1f2a44] bg-white px-1.5 py-0.5 text-[10px]">
                            {t('snakes.players.square', {
                                square: current.position,
                            })}
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-8">
                    <div className="relative mx-auto w-full max-w-[min(100%,calc(100dvh-240px))] rounded-3xl border-3 border-[#1f2a44] bg-white p-2 shadow-[5px_5px_0px_#1f2a44]">
                        <IllustratedSnakesBoard
                            players={players}
                            moving={moving}
                            activeId={current.id}
                        />
                        <BoardLegend />
                    </div>
                </div>

                <div className="flex flex-col gap-4 lg:col-span-4 lg:max-h-[calc(100dvh-200px)] lg:overflow-y-auto lg:pr-2">
                    <div className="rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[5px_5px_0px_#1f2a44] sm:p-5">
                        <div className="flex items-center justify-between border-b-2 border-[#1f2a44]/10 pb-3">
                            <div className="flex items-center gap-2">
                                <Gamepad2 className="h-5 w-5 text-[#FF9E44]" />
                                <span className="font-display text-base font-black text-[#1f2a44]">
                                    {t('snakes.dice.title')}
                                </span>
                            </div>
                            <span className="truncate rounded-full border border-[#1f2a44] bg-[#FFFDE6] px-2.5 py-0.5 text-xs font-bold">
                                {current.name}
                            </span>
                        </div>

                        <Button
                            onClick={rollDice}
                            disabled={busy}
                            data-testid="snakes-roll"
                            className="mx-auto mt-5 flex min-h-12 cursor-pointer rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-0.5 hover:bg-[#ff8f29] hover:shadow-[6px_6px_0px_#1f2a44] active:translate-y-0 active:shadow-[2px_2px_0px_#1f2a44] disabled:opacity-50"
                        >
                            <Shuffle className="h-5 w-5" />
                            {rolling || showDice
                                ? t('snakes.dice.rolling')
                                : moving
                                  ? t('snakes.dice.moving')
                                  : t('snakes.dice.roll')}
                        </Button>

                        <div className="mt-5 border-t-2 border-[#1f2a44]/10 pt-4">
                            <PlayerList
                                players={players}
                                turnId={winner ? null : current.id}
                            />
                        </div>
                    </div>

                    {winner && (
                        <div
                            className="rounded-3xl border-3 border-[#1f2a44] bg-[#FFF176] p-6 text-center shadow-[6px_6px_0px_#1f2a44]"
                            data-testid="snakes-winner"
                        >
                            <Trophy className="mx-auto h-16 w-16 text-[#FF9E44]" />
                            <h2 className="mt-2 font-display text-2xl font-black text-[#1f2a44]">
                                {t('snakes.winner.title', {
                                    name: winner.name,
                                })}
                            </h2>
                            <p className="mt-1 text-xs font-bold text-slate-700">
                                {t('snakes.winner.summary', {
                                    score: winner.score,
                                })}
                            </p>
                            <Button
                                onClick={() => restart(numPlayers)}
                                className="mt-4 min-h-11 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-6 font-display text-sm font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                            >
                                {t('snakes.winner.again')}
                            </Button>
                            <AdMoment moment="win" muted={muted} />
                            <AdSlot
                                placement="arena.result"
                                className="mx-auto mt-4 max-w-md"
                            />
                        </div>
                    )}

                    <AdSlot placement="arena.sidebar" />
                    <MoveLog entries={log} />
                </div>
            </div>

            {showDice && (
                <DiceDialog
                    name={current.name}
                    value={dice}
                    rolling={rolling}
                />
            )}
            {question && (
                <QuestionDialog
                    name={current.name}
                    skinIndex={current.skinIndex}
                    character={current.character}
                    question={{
                        subject: question.subject,
                        level: question.level,
                        text: question.question,
                        options: question.options,
                    }}
                    dice={dice}
                    target={target}
                    choice={choice}
                    answer={choice === null ? null : question.answer}
                    outcome={
                        choice === null
                            ? null
                            : choice === question.answer
                              ? 'correct'
                              : 'wrong'
                    }
                    hint={choice === null ? undefined : question.explanation}
                    canAnswer
                    onAnswer={answer}
                />
            )}
        </>
    );
});
