import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { type TFunction } from 'i18next';
import { Users } from 'lucide-react';

/**
 * Localised player count: "Solo", "1–4 pemain", "2 pemain" or
 * "Min. 2 · maks 40 pemain". Host/projector screens are not counted.
 */
export function playerCountLabel(
    t: TFunction,
    minPlayers: number,
    maxPlayers: number,
): string {
    const min = Math.max(1, minPlayers);
    const max = Math.max(min, maxPlayers);

    if (max === 1) {
        return t('games.players.solo');
    }

    if (min === max) {
        return t('games.players.exact', { players: max });
    }

    return min === 1
        ? t('games.players.range', { min, max })
        : t('games.players.min', { min, max });
}

interface PlayerCountBadgeProps {
    minPlayers: number;
    maxPlayers: number;
    className?: string;
    testId?: string;
}

/** Compact pill showing how many people can play a game (player pages). */
export function PlayerCountBadge({
    minPlayers,
    maxPlayers,
    className,
    testId,
}: PlayerCountBadgeProps) {
    const { t } = useTranslations();
    const label = playerCountLabel(t, minPlayers, maxPlayers);

    return (
        <span
            className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#e8f1ff] px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-[#1f2a44]',
                className,
            )}
            title={`${t('games.players.label')}: ${label}`}
            data-testid={testId}
        >
            <Users className="size-3 shrink-0" aria-hidden />
            <span className="sr-only">{t('games.players.label')}: </span>
            <span className="truncate">{label}</span>
        </span>
    );
}
