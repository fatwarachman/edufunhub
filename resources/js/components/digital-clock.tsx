import { useTranslations } from '@/hooks/use-translations';
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let now = 0;

function tick() {
    now = Date.now();
    listeners.forEach((listener) => listener());
    timer = setTimeout(tick, 1000 - (now % 1000));
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (timer === null) {
        tick();
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };
}

const getSnapshot = () => now;
const getServerSnapshot = () => 0;

/**
 * Live digital clock for the site header. The date under the time comes in
 * tiers (full / medium / short); useNavFold picks the longest one that fits
 * the header (data-tier) after the nav labels have folded, phones show the
 * time only. One shared timer ticks on the
 * second boundary for every mounted clock; nothing renders during SSR so
 * the server and client markup match.
 */
export function DigitalClock({ className }: { className?: string }) {
    const { t, i18n } = useTranslations();
    const time = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot,
    );

    if (time === 0) {
        return null;
    }

    const date = new Date(time);
    const locale = i18n.language === 'en' ? 'en-GB' : 'id-ID';
    const parts = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    })
        .formatToParts(date)
        .reduce<Record<string, string>>((acc, part) => {
            acc[part.type] = part.value;
            return acc;
        }, {});
    /* Full names, e.g. "Kamis, 8 Oktober 2026" / "Thursday, 8 October 2026". */
    const day = new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(date);
    /* Shorter tiers for tighter headers: "Kamis, 8 Okt", "Kam, 8 Okt". */
    const mediumDay = new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
    }).format(date);
    const shortDay = new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }).format(date);

    return (
        <time
            dateTime={date.toISOString()}
            className={['edu-clock', className].filter(Boolean).join(' ')}
            aria-label={t('nav.clock', {
                time: `${parts.hour}:${parts.minute}`,
            })}
            title={day}
            data-testid="header-clock"
        >
            <span className="edu-clock-time" aria-hidden="true">
                {parts.hour}
                <span className="edu-clock-colon">:</span>
                {parts.minute}
                <span className="edu-clock-seconds">
                    <span className="edu-clock-colon">:</span>
                    {parts.second}
                </span>
            </span>
            <span className="edu-clock-day" data-day="full" aria-hidden="true">
                {day}
            </span>
            <span
                className="edu-clock-day"
                data-day="medium"
                aria-hidden="true"
            >
                {mediumDay}
            </span>
            <span className="edu-clock-day" data-day="short" aria-hidden="true">
                {shortDay}
            </span>
        </time>
    );
}
