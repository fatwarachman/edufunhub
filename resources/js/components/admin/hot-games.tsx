import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

/** Day navigation props shared by the hottest games pages. */
export interface HotDayProps {
    date: string;
    today: string;
    isToday: boolean;
    previous: string;
    next: string | null;
    minDate: string;
    timezone: string;
}

export const HOT_GAMES_URL = '/admin/hot-games';

/** "Sabtu, 10 Oktober 2026" for a Y-m-d date (no timezone shift). */
export function formatDay(date: string, style: 'long' | 'short' = 'long') {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString(adminLocale(), {
        timeZone: 'UTC',
        ...(style === 'long'
            ? {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
              }
            : { weekday: 'short', day: 'numeric', month: 'short' }),
    });
}

/** Clock time of an ISO timestamp in the report timezone. */
export function formatTime(value: string, timezone: string) {
    return new Date(value).toLocaleTimeString(adminLocale(), {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Previous / date picker / next day, plus a jump back to today. */
export function DayNavigator({
    day,
    url,
}: {
    day: HotDayProps;
    /** Page URL without the date query. */
    url: string;
}) {
    const go = (date: string | null) => {
        if (!date) {
            return;
        }
        router.get(url, date === day.today ? {} : { date }, {
            preserveScroll: true,
        });
    };
    const button =
        'inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40';

    return (
        <div
            className="flex flex-wrap items-center gap-2"
            data-testid="hot-games-day-nav"
        >
            <button
                type="button"
                onClick={() => go(day.previous)}
                disabled={day.previous < day.minDate}
                className={button}
                aria-label={tr('Previous day')}
                title={tr('Previous day')}
                data-testid="hot-games-prev"
            >
                <ChevronLeft className="size-4" />
            </button>
            <label className="relative inline-flex h-9 items-center">
                <CalendarDays
                    className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
                    aria-hidden
                />
                <span className="sr-only">{tr('Choose a day')}</span>
                <input
                    type="date"
                    value={day.date}
                    min={day.minDate}
                    max={day.today}
                    onChange={(event) => go(event.target.value || null)}
                    className="h-9 rounded-lg border border-input bg-background pr-3 pl-9 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    data-testid="hot-games-date"
                />
            </label>
            <button
                type="button"
                onClick={() => go(day.next)}
                disabled={!day.next}
                className={button}
                aria-label={tr('Next day')}
                title={tr('Next day')}
                data-testid="hot-games-next"
            >
                <ChevronRight className="size-4" />
            </button>
            <button
                type="button"
                onClick={() => go(day.today)}
                disabled={day.isToday}
                className={cn(
                    'h-9 rounded-lg px-3 text-sm font-medium',
                    day.isToday
                        ? 'bg-primary/10 text-primary'
                        : 'border border-input text-foreground hover:bg-muted',
                )}
                data-testid="hot-games-today"
            >
                {tr('Today')}
            </button>
        </div>
    );
}

/** Rank badge: gold, silver, bronze, then plain. */
export function RankBadge({ rank }: { rank: number }) {
    const tone =
        rank === 1
            ? 'bg-amber-400 text-amber-950'
            : rank === 2
              ? 'bg-slate-300 text-slate-900'
              : rank === 3
                ? 'bg-orange-300 text-orange-950'
                : 'bg-muted text-muted-foreground';
    return (
        <span
            className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                tone,
            )}
        >
            {rank}
        </span>
    );
}
