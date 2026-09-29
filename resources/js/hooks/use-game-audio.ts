import { useCallback, useEffect, useRef, useState } from 'react';

type Sound = 'dice' | 'correct' | 'step' | 'wrong' | 'shoot';

export function useGameAudio() {
    const context = useRef<AudioContext | null>(null);
    const mutedRef = useRef(false);
    const [muted, setMuted] = useState(false);

    const play = useCallback((sound: Sound) => {
        if (mutedRef.current || typeof window.AudioContext === 'undefined')
            return;
        try {
            context.current ??= new AudioContext();
            const audio = context.current;
            if (audio.state === 'suspended')
                void audio.resume().catch(() => {});
            const notes =
                sound === 'correct'
                    ? [523, 659, 784]
                    : [
                          sound === 'step'
                              ? 340
                              : sound === 'dice'
                                ? 180 + Math.random() * 180
                                : sound === 'shoot'
                                  ? 900
                                  : 150,
                      ];
            notes.forEach((frequency, index) => {
                const oscillator = audio.createOscillator();
                const gain = audio.createGain();
                const start = audio.currentTime + index * 0.12;
                oscillator.type = sound === 'correct' ? 'sine' : 'triangle';
                oscillator.frequency.setValueAtTime(frequency, start);
                oscillator.frequency.exponentialRampToValueAtTime(
                    frequency * 0.5,
                    start + 0.1,
                );
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.09, start + 0.008);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
                oscillator.connect(gain);
                gain.connect(audio.destination);
                oscillator.start(start);
                oscillator.stop(start + 0.15);
                oscillator.onended = () => {
                    oscillator.disconnect();
                    gain.disconnect();
                };
            });
        } catch {
            /* Audio is optional when the browser denies playback. */
        }
    }, []);

    const toggleMuted = () => {
        mutedRef.current = !mutedRef.current;
        setMuted(mutedRef.current);
        if (!mutedRef.current) play('step');
    };
    useEffect(
        () => () => {
            void context.current?.close().catch(() => {});
        },
        [],
    );
    return { play, muted, toggleMuted };
}
