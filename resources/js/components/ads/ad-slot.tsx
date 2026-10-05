import { useTranslations } from '@/hooks/use-translations';
import {
    adClickUrl,
    trackAd,
    useAd,
    type AdPlacement,
    type ServedAd,
} from '@/lib/ads';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import '../../../css/edu-ads.css';

/**
 * Renders the creative served for a placement (logo or motto) with a clear
 * "Sponsor" label. Counts one impression when at least half of the slot is
 * visible. Renders nothing when the placement is unsold.
 */
export default function AdSlot({
    placement,
    className,
    variant,
}: {
    placement: AdPlacement;
    className?: string;
    /** Layout: strip (horizontal), card (stacked) or badge (logo only). */
    variant?: 'strip' | 'card' | 'badge';
}) {
    const ad = useAd(placement);
    if (!ad || (ad.type !== 'logo' && ad.type !== 'motto')) return null;
    const resolved = variant ?? defaultVariant(placement);

    if (ad.mode === 'rotate' && (ad.items?.length ?? 0) > 1) {
        return (
            <RotatingAd
                items={ad.items ?? []}
                seconds={ad.rotate_seconds ?? 10}
                variant={resolved}
                className={className}
            />
        );
    }

    return <AdCreativeView ad={ad} className={className} variant={resolved} />;
}

/**
 * Cycles through the served creatives every `seconds`. Pauses while the
 * tab is hidden or the pointer/focus is on the ad, and stays on the first
 * creative when the player prefers reduced motion. Each creative counts its
 * own impression when it is actually shown.
 */
function RotatingAd({
    items,
    seconds,
    variant,
    className,
}: {
    items: ServedAd[];
    seconds: number;
    variant: 'strip' | 'card' | 'badge';
    className?: string;
}) {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (
            paused ||
            items.length < 2 ||
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ) {
            return;
        }
        const id = window.setInterval(
            () => {
                if (document.visibilityState === 'visible') {
                    setIndex((current) => (current + 1) % items.length);
                }
            },
            Math.max(3, seconds) * 1000,
        );
        return () => window.clearInterval(id);
    }, [items.length, seconds, paused]);

    const ad = items[index % items.length];

    return (
        <div
            className="edu-ad-rotator"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            data-testid={`ad-rotator-${ad.placement}`}
            data-index={index % items.length}
            data-count={items.length}
        >
            <AdCreativeView
                key={ad.serve}
                ad={ad}
                variant={variant}
                className={cn('edu-ad-fade', className)}
            />
            <span className="edu-ad-dots" aria-hidden="true">
                {items.map((item, i) => (
                    <span
                        key={item.serve}
                        className={cn(i === index % items.length && 'is-on')}
                    />
                ))}
            </span>
        </div>
    );
}

function defaultVariant(placement: AdPlacement): 'strip' | 'card' | 'badge' {
    if (placement === 'arena.header') return 'strip';
    if (placement === 'arena.board') return 'badge';
    return 'card';
}

export function AdCreativeView({
    ad,
    variant,
    className,
    preview = false,
}: {
    ad: Pick<
        ServedAd,
        | 'type'
        | 'advertiser'
        | 'image_url'
        | 'motto'
        | 'has_link'
        | 'background_color'
        | 'text_color'
        | 'serve'
        | 'placement'
    >;
    variant: 'strip' | 'card' | 'badge';
    className?: string;
    /** Admin preview: no tracking, no link. */
    preview?: boolean;
}) {
    const { t } = useTranslations();
    const ref = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const node = ref.current;
        if (preview || !node || typeof IntersectionObserver === 'undefined')
            return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.intersectionRatio >= 0.5)) {
                    trackAd(ad.serve, 'impression');
                    observer.disconnect();
                }
            },
            { threshold: [0.5] },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [ad.serve, preview]);

    const style = {
        backgroundColor: ad.background_color ?? undefined,
        color: ad.text_color ?? undefined,
    };
    const label = <span className="edu-ad-label">{t('ads.sponsor')}</span>;
    const logo = ad.image_url ? (
        <img
            src={ad.image_url}
            alt={ad.advertiser}
            loading="lazy"
            draggable={false}
            className="edu-ad-logo"
        />
    ) : null;

    const body =
        variant === 'badge' ? (
            <>
                {logo ?? <span className="edu-ad-brand">{ad.advertiser}</span>}
                {label}
            </>
        ) : (
            <>
                {label}
                {logo}
                <span className="edu-ad-text">
                    {ad.type === 'motto' && ad.motto ? (
                        <span className="edu-ad-motto">“{ad.motto}”</span>
                    ) : null}
                    <span className="edu-ad-brand">{ad.advertiser}</span>
                </span>
            </>
        );

    const common = {
        className: cn('edu-ad', `edu-ad--${variant}`, className),
        style,
        'data-testid': `ad-${ad.placement}`,
        'data-ad-type': ad.type,
        'aria-label': `${t('ads.sponsor')}: ${ad.advertiser}`,
    };

    if (ad.has_link && !preview) {
        return (
            <a
                {...common}
                ref={(node) => {
                    ref.current = node;
                }}
                href={adClickUrl(ad.serve)}
                target="_blank"
                rel="noopener noreferrer sponsored"
            >
                {body}
            </a>
        );
    }

    return (
        <aside
            {...common}
            ref={(node) => {
                ref.current = node;
            }}
        >
            {body}
        </aside>
    );
}
