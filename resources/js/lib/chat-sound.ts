/**
 * Short "ting" for incoming chat messages, synthesised with Web Audio (no
 * audio file). One shared AudioContext is created lazily and unlocked on the
 * first user gesture, because browsers block audio before any interaction.
 * Rate limited so a burst of messages plays a single ting.
 */

const MIN_GAP_MS = 1500;
const MUTE_KEY = 'edu-chat-sound-muted';

let audio: AudioContext | null = null;
let lastPlayed = 0;
let unlockBound = false;

type AudioContextCtor = typeof AudioContext;

function context(): AudioContext | null {
    if (audio) {
        return audio;
    }
    const Ctor: AudioContextCtor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor })
            .webkitAudioContext;
    if (!Ctor) {
        return null;
    }
    try {
        audio = new Ctor();
    } catch {
        audio = null;
    }
    return audio;
}

function unlock(): void {
    const ctx = context();
    if (ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
    }
}

/** Resumes the shared context on the first pointer or key press. */
export function bindChatSoundUnlock(): void {
    if (unlockBound || typeof window === 'undefined') {
        return;
    }
    unlockBound = true;
    const handler = () => {
        unlock();
        window.removeEventListener('pointerdown', handler, true);
        window.removeEventListener('keydown', handler, true);
    };
    window.addEventListener('pointerdown', handler, true);
    window.addEventListener('keydown', handler, true);
}

export function chatSoundMuted(): boolean {
    try {
        return window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Plays the ting (two bright sine partials with a fast decay). `soft`
 * lowers the level, used for messages in the conversation already on screen.
 * Returns whether a sound was started.
 */
export function playChatTing(soft = false): boolean {
    const now = Date.now();
    if (now - lastPlayed < MIN_GAP_MS || chatSoundMuted()) {
        return false;
    }
    const ctx = context();
    if (!ctx) {
        return false;
    }
    if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
    }
    lastPlayed = now;
    const start = ctx.currentTime + 0.01;
    const level = soft ? 0.08 : 0.18;
    [
        { frequency: 1320, gain: level, decay: 0.35 },
        { frequency: 1760, gain: level * 0.55, decay: 0.25 },
    ].forEach(({ frequency, gain, decay }) => {
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, start);
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(gain, start + 0.005);
        amp.gain.exponentialRampToValueAtTime(0.0001, start + decay);
        osc.connect(amp);
        amp.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + decay + 0.05);
    });
    return true;
}
