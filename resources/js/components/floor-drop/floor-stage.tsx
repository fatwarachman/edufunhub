import { PlayerAvatar } from '@/components/player-avatar';
import { type FloorPlayer, type FloorState } from '@/hooks/use-floor-drop';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { Heart, WifiOff } from 'lucide-react';

/** How many cracks a floor shows: 0 (intact) to max (broken). */
function cracks(player: FloorPlayer, max: number): number {
    if (!player.alive) {
        return max;
    }
    return Math.max(0, Math.min(max, max - (player.lives ?? max)));
}

/**
 * Every player standing on their own floor. A wrong answer cracks the floor
 * (one heart lost); the last crack breaks it and the player falls. The host
 * screen shows everyone; players see the whole room with themselves first.
 */
export function FloorStage({
    state,
    you,
    compact = false,
}: {
    state: FloorState;
    you?: number;
    compact?: boolean;
}) {
    const { t } = useTranslations();
    const max = state.lives_max ?? 3;
    const crackedNow = new Set(state.cracked_user_ids ?? []);
    const fellNow = new Set(state.eliminated_user_ids ?? []);
    const players = state.players
        .filter((p) => !p.left || !p.alive)
        .slice()
        .sort((a, b) => {
            if (a.user_id === you) {
                return -1;
            }
            if (b.user_id === you) {
                return 1;
            }
            if (a.alive !== b.alive) {
                return a.alive ? -1 : 1;
            }
            return (b.lives ?? 0) - (a.lives ?? 0);
        });

    return (
        <ul
            className={cn(
                'grid gap-x-2 gap-y-3',
                compact
                    ? 'grid-cols-4 sm:grid-cols-6'
                    : 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-8',
            )}
            data-testid="fd-stage"
            aria-label={t('floorDrop.stageLabel')}
        >
            {players.map((player) => {
                const level = cracks(player, max);
                const reveal = state.phase === 'REVEAL_DROP';
                return (
                    <li
                        key={player.user_id}
                        className="fd-spot flex min-w-0 flex-col items-center gap-1"
                        data-alive={player.alive}
                        data-cracks={level}
                        data-cracking={reveal && crackedNow.has(player.user_id)}
                        data-falling={reveal && fellNow.has(player.user_id)}
                        data-you={player.user_id === you}
                        data-testid={`fd-spot-${player.user_id}`}
                    >
                        <span
                            className={cn(
                                'fd-spot-avatar relative',
                                compact ? 'size-10' : 'size-12 sm:size-14',
                            )}
                        >
                            <PlayerAvatar
                                character={player.character}
                                seat={player.user_id}
                                userId={player.user_id}
                            />
                            {!player.online && player.alive && (
                                <WifiOff
                                    className="absolute -top-1 -right-1 size-4 rounded-full bg-white p-0.5 text-[#AD1457]"
                                    aria-hidden="true"
                                />
                            )}
                        </span>
                        <span
                            className="fd-floor"
                            data-cracks={level}
                            aria-hidden="true"
                        />
                        <span
                            className={cn(
                                'w-full truncate text-center text-[11px] font-black',
                                player.user_id === you && 'text-[#2563eb]',
                            )}
                        >
                            {player.user_id === you
                                ? t('floorDrop.you')
                                : player.name}
                        </span>
                        <Lives
                            lives={player.alive ? (player.lives ?? max) : 0}
                            max={max}
                        />
                    </li>
                );
            })}
        </ul>
    );
}

/** Hearts left on a floor (filled) out of max. */
export function Lives({
    lives,
    max,
    size = 'sm',
}: {
    lives: number;
    max: number;
    size?: 'sm' | 'lg';
}) {
    const { t } = useTranslations();
    return (
        <span
            className="inline-flex items-center gap-0.5"
            role="img"
            aria-label={t('floorDrop.livesLeft', { count: lives, max })}
            data-testid="fd-lives"
            data-lives={lives}
        >
            {Array.from({ length: max }, (_, i) => (
                <Heart
                    key={i}
                    aria-hidden="true"
                    className={cn(
                        size === 'lg' ? 'size-6' : 'size-3',
                        i < lives
                            ? 'fill-[#e11d48] text-[#e11d48]'
                            : 'text-[#1f2a44]/30',
                    )}
                />
            ))}
        </span>
    );
}
