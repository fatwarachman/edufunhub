/**
 * Turbo Trivia racing sound effects, synthesised with Web Audio (no audio
 * files): engine drone, nitro whoosh, item explosions, banana slip,
 * lightning crackle, shield chime and the start lights.
 */
import { type GameSoundSettings } from '@/lib/game-sounds';

export type TurboSound =
    | 'nitro'
    | 'explode'
    | 'slip'
    | 'zap'
    | 'shield'
    | 'item'
    | 'beep'
    | 'go'
    | 'finish';

function noise(audio: AudioContext, seconds: number): AudioBuffer {
    const buffer = audio.createBuffer(
        1,
        Math.max(1, Math.floor(audio.sampleRate * seconds)),
        audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

function tone(
    audio: AudioContext,
    out: AudioNode,
    {
        type,
        from,
        to,
        at,
        duration,
        gain,
    }: {
        type: OscillatorType;
        from: number;
        to?: number;
        at: number;
        duration: number;
        gain: number;
    },
) {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    const start = audio.currentTime + at;
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to) {
        osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    }
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.05);
}

function burst(
    audio: AudioContext,
    out: AudioNode,
    {
        at,
        duration,
        gain,
        filter,
        from,
        to,
    }: {
        at: number;
        duration: number;
        gain: number;
        filter: BiquadFilterType;
        from: number;
        to: number;
    },
) {
    const src = audio.createBufferSource();
    src.buffer = noise(audio, duration);
    const biquad = audio.createBiquadFilter();
    const amp = audio.createGain();
    const start = audio.currentTime + at;
    biquad.type = filter;
    biquad.frequency.setValueAtTime(from, start);
    biquad.frequency.exponentialRampToValueAtTime(to, start + duration);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(biquad).connect(amp).connect(out);
    src.start(start);
}

/** Plays one racing effect on the master output. */
export function playTurboSound(
    audio: AudioContext,
    sound: TurboSound,
    settings: GameSoundSettings,
): void {
    if (!settings.enabled || settings.volume <= 0) {
        return;
    }
    const master = audio.createGain();
    master.gain.value = Math.min(1, settings.volume / 100) * 0.8;
    master.connect(audio.destination);
    switch (sound) {
        case 'nitro':
            burst(audio, master, {
                at: 0,
                duration: 0.7,
                gain: 0.5,
                filter: 'bandpass',
                from: 400,
                to: 3200,
            });
            tone(audio, master, {
                type: 'sawtooth',
                from: 110,
                to: 330,
                at: 0,
                duration: 0.6,
                gain: 0.08,
            });
            break;
        case 'explode':
            burst(audio, master, {
                at: 0,
                duration: 0.9,
                gain: 0.9,
                filter: 'lowpass',
                from: 1800,
                to: 60,
            });
            tone(audio, master, {
                type: 'sine',
                from: 120,
                to: 35,
                at: 0,
                duration: 0.6,
                gain: 0.4,
            });
            break;
        case 'slip':
            tone(audio, master, {
                type: 'triangle',
                from: 900,
                to: 180,
                at: 0,
                duration: 0.5,
                gain: 0.18,
            });
            tone(audio, master, {
                type: 'triangle',
                from: 700,
                to: 140,
                at: 0.25,
                duration: 0.5,
                gain: 0.14,
            });
            break;
        case 'zap':
            burst(audio, master, {
                at: 0,
                duration: 0.35,
                gain: 0.7,
                filter: 'highpass',
                from: 2500,
                to: 6000,
            });
            burst(audio, master, {
                at: 0.12,
                duration: 0.6,
                gain: 0.5,
                filter: 'lowpass',
                from: 1200,
                to: 80,
            });
            break;
        case 'shield':
            [880, 1320, 1760].forEach((f, i) =>
                tone(audio, master, {
                    type: 'sine',
                    from: f,
                    at: i * 0.06,
                    duration: 0.5,
                    gain: 0.1,
                }),
            );
            break;
        case 'item':
            [523, 659, 784, 1047].forEach((f, i) =>
                tone(audio, master, {
                    type: 'square',
                    from: f,
                    at: i * 0.05,
                    duration: 0.12,
                    gain: 0.05,
                }),
            );
            break;
        case 'beep':
            tone(audio, master, {
                type: 'square',
                from: 440,
                at: 0,
                duration: 0.25,
                gain: 0.08,
            });
            break;
        case 'go':
            tone(audio, master, {
                type: 'square',
                from: 880,
                at: 0,
                duration: 0.6,
                gain: 0.09,
            });
            break;
        case 'finish':
            [784, 988, 1175, 1568].forEach((f, i) =>
                tone(audio, master, {
                    type: 'triangle',
                    from: f,
                    at: i * 0.12,
                    duration: 0.35,
                    gain: 0.14,
                }),
            );
            break;
    }
}

/**
 * Engine drone for the projector: a low sawtooth through a low-pass whose
 * pitch follows the field's average speed. Returns a setter and a stop.
 */
export function startEngine(
    audio: AudioContext,
    settings: GameSoundSettings,
): { setSpeed: (kmh: number) => void; stop: () => void } {
    const osc = audio.createOscillator();
    const sub = audio.createOscillator();
    const filter = audio.createBiquadFilter();
    const amp = audio.createGain();
    osc.type = 'sawtooth';
    sub.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const level =
        settings.enabled && settings.volume > 0
            ? Math.min(1, settings.volume / 100) * 0.05
            : 0;
    amp.gain.value = level;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(amp).connect(audio.destination);
    osc.frequency.value = 55;
    sub.frequency.value = 27.5;
    osc.start();
    sub.start();
    return {
        setSpeed(kmh: number) {
            const f = 40 + Math.max(0, Math.min(140, kmh)) * 0.75;
            const t = audio.currentTime;
            osc.frequency.setTargetAtTime(f, t, 0.2);
            sub.frequency.setTargetAtTime(f / 2, t, 0.2);
        },
        stop() {
            const t = audio.currentTime;
            amp.gain.setTargetAtTime(0.0001, t, 0.1);
            osc.stop(t + 0.5);
            sub.stop(t + 0.5);
        },
    };
}
