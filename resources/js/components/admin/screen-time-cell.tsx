import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { tr } from '@/lib/admin-i18n';
import { useState } from 'react';

export function ScreenTimeCell({
    day,
    hour,
    seconds,
    maximum,
    duration,
    share,
}: {
    day: string;
    hour: number;
    seconds: number;
    maximum: number;
    duration: string;
    share: number;
}) {
    const [open, setOpen] = useState(false);
    const range = `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`;
    const label = `${tr(day)} ${range} · ${duration}`;
    return (
        <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    aria-label={label}
                    onClick={() => setOpen(true)}
                    className="min-h-11 min-w-0 rounded-[3px] bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    data-testid="screen-time-cell"
                    style={
                        seconds > 0
                            ? {
                                  background: `color-mix(in oklab, var(--primary) ${Math.round(15 + (seconds / maximum) * 85)}%, transparent)`,
                              }
                            : undefined
                    }
                />
            </TooltipTrigger>
            <TooltipContent className="flex max-w-64 flex-col gap-1.5 border border-border bg-popover p-3 text-popover-foreground shadow-md dark:border-white/15">
                <strong>
                    {tr(day)} · {range}
                </strong>
                <span>{tr('Total active time: {0}', [duration])}</span>
                <span>{tr('Share of selected period: {0}%', [share])}</span>
                <span className="text-xs">
                    {tr(
                        'Summed across users and matching weekdays in the selected period. Assigned by session start in local time.',
                    )}
                </span>
            </TooltipContent>
        </Tooltip>
    );
}
