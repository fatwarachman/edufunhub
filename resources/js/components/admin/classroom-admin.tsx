import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { BrainCircuit } from 'lucide-react';

export type AdminClassroomStatus = 'scheduled' | 'active' | 'ended';

export type ClassroomAiStatus = 'queued' | 'running' | 'done' | 'failed' | null;

const STATUS_STYLES: Record<AdminClassroomStatus, string> = {
    scheduled: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    ended: 'bg-muted text-muted-foreground',
};

export const STATUS_LABELS: Record<AdminClassroomStatus, string> = {
    scheduled: 'Scheduled',
    active: 'Active now',
    ended: 'Ended',
};

/** Classroom status: scheduled, active now or ended. */
export function ClassroomStatusPill({
    status,
}: {
    status: AdminClassroomStatus;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                STATUS_STYLES[status],
            )}
            data-testid="classroom-status"
            data-status={status}
        >
            {status === 'active' && (
                <span
                    className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse"
                    aria-hidden="true"
                />
            )}
            {tr(STATUS_LABELS[status])}
        </span>
    );
}

const AI_STYLES: Record<string, string> = {
    done: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    queued: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    running:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    none: 'bg-muted text-muted-foreground',
};

const AI_LABELS: Record<string, string> = {
    done: 'Analyzed',
    queued: 'Analysis queued',
    running: 'Analysis running',
    failed: 'Analysis failed',
    none: 'Not analyzed',
};

/** AI class analysis status of a classroom. */
export function ClassroomAiPill({ status }: { status: ClassroomAiStatus }) {
    const key = status ?? 'none';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                AI_STYLES[key] ?? AI_STYLES.none,
            )}
            data-testid="classroom-ai-status"
            data-status={key}
        >
            <BrainCircuit className="size-3" aria-hidden="true" />
            {tr(AI_LABELS[key] ?? AI_LABELS.none)}
        </span>
    );
}

/** Green "online now" dot with an accessible label. */
export function OnlineNowDot({ online }: { online: boolean }) {
    return (
        <span
            className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap"
            data-testid="classroom-member-online"
            data-online={online ? 'true' : 'false'}
        >
            <span
                className={cn(
                    'size-2 shrink-0 rounded-full',
                    online
                        ? 'bg-emerald-500 ring-2 ring-emerald-500/25'
                        : 'bg-muted-foreground/30',
                )}
                aria-hidden="true"
            />
            <span
                className={
                    online
                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                        : 'text-muted-foreground'
                }
            >
                {online ? tr('Online now') : tr('Offline')}
            </span>
        </span>
    );
}
