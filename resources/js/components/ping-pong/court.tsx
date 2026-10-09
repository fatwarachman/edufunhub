import { PlayerAvatar } from '@/components/player-avatar';
import { type PingPongSeat } from '@/hooks/use-ping-pong';
import { useTranslations } from '@/hooks/use-translations';
import './ping-pong.css';

export function Court({
    players = [],
    goals,
    turn,
    round,
    goal = false,
}: {
    players?: PingPongSeat[];
    goals: [number, number];
    turn: number;
    round: number;
    goal?: boolean;
}) {
    const { t } = useTranslations();
    return (
        <div className="pp-court-wrap">
            <div
                className="pp-scoreboard"
                aria-label={t('pingPong.scoreboard')}
            >
                {[0, 1].map((seat) => (
                    <div
                        key={seat}
                        className="pp-player"
                        data-active={turn === seat}
                    >
                        <span className="pp-avatar">
                            <PlayerAvatar
                                character={
                                    players.find((p) => p.seat === seat)
                                        ?.character
                                }
                                seat={seat}
                            />
                        </span>
                        <span className="pp-player-name">
                            {(players.find((p) => p.seat === seat)?.bot
                                ? t('pingPong.bot')
                                : players.find((p) => p.seat === seat)?.name) ??
                                t(seat === 0 ? 'pingPong.you' : 'pingPong.bot')}
                        </span>
                        <strong className="pp-score">{goals[seat]}</strong>
                    </div>
                ))}
            </div>
            <div
                className="pp-court"
                role="img"
                aria-label={t('pingPong.courtLabel', {
                    left: goals[0],
                    right: goals[1],
                })}
            >
                <span className="pp-net" />
                <span className="pp-center-line" />
                <span className="pp-paddle pp-paddle-left" />
                <span className="pp-paddle pp-paddle-right" />
                <span
                    key={`${round}-${turn}-${goal}`}
                    className={`pp-ball ${turn === 0 ? 'pp-ball-left' : 'pp-ball-right'} ${goal ? 'pp-ball-goal' : ''}`}
                />
                <span className="pp-court-mark">{t('pingPong.courtMark')}</span>
            </div>
        </div>
    );
}

/** Live question: subject chip + text; long text wraps instead of clipping. */
export function QuestionCard({
    text,
    subject,
}: {
    text: string;
    subject?: string;
}) {
    const { t } = useTranslations();
    return (
        <div className="pp-question" data-testid="pp-question">
            <div className="pp-question-meta">
                <p>{t('pingPong.question')}</p>
                {subject && <span className="pp-subject-chip">{subject}</span>}
            </div>
            <h2>{text}</h2>
        </div>
    );
}

/** 2–4 answer buttons; the index sent is the displayed option index. */
export function OptionPads({
    options,
    disabled = false,
    selected,
    correct,
    onChoose,
}: {
    options: string[];
    disabled?: boolean;
    selected?: number;
    correct?: number;
    onChoose?: (option: number) => void;
}) {
    const { t } = useTranslations();
    return (
        <div
            className="pp-pads"
            role="group"
            aria-label={t('pingPong.chooseOption')}
        >
            {options.map((option, index) => (
                <button
                    type="button"
                    key={index}
                    className="pp-pad"
                    disabled={disabled}
                    aria-pressed={selected === index}
                    data-correct={correct === index ? 'true' : undefined}
                    onClick={() => onChoose?.(index)}
                    data-testid={`pp-option-${index}`}
                >
                    <span aria-hidden="true">
                        {String.fromCharCode(65 + index)}
                    </span>
                    <strong>{option}</strong>
                </button>
            ))}
        </div>
    );
}
