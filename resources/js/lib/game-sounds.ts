/**
 * Synthesised game sound effects (Web Audio, no audio files). The super
 * admin picks the correct/wrong answer sounds and the volume; games read the
 * choice from the shared `gameSounds` Inertia prop.
 */

export type GameSound = 'dice' | 'correct' | 'step' | 'wrong' | 'shoot';

export const CORRECT_SOUNDS = ['bell', 'chime', 'coin', 'classic'] as const;
export const WRONG_SOUNDS = ['buzzer', 'boing', 'thud', 'classic'] as const;

export type CorrectSound = (typeof CORRECT_SOUNDS)[number];
export type WrongSound = (typeof WRONG_SOUNDS)[number];

export interface GameSoundSettings {
    enabled: boolean;
    /** 0–100. */
    volume: number;
    correct: CorrectSound;
    wrong: WrongSound;
}

export const DEFAULT_SOUND_SETTINGS: GameSoundSettings = {
    enabled: true,
    volume: 70,
    correct: 'bell',
    wrong: 'buzzer',
};

interface Tone {
    frequency: number;
    /** Seconds after the sound starts. */
    at: number;
    duration: number;
    type: OscillatorType;
    /** Peak gain before the master volume. */
    gain: number;
    /** Frequency the tone glides to (optional). */
    glideTo?: number;
    attack?: number;
}

/** Struck bell: a fundamental plus inharmonic partials with a long decay. */
function bell(frequency: number, at: number, gain = 0.22): Tone[] {
    return [
        { ratio: 1, level: 1, decay: 1.4 },
        { ratio: 2.0, level: 0.45, decay: 1 },
        { ratio: 2.76, level: 0.3, decay: 0.7 },
        { ratio: 5.4, level: 0.12, decay: 0.35 },
    ].map(({ ratio, level, decay }) => ({
        frequency: frequency * ratio,
        at,
        duration: decay,
        type: 'sine',
        gain: gain * level,
        attack: 0.003,
    }));
}

function correctTones(kind: CorrectSound): Tone[] {
    switch (kind) {
        case 'bell':
            return [...bell(1318.5, 0), ...bell(1975.5, 0.13, 0.18)];
        case 'chime':
            return [1046.5, 1318.5, 1568, 2093].map((frequency, index) => ({
                frequency,
                at: index * 0.07,
                duration: 0.55,
                type: 'sine' as const,
                gain: 0.14,
            }));
        case 'coin':
            return [
                {
                    frequency: 988,
                    at: 0,
                    duration: 0.08,
                    type: 'square',
                    gain: 0.06,
                },
                {
                    frequency: 1319,
                    at: 0.08,
                    duration: 0.32,
                    type: 'square',
                    gain: 0.06,
                },
            ];
        default:
            return [523, 659, 784].map((frequency, index) => ({
                frequency,
                at: index * 0.12,
                duration: 0.15,
                type: 'sine' as const,
                gain: 0.12,
                glideTo: frequency * 0.5,
            }));
    }
}

function wrongTones(kind: WrongSound): Tone[] {
    switch (kind) {
        case 'buzzer':
            return [0, 0.2].flatMap((at) => [
                {
                    frequency: 150,
                    at,
                    duration: 0.17,
                    type: 'sawtooth' as const,
                    gain: 0.08,
                    glideTo: 120,
                },
                {
                    frequency: 153,
                    at,
                    duration: 0.17,
                    type: 'square' as const,
                    gain: 0.04,
                    glideTo: 122,
                },
            ]);
        case 'boing':
            return [
                {
                    frequency: 392,
                    at: 0,
                    duration: 0.22,
                    type: 'triangle',
                    gain: 0.16,
                    glideTo: 294,
                },
                {
                    frequency: 311,
                    at: 0.22,
                    duration: 0.42,
                    type: 'triangle',
                    gain: 0.16,
                    glideTo: 196,
                },
            ];
        case 'thud':
            return [
                {
                    frequency: 140,
                    at: 0,
                    duration: 0.3,
                    type: 'sine',
                    gain: 0.3,
                    glideTo: 55,
                },
                {
                    frequency: 90,
                    at: 0,
                    duration: 0.18,
                    type: 'triangle',
                    gain: 0.12,
                    glideTo: 45,
                },
            ];
        default:
            return [
                {
                    frequency: 150,
                    at: 0,
                    duration: 0.15,
                    type: 'triangle',
                    gain: 0.12,
                    glideTo: 75,
                },
            ];
    }
}

function effectTones(sound: Exclude<GameSound, 'correct' | 'wrong'>): Tone[] {
    const frequency =
        sound === 'step'
            ? 340
            : sound === 'dice'
              ? 180 + Math.random() * 180
              : 900;
    return [
        {
            frequency,
            at: 0,
            duration: 0.15,
            type: 'triangle',
            gain: 0.12,
            glideTo: frequency * 0.5,
        },
    ];
}

export function tonesFor(
    sound: GameSound,
    settings: GameSoundSettings,
): Tone[] {
    if (sound === 'correct') {
        return correctTones(settings.correct);
    }
    if (sound === 'wrong') {
        return wrongTones(settings.wrong);
    }
    return effectTones(sound);
}

/** Schedules one sound on the given context. Returns nothing; errors are swallowed. */
export function playGameSound(
    audio: AudioContext,
    sound: GameSound,
    settings: GameSoundSettings,
): void {
    if (!settings.enabled || settings.volume <= 0) {
        return;
    }
    const master = audio.createGain();
    master.gain.value = Math.min(1, Math.max(0, settings.volume / 100)) * 0.9;
    master.connect(audio.destination);
    const now = audio.currentTime;
    let last = now;

    for (const tone of tonesFor(sound, settings)) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = now + tone.at;
        const end = start + tone.duration;
        const attack = tone.attack ?? 0.01;
        oscillator.type = tone.type;
        oscillator.frequency.setValueAtTime(tone.frequency, start);
        if (tone.glideTo) {
            oscillator.frequency.exponentialRampToValueAtTime(
                tone.glideTo,
                end,
            );
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(tone.gain, start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(end + 0.02);
        oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
        };
        last = Math.max(last, end);
    }

    window.setTimeout(
        () => master.disconnect(),
        Math.ceil((last - now + 0.1) * 1000),
    );
}

/** Normalises the shared prop so unknown values fall back to the defaults. */
export function soundSettings(raw: unknown): GameSoundSettings {
    const value = (raw ?? {}) as Partial<GameSoundSettings>;
    return {
        enabled: value.enabled ?? DEFAULT_SOUND_SETTINGS.enabled,
        volume:
            typeof value.volume === 'number'
                ? value.volume
                : DEFAULT_SOUND_SETTINGS.volume,
        correct: CORRECT_SOUNDS.includes(value.correct as CorrectSound)
            ? (value.correct as CorrectSound)
            : DEFAULT_SOUND_SETTINGS.correct,
        wrong: WRONG_SOUNDS.includes(value.wrong as WrongSound)
            ? (value.wrong as WrongSound)
            : DEFAULT_SOUND_SETTINGS.wrong,
    };
}
