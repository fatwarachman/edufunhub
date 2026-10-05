import AdSlot from '@/components/ads/ad-slot';
import { useAd } from '@/lib/ads';
import { cn } from '@/lib/utils';

/**
 * Standard header sponsor strip placed directly under a game's header.
 * Collapses to nothing when `arena.header` is unsold.
 */
export default function GameAdStrip({ className }: { className?: string }) {
    const ad = useAd('arena.header');
    if (!ad) return null;

    return (
        <div className={cn('w-full', className)}>
            <AdSlot placement="arena.header" />
        </div>
    );
}
