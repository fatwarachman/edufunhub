import { PlayerAvatar } from '@/components/player-avatar';
import {
    OptionContent,
    optionImage,
    type OptionMediaData,
    QuestionMedia,
    type QuestionMediaData,
} from '@/components/question-media';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { leadingTeam, ropeShift, TEAM_BLUE, TEAM_RED } from '@/lib/tug-of-war';
import { cn } from '@/lib/utils';
import { Check, Crown, X } from 'lucide-react';
import { type CSSProperties } from 'react';
import './tug-of-war.css';

export const ACCENT = '#9333ea';
export const BG = '#f8f3ff';
export const TEAM_COLORS = ['#be123c', '#2563eb'] as const;

/** A figure on the rope (player seat, computer or tutorial demo). */
export interface RopePuller {
    key: string | number;
    name: string;
    team: number;
    seat: number;
    character?: CharacterLook | null;
    userId?: number;
    pulls?: number;
    mvp?: boolean;
    answered?: boolean;
    you?: boolean;
}

/**
 * The tug of war field: both teams hold one rope; the whole rig slides
 * toward the team that pulls. `rope` < 0 = toward red (left), > 0 = blue.
 * `pull` is the team that just pulled (lean animation), -1 for none.
 */
export function RopeField({
    pullers,
    rope,
    winSteps,
    pull = -1,
    winner = null,
    pullKey,
    big = false,
}: {
    pullers: RopePuller[];
    rope: number;
    winSteps: number;
    pull?: number;
    winner?: number | null;
    pullKey?: string | number;
    big?: boolean;
}) {
    const { t } = useTranslations();
    const lead = leadingTeam(rope);
    const label = t('tugOfWar.ropeLabel', {
        lead:
            lead < 0
                ? t('tugOfWar.ropeEven')
                : t('tugOfWar.ropeLead', {
                      team: t(`tugOfWar.team.${lead}`),
                      steps: Math.abs(rope),
                  }),
    });
    const teams = [TEAM_RED, TEAM_BLUE].map((team) =>
        pullers.filter((p) => p.team === team),
    );
    const crowd = Math.max(teams[0].length, teams[1].length);
    return (
        <div
            className="tw-field"
            data-big={big}
            data-crowd={crowd > 6 ? 'large' : crowd > 3 ? 'medium' : 'small'}
            role="img"
            aria-label={label}
            data-testid="tw-field"
            data-rope={rope}
            style={
                {
                    '--tw-shift': ropeShift(rope, winSteps),
                } as CSSProperties
            }
        >
            <span className="tw-ground" aria-hidden="true" />
            <span className="tw-mid" aria-hidden="true" />
            <span className="tw-goal tw-goal-red" aria-hidden="true" />
            <span className="tw-goal tw-goal-blue" aria-hidden="true" />
            <div className="tw-steps" aria-hidden="true">
                {Array.from({ length: winSteps * 2 + 1 }, (_, i) => {
                    const step = i - winSteps;
                    return (
                        <span
                            key={step}
                            data-active={step === rope}
                            data-side={step < 0 ? 0 : step > 0 ? 1 : -1}
                        />
                    );
                })}
            </div>
            <div
                key={pullKey}
                className="tw-rig"
                data-pull={pull}
                data-winner={winner ?? -1}
            >
                <span className="tw-rope" aria-hidden="true" />
                <span className="tw-flag" aria-hidden="true">
                    <span />
                </span>
                {teams.map((members, team) => (
                    <div
                        key={team}
                        className="tw-team"
                        data-team={team}
                        data-pulling={pull === team}
                    >
                        {members.map((p, index) => (
                            <figure
                                key={p.key}
                                className="tw-puller"
                                data-you={p.you ? 'true' : undefined}
                                data-answered={p.answered ? 'true' : undefined}
                                style={
                                    {
                                        '--tw-i': index,
                                    } as CSSProperties
                                }
                                title={p.name}
                                data-testid="tw-puller"
                            >
                                <span className="tw-avatar">
                                    <PlayerAvatar
                                        character={p.character}
                                        seat={p.seat}
                                        userId={p.userId}
                                    />
                                    {p.mvp && (
                                        <Crown
                                            className="tw-crown"
                                            aria-hidden="true"
                                        />
                                    )}
                                </span>
                                <figcaption>
                                    <span className="tw-name">{p.name}</span>
                                    {(p.pulls ?? 0) > 0 && (
                                        <span className="tw-pulls">
                                            {p.pulls}
                                        </span>
                                    )}
                                </figcaption>
                            </figure>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Team score strip above the field. */
export function TeamBar({
    teams,
    rope,
    winSteps,
    you,
}: {
    teams: { team: number; size: number; pulls: number; points: number }[];
    rope: number;
    winSteps: number;
    you?: number;
}) {
    const { t } = useTranslations();
    return (
        <div className="tw-teambar">
            {[TEAM_RED, TEAM_BLUE].map((team) => {
                const row = teams.find((r) => r.team === team);
                const steps = team === TEAM_RED ? -rope : rope;
                return (
                    <div
                        key={team}
                        className="tw-teamcard"
                        data-team={team}
                        data-you={you === team}
                        data-testid={`tw-team-${team}`}
                    >
                        <strong>{t(`tugOfWar.team.${team}`)}</strong>
                        <span className="tw-teamstat">
                            {t('tugOfWar.pulls', { count: row?.pulls ?? 0 })}
                        </span>
                        <span className="tw-meter" aria-hidden="true">
                            {Array.from({ length: winSteps }, (_, i) => (
                                <span key={i} data-on={i < steps} />
                            ))}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export function QuestionCard({
    label,
    text,
    subject,
    media,
    big = false,
}: {
    label: string;
    text: string;
    subject?: string;
    media?: QuestionMediaData | null;
    big?: boolean;
}) {
    return (
        <div className="tw-question" data-big={big} data-testid="tw-question">
            <div className="tw-question-meta">
                <p>{label}</p>
                {subject && <span className="tw-chip">{subject}</span>}
            </div>
            <QuestionMedia
                media={media}
                size={big ? 'lg' : 'sm'}
                className="my-2"
            />
            <h2>{text}</h2>
        </div>
    );
}

/** Answer buttons; the index sent is the displayed option index. */
export function OptionPads({
    options,
    optionMedia,
    disabled = false,
    selected,
    correct,
    onChoose,
    big = false,
}: {
    options: string[];
    optionMedia?: OptionMediaData[] | null;
    disabled?: boolean;
    selected?: number | null;
    correct?: number | null;
    onChoose?: (option: number) => void;
    big?: boolean;
}) {
    const { t } = useTranslations();
    return (
        <div
            className="tw-pads"
            data-big={big}
            role="group"
            aria-label={t('pingPong.chooseOption')}
        >
            {options.map((option, index) => {
                const isCorrect = correct === index;
                const isWrong =
                    correct !== null &&
                    correct !== undefined &&
                    selected === index &&
                    !isCorrect;
                return (
                    <button
                        type="button"
                        key={index}
                        className="tw-pad"
                        disabled={disabled}
                        aria-pressed={selected === index}
                        data-correct={isCorrect ? 'true' : undefined}
                        data-wrong={isWrong ? 'true' : undefined}
                        onClick={() => onChoose?.(index)}
                        data-testid={`tw-option-${index}`}
                    >
                        <span aria-hidden="true">
                            {String.fromCharCode(65 + index)}
                        </span>
                        <strong>
                            <OptionContent
                                text={option}
                                image={optionImage(optionMedia, index)}
                                size="sm"
                            />
                        </strong>
                        {isCorrect && (
                            <Check className="tw-mark" aria-hidden="true" />
                        )}
                        {isWrong && (
                            <X className="tw-mark" aria-hidden="true" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/** Small round progress for the current stage. */
export function StageTimer({
    seconds,
    label,
    className,
}: {
    seconds: number;
    label: string;
    className?: string;
}) {
    return (
        <div
            className={cn('tw-timer', className)}
            role="status"
            data-low={seconds <= 5}
        >
            {label}
        </div>
    );
}
