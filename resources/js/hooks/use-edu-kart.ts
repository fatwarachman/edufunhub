import { type RoomPayload, type RoomSeat } from '@/components/multiplayer/room';
import { useGameSocket } from '@/hooks/use-game-socket';
import {
    type EduKartStateExtra,
    isRaceFrame,
    isTrackMessage,
    type RaceFrame,
    STATE_TYPE,
} from '@/lib/edu-kart/protocol';
import { Track, type TrackData } from '@/lib/edu-kart/track';
import { useCallback, useMemo, useRef, useState } from 'react';

export interface EduKartSeat extends RoomSeat {
    vehicle?: string;
}

export type EduKartState = RoomPayload<EduKartSeat> & EduKartStateExtra;

/**
 * Socket for the EduKart referee. React keeps only the coarse room state;
 * 20 Hz race frames go straight to `onFrame` (the page loop), never through
 * React state.
 */
export function useEduKart(wsUrl: string | null, locale: string) {
    const [state, setState] = useState<EduKartState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [trackData, setTrackData] = useState<TrackData | null>(null);
    const [leftPoints, setLeftPoints] = useState<number | null>(null);
    const frameListener = useRef<((frame: RaceFrame) => void) | null>(null);

    const onState = useCallback((next: EduKartState) => {
        setState(next.pin ? next : null);
        setError(null);
    }, []);
    const onError = useCallback((code: string) => {
        setError(code);
    }, []);
    const onMessage = useCallback((message: Record<string, unknown>) => {
        if (isRaceFrame(message)) {
            frameListener.current?.(message);
            return;
        }
        if (isTrackMessage(message)) {
            setTrackData((prev) =>
                prev &&
                prev.id === message.track.id &&
                prev.samples.length === message.track.samples.length
                    ? prev
                    : message.track,
            );
            return;
        }
        if (message.t === 'left') {
            setState(null);
            setLeftPoints(
                typeof message.points === 'number' ? message.points : null,
            );
        }
    }, []);
    const connection = useGameSocket<EduKartState>(
        wsUrl,
        '/games/edu-kart/token',
        STATE_TYPE,
        locale,
        { onState, onError, onMessage },
    );
    const track = useMemo(() => {
        if (!trackData) {
            return null;
        }
        try {
            return new Track(trackData);
        } catch {
            return null;
        }
    }, [trackData]);
    const onFrame = useCallback((fn: ((frame: RaceFrame) => void) | null) => {
        frameListener.current = fn;
    }, []);

    return {
        ...connection,
        state,
        error,
        track,
        leftPoints,
        onFrame,
    };
}
