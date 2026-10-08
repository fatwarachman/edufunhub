import { PlayerAvatar } from '@/components/player-avatar';
import { BackButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import PlayerLayout from '@/layouts/player-layout';
import { type CharacterLook } from '@/lib/character/draw-character';
import { gradeLabel, hasGrade } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

interface OnlinePlayer {
    id: number;
    name: string;
    grade: number | null;
    school: string | null;
    character: CharacterLook | null;
    isMe: boolean;
    relation: 'self' | 'none' | 'friends' | 'sent' | 'received';
}

interface OnlinePlayersProps {
    players: OnlinePlayer[];
    pagination: {
        current_page: number;
        last_page: number;
        total: number;
        prev_page_url: string | null;
        next_page_url: string | null;
    };
    source: 'live' | 'recent';
}

const INK = 'border-[2.5px] border-[#151b2e]';

/** How often the list refreshes; matches the server cache TTL. */
const REFRESH_MS = 15_000;

/** Players online right now; each avatar opens the player page. */
export default function OnlinePlayers({
    players,
    pagination,
    source,
}: OnlinePlayersProps) {
    const { t, i18n } = useTranslations();
    const number = new Intl.NumberFormat(i18n.language);

    useVisibleInterval(
        () =>
            new Promise<void>((resolve) => {
                router.reload({
                    only: ['players', 'pagination', 'source'],
                    onFinish: () => resolve(),
                });
            }),
        REFRESH_MS,
    );

    return (
        <PlayerLayout title={t('onlinePlayers.title')}>
            <Head>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <div className="flex flex-col items-start gap-3">
                <BackButton
                    href="/dashboard"
                    label={t('nav.backToDashboard')}
                />
                <div className="flex flex-col gap-1">
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
                        <span
                            className="ml-1 size-3 shrink-0 rounded-full bg-[#22c55e] shadow-[0_0_0_4px_rgba(34,197,94,0.25)]"
                            aria-hidden
                        />
                        {t('onlinePlayers.title')}
                    </h1>
                    <p
                        className="text-sm font-semibold text-[#151b2e]/80"
                        data-testid="online-players-total"
                    >
                        {t('onlinePlayers.summary', {
                            count: pagination.total,
                            total: number.format(pagination.total),
                        })}
                        {source === 'recent' &&
                            ` · ${t('onlinePlayers.recentNote')}`}
                    </p>
                    <p
                        className="text-xs text-[#151b2e]/70"
                        data-testid="online-players-auto-refresh"
                    >
                        {t('onlinePlayers.autoRefresh')}
                    </p>
                </div>
            </div>

            {players.length === 0 ? (
                <p className="auth-card flex flex-col items-center gap-2 !p-6 text-center text-sm text-[#151b2e]/80">
                    <Users className="size-8" aria-hidden />
                    {t('onlinePlayers.empty')}
                </p>
            ) : (
                <ul
                    className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
                    data-testid="online-players-list"
                >
                    {players.map((player) => (
                        <li key={player.id} className="min-w-0">
                            <Link
                                href={`/players/${player.id}`}
                                className={cn(
                                    INK,
                                    'flex h-full min-w-0 flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center shadow-[2px_2px_0_#151b2e] transition-transform hover:-translate-y-0.5 hover:bg-[#fff9e6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]',
                                )}
                                aria-label={t('onlinePlayers.open', {
                                    name: player.name,
                                })}
                                data-testid={`online-player-${player.id}`}
                            >
                                <span className="relative block size-20 shrink-0 rounded-xl bg-[#d8c7a4]/50">
                                    <PlayerAvatar
                                        character={player.character}
                                        seat={player.id}
                                        userId={player.id}
                                    />
                                </span>
                                <span
                                    className="w-full truncate text-sm font-bold"
                                    title={player.name}
                                >
                                    {player.name}
                                </span>
                                <span className="w-full truncate text-xs text-[#3d4460]">
                                    {[
                                        hasGrade(player.grade)
                                            ? gradeLabel(t, player.grade)
                                            : null,
                                        player.school,
                                    ]
                                        .filter(Boolean)
                                        .join(' · ') || '—'}
                                </span>
                                {(player.isMe ||
                                    player.relation === 'friends') && (
                                    <span className="rounded-full border-2 border-[#151b2e] bg-[#a8e6cf] px-2 py-0.5 text-[11px] font-bold">
                                        {player.isMe
                                            ? t('onlinePlayers.you')
                                            : t('onlinePlayers.friend')}
                                    </span>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {pagination.last_page > 1 && (
                <nav
                    className="flex items-center justify-between gap-2"
                    aria-label={t('onlinePlayers.pages')}
                >
                    <PageLink
                        href={pagination.prev_page_url}
                        label={t('onlinePlayers.prev')}
                    >
                        <ChevronLeft className="size-4" aria-hidden />
                    </PageLink>
                    <span className="text-sm font-bold tabular-nums">
                        {pagination.current_page} / {pagination.last_page}
                    </span>
                    <PageLink
                        href={pagination.next_page_url}
                        label={t('onlinePlayers.next')}
                        trailing
                    >
                        <ChevronRight className="size-4" aria-hidden />
                    </PageLink>
                </nav>
            )}
        </PlayerLayout>
    );
}

function PageLink({
    href,
    label,
    trailing = false,
    children,
}: {
    href: string | null;
    label: string;
    trailing?: boolean;
    children: React.ReactNode;
}) {
    const className = cn(
        INK,
        'inline-flex min-h-10 items-center gap-1 rounded-xl bg-white px-3 text-sm font-bold',
    );
    const content = (
        <>
            {!trailing && children}
            {label}
            {trailing && children}
        </>
    );
    if (!href) {
        return (
            <span className={cn(className, 'opacity-40')} aria-disabled>
                {content}
            </span>
        );
    }
    return (
        <Link href={href} preserveScroll className={className}>
            {content}
        </Link>
    );
}
