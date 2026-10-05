import { usePage } from '@inertiajs/react';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Ad foundation for game pages.
 *
 * Every game route shares `ads` (placement => creative) through the
 * RecordGameAccess middleware. A game only needs to:
 *   1. render <AdSlot placement="arena.header" /> etc. where it has room, and
 *   2. call `playJingle('start' | 'win')` from useAdJingle() at those moments.
 * Empty placements render nothing, so games stay clean when nothing is sold.
 */
export type AdPlacement =
    | 'arena.header'
    | 'arena.sidebar'
    | 'arena.board'
    | 'arena.loading'
    | 'arena.result'
    | 'jingle.start'
    | 'jingle.win';

export interface ServedAd {
    type: 'logo' | 'motto' | 'jingle' | 'item';
    placement: AdPlacement;
    advertiser: string;
    image_url: string | null;
    audio_url: string | null;
    motto: string | null;
    size: string | null;
    has_link: boolean;
    background_color: string | null;
    text_color: string | null;
    display_seconds: number;
    moment: 'start' | 'win' | null;
    serve: string;
    /** static = one creative per page view; rotate = cycle `items`. */
    mode?: 'static' | 'rotate';
    rotate_seconds?: number;
    items?: ServedAd[];
}

export interface AdSponsor {
    advertiser: string;
    logo_url: string | null;
    motto: string | null;
    serve: string;
}

const MUTE_KEY = 'edu-ad-jingle-muted';
const trackedServes = new Set<string>();

function csrfToken(): string {
    return (
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ?? ''
    );
}

/** Records an impression or jingle play once per serve token. */
export function trackAd(serve: string, type: 'impression' | 'play'): void {
    const key = `${type}:${serve}`;
    if (trackedServes.has(key)) return;
    trackedServes.add(key);
    void fetch('/ads/track', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({ serve, type }),
    }).catch(() => trackedServes.delete(key));
}

export function adClickUrl(serve: string): string {
    return `/ads/click?s=${encodeURIComponent(serve)}`;
}

export function useAds(): Partial<Record<AdPlacement, ServedAd>> {
    const { ads } = usePage<{
        ads?: Partial<Record<AdPlacement, ServedAd>>;
    }>().props;
    return ads ?? {};
}

export function useAd(placement: AdPlacement): ServedAd | null {
    return useAds()[placement] ?? null;
}

export function jinglesMuted(): boolean {
    try {
        return window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Plays the sponsor jingle bought for a game moment. Respects the game's own
 * mute switch, plays at most once per moment per page view and stops when
 * the page unmounts.
 */
export function useAdJingle(muted = false) {
    const ads = useAds();
    const playing = useRef<HTMLAudioElement | null>(null);
    const played = useRef(new Set<string>());

    useEffect(
        () => () => {
            playing.current?.pause();
            playing.current = null;
        },
        [],
    );

    useEffect(() => {
        if (muted) playing.current?.pause();
    }, [muted]);

    return useCallback(
        (moment: 'start' | 'win') => {
            const ad = ads[`jingle.${moment}`];
            if (!ad?.audio_url || muted || jinglesMuted()) return;
            if (played.current.has(moment)) return;
            played.current.add(moment);
            try {
                playing.current?.pause();
                const audio = new Audio(ad.audio_url);
                audio.volume = 0.6;
                playing.current = audio;
                void audio
                    .play()
                    .then(() => trackAd(ad.serve, 'play'))
                    .catch(() => {
                        /* Autoplay may be blocked; jingles are optional. */
                    });
            } catch {
                /* Audio is optional. */
            }
        },
        [ads, muted],
    );
}

export type AdGamePhase = 'idle' | 'playing' | 'done';

/**
 * Standard moments for every game: plays the "start" jingle when a round
 * begins and the "win" jingle when it ends with a win/finish. Call once per
 * game page with the game's own phase and mute state.
 */
export function useAdMoments(
    phase: AdGamePhase,
    { muted = false, won = true }: { muted?: boolean; won?: boolean } = {},
) {
    const playJingle = useAdJingle(muted);
    const previous = useRef<AdGamePhase>(phase);

    useEffect(() => {
        const before = previous.current;
        previous.current = phase;
        if (before === phase) return;
        if (phase === 'playing') playJingle('start');
        if (phase === 'done' && won) playJingle('win');
    }, [phase, won, playJingle]);

    return playJingle;
}

/**
 * Declarative moment: mount it inside a game's "round started" or
 * "winner" UI and the matching sponsor jingle plays once.
 */
export function AdMoment({
    moment,
    muted = false,
}: {
    moment: 'start' | 'win';
    muted?: boolean;
}): null {
    const playJingle = useAdJingle(muted);
    useEffect(() => {
        playJingle(moment);
    }, [moment, playJingle]);
    return null;
}
