import { playerCountLabel } from '@/components/player-count-badge';
import { isTkjGame, TkjBadge } from '@/components/tkj-badge';
import { useTranslations } from '@/hooks/use-translations';
import { gameIcon } from '@/lib/games';
import { gradeShortLabel } from '@/lib/grade';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, Gamepad2, LayoutGrid } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * "Games" navigation item: a grouped dropdown listing every catalog game
 * by category, plus a link to the full game list. Closes on outside click,
 * Escape and navigation.
 */
export function GameMenu({ active }: { active: boolean }) {
    const { t } = useTranslations();
    const { props, url } = usePage<SharedData>();
    const signedIn = Boolean(props.auth?.user);
    const categories = props.gameMenu ?? [];
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement | null>(null);
    const trigger = useRef<HTMLButtonElement | null>(null);
    const menuId = useId();
    const [lastUrl, setLastUrl] = useState(url);

    if (lastUrl !== url) {
        setLastUrl(url);
        setOpen(false);
    }

    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointer = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                trigger.current?.focus();
            }
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const range = (min: number, max: number) =>
        min === max
            ? gradeShortLabel(t, min)
            : `${gradeShortLabel(t, min)}–${gradeShortLabel(t, max)}`;

    return (
        <div className="edu-game-menu" ref={root} data-testid="game-menu">
            <button
                ref={trigger}
                type="button"
                className="edu-nav-btn"
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={menuId}
                aria-current={active ? 'page' : undefined}
                aria-label={t('nav.games')}
                data-tip={open ? undefined : t('nav.games')}
                onClick={() => setOpen((value) => !value)}
                data-testid="game-menu-trigger"
            >
                <Gamepad2 aria-hidden="true" />
                <span className="edu-nav-label">{t('nav.games')}</span>
                <ChevronDown
                    aria-hidden="true"
                    className="edu-game-menu-chevron"
                    data-open={open}
                />
            </button>
            <div
                id={menuId}
                className="edu-game-menu-panel edu-game-menu-panel--split"
                data-open={open}
                hidden={!open}
            >
                <Link
                    href="/gamelist"
                    className="edu-game-menu-all"
                    data-testid="game-menu-all"
                >
                    <LayoutGrid aria-hidden="true" />
                    <span>{t('nav.allGames')}</span>
                </Link>
                <div
                    className="edu-game-menu-scroll"
                    data-testid="game-menu-scroll"
                >
                    {categories.map((category) => (
                        <section
                            key={category.key}
                            className="edu-game-menu-group"
                            aria-labelledby={`${menuId}-${category.key}`}
                            data-testid={`game-menu-group-${category.key}`}
                        >
                            <h3
                                id={`${menuId}-${category.key}`}
                                className="edu-game-menu-heading"
                            >
                                {t(category.titleKey)}
                            </h3>
                            <ul>
                                {category.games.map((game) => {
                                    const Icon = gameIcon(game.icon);
                                    const locked =
                                        !signedIn && !game.guestPlayable;
                                    return (
                                        <li key={game.key}>
                                            <Link
                                                href={
                                                    locked ? '/login' : game.url
                                                }
                                                className="edu-game-menu-item"
                                                aria-current={
                                                    url.split(/[?#]/)[0] ===
                                                    game.url
                                                        ? 'page'
                                                        : undefined
                                                }
                                                data-testid={`game-menu-item-${game.key}`}
                                            >
                                                <span
                                                    className="edu-game-menu-icon"
                                                    style={{
                                                        background: game.accent,
                                                    }}
                                                >
                                                    <Icon aria-hidden="true" />
                                                </span>
                                                <span className="edu-game-menu-text">
                                                    <span className="edu-game-menu-title">
                                                        {t(game.titleKey)}
                                                        {isTkjGame(game) && (
                                                            <TkjBadge
                                                                className="ml-1.5 px-1.5 align-[1px] text-[10px]"
                                                                testId={`game-menu-tkj-${game.key}`}
                                                            />
                                                        )}
                                                    </span>
                                                    <span className="edu-game-menu-meta">
                                                        {t('nav.gradeRange', {
                                                            range: range(
                                                                game.minGrade,
                                                                game.maxGrade,
                                                            ),
                                                        })}
                                                        {' · '}
                                                        {playerCountLabel(
                                                            t,
                                                            game.minPlayers,
                                                            game.maxPlayers,
                                                        )}
                                                        {' · '}
                                                        {locked
                                                            ? t(
                                                                  'nav.loginToPlay',
                                                              )
                                                            : game.awardsPoints
                                                              ? t(
                                                                    'portal.earnsPoints',
                                                                )
                                                              : t(
                                                                    'portal.practice',
                                                                )}
                                                    </span>
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
