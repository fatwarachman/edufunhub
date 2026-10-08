import { useEffect, useRef } from 'react';

/**
 * Run `tick` every `intervalMs` while the tab is visible. Hidden tabs stop
 * completely (no background requests); when the tab becomes visible again
 * and the last run is older than one interval, `tick` runs right away.
 * Return `false` from `tick` to stop for good (e.g. the session expired).
 */
export function useVisibleInterval(
    tick: () => void | boolean | Promise<void | boolean>,
    intervalMs: number,
    enabled = true,
): void {
    const latest = useRef(tick);

    useEffect(() => {
        latest.current = tick;
    });

    useEffect(() => {
        if (!enabled || typeof document === 'undefined') {
            return;
        }

        let timer: number | null = null;
        let lastRun = Date.now();
        let stopped = false;

        const clear = () => {
            if (timer !== null) {
                window.clearTimeout(timer);
                timer = null;
            }
        };
        const schedule = (delay: number) => {
            clear();
            if (!stopped && !document.hidden) {
                timer = window.setTimeout(run, Math.max(0, delay));
            }
        };
        const run = async () => {
            timer = null;
            lastRun = Date.now();
            const result = await latest.current();
            if (result === false) {
                stopped = true;
                return;
            }
            schedule(intervalMs);
        };
        const onVisibility = () => {
            if (document.hidden) {
                clear();
                return;
            }
            schedule(intervalMs - (Date.now() - lastRun));
        };

        schedule(intervalMs);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            stopped = true;
            clear();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [enabled, intervalMs]);
}
