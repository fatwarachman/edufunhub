import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { Network } from 'lucide-react';

/** Programme flags a catalog game may carry (mirrors PlayerPortal::TAGS). */
export type GameTag = 'tkj';

/** Whether a catalog game carries the TKJ flag. */
export function isTkjGame(game: { tags?: string[] }): boolean {
    return game.tags?.includes('tkj') ?? false;
}

/**
 * "TKJ" flag: the game teaches SMK Teknik Komputer dan Jaringan material
 * (cabling, topology, IP, protocols). Info only, never blocks play.
 */
export function TkjBadge({
    className,
    testId,
}: {
    className?: string;
    testId?: string;
}) {
    const { t } = useTranslations();

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#0f766e] px-2 py-0.5 text-[11px] font-black whitespace-nowrap text-white',
                className,
            )}
            title={t('gameList.tkj.hint')}
            data-testid={testId}
        >
            <Network className="size-3 shrink-0" aria-hidden />
            {t('gameList.tkj.badge')}
            <span className="sr-only"> {t('gameList.tkj.hint')}</span>
        </span>
    );
}
