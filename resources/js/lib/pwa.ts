/**
 * PWA helpers: registers the service worker and keeps the browser's install
 * prompt so the dashboard can offer an "Install app" button whenever it is
 * mounted (the prompt event may fire before that page renders).
 */

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'installed' | 'available' | 'ios' | 'unsupported';

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit(): void {
    listeners.forEach((listener) => listener());
}

function isStandalone(): boolean {
    return (
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

function isIos(): boolean {
    const ua = navigator.userAgent;
    return (
        /iPad|iPhone|iPod/.test(ua) ||
        (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
    );
}

export function installState(): InstallState {
    if (typeof window === 'undefined') {
        return 'unsupported';
    }
    if (installed || isStandalone()) {
        return 'installed';
    }
    if (deferred) {
        return 'available';
    }
    if (isIos()) {
        return 'ios';
    }
    return 'unsupported';
}

export function subscribeInstall(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Shows the browser install dialog. Returns true when the player accepted. */
export async function promptInstall(): Promise<boolean> {
    if (!deferred) {
        return false;
    }
    const event = deferred;
    deferred = null;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
        installed = true;
    }
    emit();
    return choice.outcome === 'accepted';
}

export function initPwa(): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferred = event as BeforeInstallPromptEvent;
        emit();
    });
    window.addEventListener('appinstalled', () => {
        installed = true;
        deferred = null;
        emit();
    });
    if ('serviceWorker' in navigator && window.isSecureContext) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('/sw.js', { scope: '/' })
                .catch(() => undefined);
        });
    }
}
