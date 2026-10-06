/** A ping every PING_MS; a link silent for STALE_MS is treated as dead. */
export const SOCKET_PING_MS = 10000;
export const SOCKET_STALE_MS = 25000;

/**
 * Keeps a game WebSocket honest on phones. A locked screen or a switched
 * app often leaves a dead socket that still reports OPEN and never fires
 * `close`, so the player keeps looking at a stale dice or question dialog.
 * This pings every SOCKET_PING_MS, and calls `reconnect` when nothing arrived
 * for SOCKET_STALE_MS, when the page becomes visible again without an answer
 * to a fresh ping, or when the network comes back. Reconnecting makes the
 * game service send the current state again.
 *
 * Call `seen()` on every message received. Returns a cleanup function.
 */
export function watchSocket({
    current,
    ping,
    reconnect,
}: {
    current: () => WebSocket | null;
    ping: () => void;
    reconnect: () => void;
}): { seen: () => void; stop: () => void } {
    let lastSeen = Date.now();
    let stopped = false;
    const seen = () => {
        lastSeen = Date.now();
    };
    const tick = () => {
        const ws = current();
        if (!ws) {
            return;
        }
        if (Date.now() - lastSeen > SOCKET_STALE_MS) {
            lastSeen = Date.now();
            reconnect();
            return;
        }
        if (ws.readyState === WebSocket.OPEN) {
            ping();
        }
    };
    const onVisible = () => {
        if (document.visibilityState !== 'visible' || stopped) {
            return;
        }
        const ws = current();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            lastSeen = Date.now();
            reconnect();
            return;
        }
        const asked = Date.now();
        ping();
        setTimeout(() => {
            if (!stopped && current() === ws && lastSeen < asked) {
                lastSeen = Date.now();
                reconnect();
            }
        }, 4000);
    };
    const interval = setInterval(tick, SOCKET_PING_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('pageshow', onVisible);
    return {
        seen,
        stop: () => {
            stopped = true;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', onVisible);
            window.removeEventListener('pageshow', onVisible);
        },
    };
}
