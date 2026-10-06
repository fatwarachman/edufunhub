import { OnlineDot } from '@/components/online-dot';
import PlayerCharacter from '@/components/player-character';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';

/**
 * Looks for seats without an account avatar (pass-and-play seats, bots,
 * guests). Same chibi model as the portal avatar, only the colours differ.
 */
const SEAT_LOOKS: CharacterLook[] = [
    { color: 'amber', gender: 'boy', skin: 'light', hair: 'brown' },
    { color: 'teal', gender: 'girl', skin: 'tan', hair: 'black' },
    { color: 'violet', gender: 'boy', skin: 'brown', hair: 'black' },
    { color: 'coral', gender: 'girl', skin: 'light', hair: 'red' },
];

/** Soft background per shirt colour, for turn badges and seat cards. */
const TINTS: Record<string, string> = {
    amber: '#ffe7b3',
    coral: '#ffd6de',
    teal: '#c4f0e4',
    violet: '#e0dafe',
};

/** The player's own avatar look, or a seat look when they have none. */
export function avatarLook(
    character: CharacterLook | null | undefined,
    seat = 0,
): CharacterLook {
    return character?.color
        ? character
        : SEAT_LOOKS[Math.abs(seat) % SEAT_LOOKS.length];
}

export function avatarTint(
    character: CharacterLook | null | undefined,
    seat = 0,
): string {
    return TINTS[avatarLook(character, seat).color] ?? TINTS.amber;
}

/**
 * In-game player character: the exact avatar drawn on the portal and in the
 * character shop, so every game shows the same model the player dressed up.
 */
export function PlayerAvatar({
    character,
    seat = 0,
    userId,
    walking = false,
    className,
}: {
    character?: CharacterLook | null;
    seat?: number;
    /** Account behind the avatar: shows the online dot while connected. */
    userId?: number | null;
    walking?: boolean;
    className?: string;
}) {
    const look = avatarLook(character, seat);
    return (
        <span
            className={cn(
                'relative block size-full',
                walking && 'edu-avatar-hop',
                className,
            )}
            data-testid="player-avatar"
            data-own={character?.color ? 'true' : 'false'}
        >
            <PlayerCharacter
                character={look}
                backdrop={false}
                className="size-full"
            />
            <OnlineDot userId={userId} />
        </span>
    );
}
