import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { Cable, ChartColumnBig, Grid3x3, Network } from 'lucide-react';

/** Admin sub pages of a game, shown as tabs under the game header. */
const GAME_TABS: Record<
    string,
    { key: string; label: string; href: string; icon: React.ElementType }[]
> = {
    crossword: [
        {
            key: 'analytics',
            label: 'Analytics',
            href: '/admin/games/crossword',
            icon: ChartColumnBig,
        },
        {
            key: 'words',
            label: 'Word bank',
            href: '/admin/games/crossword/words',
            icon: Grid3x3,
        },
    ],
    'order-rush': [
        {
            key: 'analytics',
            label: 'Analytics',
            href: '/admin/games/order-rush',
            icon: ChartColumnBig,
        },
        {
            key: 'sequences',
            label: 'Sequence bank',
            href: '/admin/games/order-rush/sequences',
            icon: Cable,
        },
    ],
    'port-sorter': [
        {
            key: 'analytics',
            label: 'Analytics',
            href: '/admin/games/port-sorter',
            icon: ChartColumnBig,
        },
        {
            key: 'sets',
            label: 'Item bank',
            href: '/admin/games/port-sorter/sets',
            icon: Network,
        },
    ],
};

export function gameHasTabs(game: string): boolean {
    return game in GAME_TABS;
}

export function GameTabs({ game, active }: { game: string; active: string }) {
    const tabs = GAME_TABS[game];
    if (!tabs) {
        return null;
    }

    return (
        <nav
            aria-label={tr('Game sections')}
            className="flex gap-1 overflow-x-auto border-b border-border"
            data-testid="game-tabs"
        >
            {tabs.map(({ key, label, href, icon: Icon }) => {
                const current = key === active;
                return (
                    <Link
                        key={key}
                        href={href}
                        aria-current={current ? 'page' : undefined}
                        data-testid={`game-tab-${key}`}
                        className={cn(
                            '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                            current
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                        )}
                    >
                        <Icon className="size-4" />
                        {tr(label)}
                    </Link>
                );
            })}
        </nav>
    );
}
