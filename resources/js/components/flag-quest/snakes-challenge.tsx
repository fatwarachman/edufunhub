import MiniSnakesBoard from '@/components/flag-quest/mini-snakes-board';
import { useTranslations } from '@/hooks/use-translations';
import type { ChallengeState } from '@/lib/flag-quest/world';
import {
    Dice1,
    Dice2,
    Dice3,
    Dice4,
    Dice5,
    Dice6,
    Sparkles,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
const SHUFFLE_TICKS = 12;
const SHUFFLE_MS = 85;
const REVEAL_MS = 650;
const STEP_MS = 310;
const JUMP_DELAY_MS = 250;
const JUMP_MS = 600;

type Sound = 'dice' | 'step' | 'correct' | 'wrong';

interface Props {
    challenge: ChallengeState;
    look: { color: string; accessory: string };
    onRoll: () => void;
    onSound?: (sound: Sound) => void;
    question: ReactNode;
    done: ReactNode;
}

/**
 * Snakes & ladders challenge with the same flow as /games/snakes-and-ladders:
 * shake the dice (centre overlay), answer to earn the move, then the pawn walks
 * tile by tile and rides ladders / slides down snakes. Server stays authoritative;
 * this component only animates the positions it reports.
 */
export default function SnakesChallenge({
    challenge,
    look,
    onRoll,
    onSound,
    question,
    done,
}: Props) {
    const { t } = useTranslations();
    const board = challenge.board!;
    const [displayPos, setDisplayPos] = useState(board.position);
    const [moving, setMoving] = useState(false);
    const [jumping, setJumping] = useState(false);
    const [shaking, setShaking] = useState(false);
    const [overlay, setOverlay] = useState(false);
    const [face, setFace] = useState(1);
    const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    const soundRef = useRef(onSound);
    const pendingRollRef = useRef(board.pending_roll);
    const animatedFor = useRef<number>(challenge.receivedAt);

    useEffect(() => {
        soundRef.current = onSound;
        pendingRollRef.current = board.pending_roll;
    }, [onSound, board.pending_roll]);

    useEffect(() => {
        const set = timers.current;
        return () => {
            set.forEach(clearTimeout);
            set.clear();
        };
    }, []);

    const later = (fn: () => void, ms: number) => {
        const id = setTimeout(() => {
            timers.current.delete(id);
            fn();
        }, ms);
        timers.current.add(id);
    };

    // Dice shuffle: runs at least SHUFFLE_TICKS frames, then lands on the server roll.
    useEffect(() => {
        if (!shaking) {
            return;
        }
        let ticks = 0;
        let stopped = false;
        const tick = () => {
            if (stopped) {
                return;
            }
            ticks++;
            setFace(1 + Math.floor(Math.random() * 6));
            soundRef.current?.('dice');
            const serverRoll = pendingRollRef.current;
            if (ticks >= SHUFFLE_TICKS && serverRoll > 0) {
                setFace(serverRoll);
                setShaking(false);
                later(() => setOverlay(false), REVEAL_MS);
                return;
            }
            later(tick, SHUFFLE_MS);
        };
        later(tick, SHUFFLE_MS);
        return () => {
            stopped = true;
        };
    }, [shaking]);

    // Pawn animation after a correct answer: walk step by step, then ladder/snake.
    useEffect(() => {
        if (animatedFor.current === challenge.receivedAt) {
            return;
        }
        animatedFor.current = challenge.receivedAt;
        const { move_from: from, move_landing: landing, position } = board;
        if (from === landing && landing === position) {
            later(() => setDisplayPos(position), 0);
            return;
        }
        let current = from;
        later(() => {
            setDisplayPos(from);
            setMoving(true);
        }, 0);
        const step = () => {
            if (current < landing) {
                current++;
                setDisplayPos(current);
                soundRef.current?.('step');
                later(step, STEP_MS);
                return;
            }
            if (position !== landing) {
                later(() => {
                    setMoving(false);
                    setJumping(true);
                    setDisplayPos(position);
                    soundRef.current?.(
                        position > landing ? 'correct' : 'wrong',
                    );
                    later(() => setJumping(false), JUMP_MS);
                }, JUMP_DELAY_MS);
                return;
            }
            setMoving(false);
        };
        later(step, 150);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [challenge.receivedAt]);

    const animating = moving || jumping || displayPos !== board.position;
    const busy = overlay || animating;
    const DiceIcon = DICE_ICONS[face - 1] ?? Dice1;

    const roll = () => {
        if (busy || challenge.phase !== 'roll') {
            return;
        }
        setOverlay(true);
        setShaking(true);
        onRoll();
    };

    return (
        <div className="flex flex-col gap-3 [@media(max-height:500px)_and_(orientation:landscape)]:grid [@media(max-height:500px)_and_(orientation:landscape)]:grid-cols-[auto_1fr] [@media(max-height:500px)_and_(orientation:landscape)]:items-start">
            <MiniSnakesBoard
                size={board.size}
                cols={board.cols}
                jumps={board.jumps}
                position={displayPos}
                look={look}
                moving={moving}
                jumping={jumping}
            />
            <div className="flex min-w-0 flex-col gap-3">
                <p
                    className="text-center text-xs font-semibold"
                    role="status"
                    data-testid="fq-snakes-status"
                >
                    {board.last_roll > 0 &&
                        t('flagQuest.challenge.rolled', {
                            roll: board.last_roll,
                        })}{' '}
                    {!animating &&
                        board.last_jump > 0 &&
                        t(
                            board.last_jump > board.move_landing
                                ? 'flagQuest.challenge.climbed'
                                : 'flagQuest.challenge.slid',
                            { from: board.move_landing, to: board.last_jump },
                        )}{' '}
                    {t('flagQuest.challenge.turnsLeft', {
                        count: Math.max(board.max_turns - board.turns, 0),
                    })}
                </p>

                {challenge.phase === 'roll' && !busy && (
                    <button
                        type="button"
                        onClick={roll}
                        className="fq-primary flex min-h-12 items-center justify-center gap-2 text-lg"
                        data-testid="fq-roll"
                        autoFocus
                    >
                        <Dice5 className="size-6" />
                        {t('flagQuest.challenge.roll')}
                    </button>
                )}
                {challenge.phase === 'question' && !busy && (
                    <>
                        <p className="rounded-xl border-2 border-[#151b2e] bg-[#fff4cc] px-3 py-2 text-center text-sm font-bold">
                            {t('flagQuest.challenge.answerToMove', {
                                roll: board.pending_roll,
                            })}
                        </p>
                        {question}
                    </>
                )}
                {challenge.phase === 'done' && !busy && done}
            </div>

            {overlay && (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                    role="alertdialog"
                    aria-live="assertive"
                    data-testid="fq-dice-overlay"
                >
                    <div className="flex w-full max-w-xs flex-col items-center rounded-3xl border-4 border-[#151b2e] bg-[#FFF9E6] p-6 text-center shadow-[8px_8px_0_#151b2e]">
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#151b2e] bg-[#FFF176] px-3 py-1 text-xs font-black">
                            <Sparkles className="size-3.5 text-[#FF9E44]" />
                            {t('flagQuest.challenge.shaking')}
                        </span>
                        <div
                            className={`my-5 flex size-28 items-center justify-center rounded-3xl border-4 border-[#151b2e] shadow-[6px_6px_0_#151b2e] transition-all duration-100 ${
                                shaking
                                    ? 'scale-110 rotate-12 animate-pulse bg-[#FFF176]'
                                    : 'scale-105 bg-[#00C9A7]'
                            }`}
                            data-testid="fq-dice-face"
                            data-face={face}
                        >
                            <DiceIcon className="size-16 stroke-[2.5] text-[#151b2e]" />
                        </div>
                        <p className="text-2xl font-black">
                            {shaking
                                ? t('flagQuest.challenge.spinning')
                                : t('flagQuest.challenge.diceResult', {
                                      roll: face,
                                  })}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-600">
                            {shaking
                                ? t('flagQuest.challenge.getReady')
                                : t('flagQuest.challenge.openingQuestion')}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
