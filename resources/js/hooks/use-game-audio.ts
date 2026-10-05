import {
    type GameSound,
    playGameSound,
    soundSettings,
} from '@/lib/game-sounds';
import { usePage } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Game sound effects. Correct/wrong sounds and volume follow the super
 * admin's sound settings (shared `gameSounds` prop); players can still mute.
 */
export function useGameAudio() {
    const { gameSounds } = usePage<{ gameSounds?: unknown }>().props;
    const settings = useRef(soundSettings(gameSounds));
    const context = useRef<AudioContext | null>(null);
    const mutedRef = useRef(false);
    const [muted, setMuted] = useState(false);

    useEffect(() => {
        settings.current = soundSettings(gameSounds);
    }, [gameSounds]);

    const play = useCallback((sound: GameSound) => {
        if (mutedRef.current || typeof window.AudioContext === 'undefined') {
            return;
        }
        try {
            context.current ??= new AudioContext();
            const audio = context.current;
            if (audio.state === 'suspended') {
                void audio.resume().catch(() => {});
            }
            playGameSound(audio, sound, settings.current);
        } catch {
            /* Audio is optional when the browser denies playback. */
        }
    }, []);

    const toggleMuted = () => {
        mutedRef.current = !mutedRef.current;
        setMuted(mutedRef.current);
        if (!mutedRef.current) {
            play('step');
        }
    };
    useEffect(
        () => () => {
            void context.current?.close().catch(() => {});
        },
        [],
    );
    return { play, muted, toggleMuted };
}
