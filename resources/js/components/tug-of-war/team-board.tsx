import { PlayerAvatar } from '@/components/player-avatar';
import { useTranslations } from '@/hooks/use-translations';
import { type TugSeat } from '@/hooks/use-tug-of-war';
import { TEAM_BLUE, TEAM_RED, TEAM_WATCH, teamCheck } from '@/lib/tug-of-war';
import { ArrowLeftRight, Shuffle } from 'lucide-react';

/** Question count picker (host only). */
export function QuestionCountPicker({
    value,
    options,
    winSteps,
    disabled,
    onChange,
}: {
    value: number;
    options: number[];
    winSteps: number;
    disabled: boolean;
    onChange: (count: number) => void;
}) {
    const { t } = useTranslations();
    return (
        <fieldset data-testid="tw-question-count" data-count={value}>
            <legend className="tw-legend">
                {t('tugOfWar.settings.questions')}
            </legend>
            <div className="tw-counts">
                {options.map((count) => (
                    <button
                        key={count}
                        type="button"
                        className="tw-count"
                        aria-pressed={count === value}
                        disabled={disabled}
                        onClick={() => onChange(count)}
                        data-testid={`tw-count-${count}`}
                    >
                        {count}
                    </button>
                ))}
            </div>
            <p className="tw-hint">
                {t('tugOfWar.settings.questionsHint', { steps: winSteps })}
            </p>
        </fieldset>
    );
}

/**
 * Manual team split: two columns, the host moves players with the swap
 * button or shuffles everyone; everyone else sees the same board read-only.
 */
export function TeamBoard({
    players,
    you,
    host,
    isHost,
    disabled,
    onMove,
    onShuffle,
}: {
    players: TugSeat[];
    you: number;
    host: number;
    isHost: boolean;
    disabled: boolean;
    onMove: (seat: number, team: number) => void;
    onShuffle: () => void;
}) {
    const { t } = useTranslations();
    const active = players.filter((p) => !p.left && !p.bot);
    const check = teamCheck(active);
    const hostSeat = active.find((p) => p.seat === host);
    const watching = hostSeat?.team === TEAM_WATCH;
    const checkText =
        check.kind === 'solo'
            ? t('tugOfWar.settings.soloReady')
            : check.kind === 'odd'
              ? t('tugOfWar.settings.oddWarning', { count: check.count })
              : check.kind === 'unbalanced'
                ? t('tugOfWar.settings.unbalancedWarning', {
                      red: check.red,
                      blue: check.blue,
                  })
                : check.kind === 'ready'
                  ? t('tugOfWar.settings.ready', {
                        red: check.red,
                        blue: check.blue,
                    })
                  : t('tugOfWar.settings.empty');
    return (
        <section data-testid="tw-team-board" data-check={check.kind}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="tw-legend" style={{ margin: 0 }}>
                    {t('tugOfWar.settings.teams')}
                </p>
                {isHost && (
                    <button
                        type="button"
                        className="tw-secondary"
                        onClick={onShuffle}
                        disabled={disabled || active.length < 2}
                        data-testid="tw-shuffle"
                    >
                        <Shuffle className="size-4" aria-hidden="true" />
                        {t('tugOfWar.settings.shuffle')}
                    </button>
                )}
            </div>
            <p className="tw-hint">{t('tugOfWar.settings.teamsHint')}</p>
            <div className="tw-board" style={{ marginTop: 8 }}>
                {[TEAM_RED, TEAM_BLUE].map((team) => {
                    const members = active.filter((p) => p.team === team);
                    const other = team === TEAM_RED ? TEAM_BLUE : TEAM_RED;
                    return (
                        <div
                            key={team}
                            className="tw-board-col"
                            data-team={team}
                            data-testid={`tw-board-${team}`}
                        >
                            <h4>
                                <span>{t(`tugOfWar.team.${team}`)}</span>
                                <span>{members.length}</span>
                            </h4>
                            <ul>
                                {members.length === 0 && (
                                    <li className="tw-board-empty">
                                        {t('tugOfWar.settings.empty')}
                                    </li>
                                )}
                                {members.map((p) => (
                                    <li
                                        key={p.seat}
                                        className="tw-board-row"
                                        data-testid={`tw-seat-${p.seat}`}
                                    >
                                        <span className="tw-mini-avatar">
                                            <PlayerAvatar
                                                character={p.character}
                                                seat={p.seat}
                                                userId={p.user_id}
                                            />
                                        </span>
                                        <span title={p.name}>
                                            {p.name}
                                            {p.seat === you &&
                                                ` (${t('room.you')})`}
                                        </span>
                                        {isHost && (
                                            <button
                                                type="button"
                                                className="tw-move"
                                                disabled={disabled}
                                                onClick={() =>
                                                    onMove(p.seat, other)
                                                }
                                                aria-label={t(
                                                    'tugOfWar.settings.moveTo',
                                                    {
                                                        name: p.name,
                                                        team: t(
                                                            `tugOfWar.team.${other}`,
                                                        ),
                                                    },
                                                )}
                                                data-testid={`tw-move-${p.seat}`}
                                            >
                                                <ArrowLeftRight
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>
            <p
                className="tw-check"
                data-ok={check.kind === 'ready' || check.kind === 'solo'}
                role="status"
                data-testid="tw-team-check"
            >
                {checkText}
            </p>
            {isHost && hostSeat && (
                <label className="tw-watch">
                    <input
                        type="checkbox"
                        checked={watching}
                        disabled={disabled}
                        onChange={(event) =>
                            onMove(
                                hostSeat.seat,
                                event.target.checked ? TEAM_WATCH : TEAM_RED,
                            )
                        }
                        data-testid="tw-watch"
                    />
                    <span>
                        {t('tugOfWar.settings.watch')}
                        <small>{t('tugOfWar.settings.watchHint')}</small>
                    </span>
                </label>
            )}
        </section>
    );
}
