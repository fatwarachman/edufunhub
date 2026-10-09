/**
 * Monster Café sound effects, synthesised with Web Audio (no audio files):
 * pantry pick, quiz feedback, plating, oven start / ready ding / burnt,
 * served cash register, angry monster growl, rat squeak, shoo swoosh,
 * pie throw and splat, timer beep and the win fanfare.
 */
import { type GameSoundSettings } from '@/lib/game-sounds';

export type CafeSound =
    | 'pick'
    | 'correct'
    | 'wrong'
    | 'plate'
    | 'cook'
    | 'ding'
    | 'burnt'
    | 'serve'
    | 'angry'
    | 'rat'
    | 'shoo'
    | 'pie'
    | 'splat'
    | 'beep'
    | 'win';

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
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
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

function arpeggio(
    audio: AudioContext,
    out: AudioNode,
    notes: number[],
    step: number,
    type: OscillatorType,
    gain: number,
    duration = 0.16,
) {
    notes.forEach((from, i) =>
        tone(audio, out, { type, from, at: i * step, duration, gain }),
    );
}

/** Plays one Monster Café effect; respects the admin sound settings. */
export function playCafeSound(
    audio: AudioContext,
    sound: CafeSound,
    settings: GameSoundSettings,
): void {
    if (!settings.enabled || settings.volume <= 0) {
        return;
    }
    const master = audio.createGain();
    master.gain.value = Math.min(1, settings.volume / 100) * 0.8;
    master.connect(audio.destination);
    switch (sound) {
        case 'pick':
            tone(audio, master, {
                type: 'triangle',
                from: 520,
                to: 700,
                at: 0,
                duration: 0.07,
                gain: 0.08,
            });
            break;
        case 'correct':
            arpeggio(audio, master, [659, 988], 0.08, 'triangle', 0.14, 0.2);
            break;
        case 'wrong':
            tone(audio, master, {
                type: 'square',
                from: 220,
                to: 140,
                at: 0,
                duration: 0.32,
                gain: 0.07,
            });
            break;
        case 'plate':
            tone(audio, master, {
                type: 'sine',
                from: 900,
                to: 600,
                at: 0,
                duration: 0.08,
                gain: 0.12,
            });
            break;
        case 'cook':
            burst(audio, master, {
                at: 0,
                duration: 0.5,
                gain: 0.22,
                filter: 'bandpass',
                from: 1800,
                to: 600,
            });
            break;
        case 'ding':
            tone(audio, master, {
                type: 'sine',
                from: 1568,
                at: 0,
                duration: 0.6,
                gain: 0.18,
            });
            tone(audio, master, {
                type: 'sine',
                from: 2093,
                at: 0.02,
                duration: 0.5,
                gain: 0.08,
            });
            break;
        case 'burnt':
            burst(audio, master, {
                at: 0,
                duration: 0.6,
                gain: 0.45,
                filter: 'lowpass',
                from: 1400,
                to: 80,
            });
            arpeggio(audio, master, [330, 262, 196], 0.12, 'square', 0.06);
            break;
        case 'serve':
            arpeggio(audio, master, [784, 1047, 1319], 0.06, 'triangle', 0.13);
            burst(audio, master, {
                at: 0.18,
                duration: 0.12,
                gain: 0.15,
                filter: 'highpass',
                from: 3000,
                to: 6000,
            });
            break;
        case 'angry':
            tone(audio, master, {
                type: 'sawtooth',
                from: 120,
                to: 60,
                at: 0,
                duration: 0.55,
                gain: 0.14,
            });
            break;
        case 'rat':
            arpeggio(
                audio,
                master,
                [2200, 2600, 2200],
                0.07,
                'square',
                0.04,
                0.06,
            );
            break;
        case 'shoo':
            burst(audio, master, {
                at: 0,
                duration: 0.3,
                gain: 0.3,
                filter: 'bandpass',
                from: 600,
                to: 3600,
            });
            break;
        case 'pie':
            tone(audio, master, {
                type: 'sine',
                from: 400,
                to: 1200,
                at: 0,
                duration: 0.25,
                gain: 0.1,
            });
            break;
        case 'splat':
            burst(audio, master, {
                at: 0,
                duration: 0.35,
                gain: 0.6,
                filter: 'lowpass',
                from: 1600,
                to: 90,
            });
            break;
        case 'beep':
            tone(audio, master, {
                type: 'square',
                from: 440,
                at: 0,
                duration: 0.12,
                gain: 0.05,
            });
            break;
        case 'win':
            arpeggio(
                audio,
                master,
                [523, 659, 784, 1047, 784, 1047],
                0.12,
                'triangle',
                0.14,
                0.3,
            );
            break;
    }
}
