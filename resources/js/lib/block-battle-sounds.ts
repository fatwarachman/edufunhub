/**
 * Block Battle sound effects, synthesised with Web Audio (no audio files):
 * piece move/rotate ticks, hard-drop thud, line-clear sweep, word/row
 * explosion, garbage incoming, KO, quiz feedback, cannon and monster hits.
 */
import { type GameSoundSettings } from '@/lib/game-sounds';

export type BlockSound =
    | 'move'
    | 'rotate'
    | 'drop'
    | 'clear'
    | 'tetris'
    | 'explode'
    | 'garbage'
    | 'attack'
    | 'ko'
    | 'correct'
    | 'wrong'
    | 'reward'
    | 'cannon'
    | 'monster'
    | 'turn'
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

/** Plays one Block Battle effect on the master output. */
export function playBlockSound(
    audio: AudioContext,
    sound: BlockSound,
    settings: GameSoundSettings,
): void {
    if (!settings.enabled || settings.volume <= 0) {
        return;
    }
    const master = audio.createGain();
    master.gain.value = Math.min(1, settings.volume / 100) * 0.8;
    master.connect(audio.destination);
    switch (sound) {
        case 'move':
            tone(audio, master, {
                type: 'square',
                from: 300,
                at: 0,
                duration: 0.04,
                gain: 0.03,
            });
            break;
        case 'rotate':
            tone(audio, master, {
                type: 'square',
                from: 520,
                to: 780,
                at: 0,
                duration: 0.06,
                gain: 0.035,
            });
            break;
        case 'drop':
            tone(audio, master, {
                type: 'sine',
                from: 180,
                to: 50,
                at: 0,
                duration: 0.18,
                gain: 0.3,
            });
            burst(audio, master, {
                at: 0,
                duration: 0.12,
                gain: 0.25,
                filter: 'lowpass',
                from: 900,
                to: 120,
            });
            break;
        case 'clear':
            burst(audio, master, {
                at: 0,
                duration: 0.35,
                gain: 0.35,
                filter: 'bandpass',
                from: 600,
                to: 4200,
            });
            arpeggio(audio, master, [523, 784], 0.06, 'triangle', 0.12);
            break;
        case 'tetris':
            burst(audio, master, {
                at: 0,
                duration: 0.5,
                gain: 0.4,
                filter: 'bandpass',
                from: 500,
                to: 5000,
            });
            arpeggio(
                audio,
                master,
                [523, 659, 784, 1047, 1319],
                0.06,
                'square',
                0.06,
            );
            break;
        case 'explode':
            burst(audio, master, {
                at: 0,
                duration: 0.7,
                gain: 0.8,
                filter: 'lowpass',
                from: 2400,
                to: 70,
            });
            arpeggio(audio, master, [784, 988, 1175], 0.07, 'triangle', 0.12);
            break;
        case 'garbage':
            tone(audio, master, {
                type: 'sawtooth',
                from: 160,
                to: 70,
                at: 0,
                duration: 0.35,
                gain: 0.12,
            });
            burst(audio, master, {
                at: 0.05,
                duration: 0.3,
                gain: 0.3,
                filter: 'lowpass',
                from: 700,
                to: 90,
            });
            break;
        case 'attack':
            burst(audio, master, {
                at: 0,
                duration: 0.45,
                gain: 0.4,
                filter: 'bandpass',
                from: 2800,
                to: 300,
            });
            tone(audio, master, {
                type: 'sawtooth',
                from: 660,
                to: 160,
                at: 0,
                duration: 0.4,
                gain: 0.06,
            });
            break;
        case 'ko':
            arpeggio(
                audio,
                master,
                [440, 349, 262, 196],
                0.12,
                'square',
                0.07,
                0.2,
            );
            burst(audio, master, {
                at: 0.45,
                duration: 0.6,
                gain: 0.5,
                filter: 'lowpass',
                from: 1200,
                to: 60,
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
        case 'reward':
            arpeggio(
                audio,
                master,
                [784, 1047, 1319, 1568],
                0.05,
                'triangle',
                0.12,
            );
            break;
        case 'cannon':
            tone(audio, master, {
                type: 'sine',
                from: 140,
                to: 40,
                at: 0,
                duration: 0.5,
                gain: 0.45,
            });
            burst(audio, master, {
                at: 0,
                duration: 0.6,
                gain: 0.7,
                filter: 'lowpass',
                from: 1600,
                to: 60,
            });
            break;
        case 'monster':
            tone(audio, master, {
                type: 'sawtooth',
                from: 90,
                to: 55,
                at: 0,
                duration: 0.6,
                gain: 0.16,
            });
            burst(audio, master, {
                at: 0.15,
                duration: 0.5,
                gain: 0.55,
                filter: 'lowpass',
                from: 900,
                to: 50,
            });
            break;
        case 'turn':
            arpeggio(
                audio,
                master,
                [880, 880, 1320],
                0.12,
                'square',
                0.06,
                0.1,
            );
            break;
        case 'beep':
            tone(audio, master, {
                type: 'square',
                from: 440,
                at: 0,
                duration: 0.2,
                gain: 0.07,
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
