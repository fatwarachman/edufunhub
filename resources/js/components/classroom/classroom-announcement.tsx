import { type ChatEvent, useChatEvents } from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import http from '@/lib/http';
import { Megaphone } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Announcement as sent by the server (props, polling and live events). */
export interface ClassroomAnnouncementPayload {
    id: number;
    classroom_id?: number;
    title: string | null;
    body: string;
    display_seconds?: number;
    starts_at: string;
    ends_at: string;
    remaining_seconds: number;
}

interface ShownAnnouncement {
    id: number;
    title: string | null;
    body: string;
    /** Client clock deadline derived from the server's remaining seconds. */
    deadline: number;
    totalMs: number;
}

/** Fallback poll when the live chat socket is down. */
const POLL_MS = 20_000;

/**
 * Deadlines already computed in this tab, so switching between the class
 * page and the 3D room (remount) keeps the original end time.
 */
const deadlines = new Map<number, number>();

const seenKey = (id: number) => `classroom-announcement-seen:${id}`;

function wasSeen(id: number): boolean {
    try {
        return sessionStorage.getItem(seenKey(id)) === '1';
    } catch {
        return false;
    }
}

function markSeen(id: number): void {
    try {
        sessionStorage.setItem(seenKey(id), '1');
    } catch {
        // Storage may be unavailable (private mode); the modal still closes.
    }
}

/**
 * Converts a server payload into a client deadline. The server's remaining
 * seconds are trusted over the client clock, so a wrong device time cannot
 * keep the modal open or hide it early.
 */
function toShown(
    payload: ClassroomAnnouncementPayload,
): ShownAnnouncement | null {
    const remainingMs = Math.max(0, Number(payload.remaining_seconds) * 1000);
    if (remainingMs <= 0 || wasSeen(payload.id)) {
        return null;
    }
    const startsMs = new Date(payload.starts_at).getTime();
    const endsMs = new Date(payload.ends_at).getTime();
    const serverTotal =
        Number.isFinite(startsMs) && Number.isFinite(endsMs)
            ? endsMs - startsMs
            : 0;
    const deadline = Math.min(
        deadlines.get(payload.id) ?? Number.POSITIVE_INFINITY,
        Date.now() + remainingMs,
    );
    deadlines.set(payload.id, deadline);
    const totalMs = Math.max(
        remainingMs,
        (payload.display_seconds ?? 0) * 1000,
        serverTotal,
    );

    return {
        id: payload.id,
        title: payload.title,
        body: payload.body,
        deadline,
        totalMs,
    };
}

/**
 * Shows the teacher's announcement to an active classroom member as a modal
 * the student cannot close (no close button, Esc and backdrop ignored). It
 * disappears on its own when the display time runs out or the teacher stops
 * it. Live events arrive over the chat socket; the endpoint is polled as a
 * fallback. A finished announcement never shows again in this tab.
 */
export function ClassroomAnnouncementGate({
    pin,
    classroomId,
    initial,
}: {
    pin: string;
    classroomId: number;
    initial: ClassroomAnnouncementPayload | null | undefined;
}) {
    const [shown, setShown] = useState<ShownAnnouncement | null>(() =>
        initial ? toShown(initial) : null,
    );

    const finish = useCallback((id: number) => {
        markSeen(id);
        setShown((current) => (current?.id === id ? null : current));
    }, []);

    const offer = useCallback((payload: ClassroomAnnouncementPayload) => {
        const next = toShown(payload);
        if (next) {
            setShown((current) =>
                current && current.id === next.id ? current : next,
            );
        }
    }, []);

    useChatEvents(
        useCallback(
            (event: ChatEvent) => {
                if (Number(event.classroom_id) !== classroomId) {
                    return;
                }
                if (
                    event.t === 'classroom_announcement' &&
                    event.announcement
                ) {
                    offer(event.announcement as ClassroomAnnouncementPayload);
                }
                if (event.t === 'classroom_announcement_end') {
                    finish(Number(event.id));
                }
            },
            [classroomId, finish, offer],
        ),
    );

    useVisibleInterval(async () => {
        try {
            const { data, response } = await http.get<{
                announcement: ClassroomAnnouncementPayload | null;
            }>(`/portal/classrooms/${pin}/announcement`);
            if (response.status === 401 || response.status === 403) {
                return false;
            }
            if (!response.ok || !data) {
                return;
            }
            if (data.announcement) {
                offer(data.announcement);
            } else {
                setShown((current) => {
                    if (current) {
                        markSeen(current.id);
                    }
                    return null;
                });
            }
        } catch {
            // Network hiccup: try again on the next tick.
        }
    }, POLL_MS);

    if (!shown) {
        return null;
    }

    return (
        <AnnouncementModal
            key={shown.id}
            announcement={shown}
            onDone={() => finish(shown.id)}
        />
    );
}

function AnnouncementModal({
    announcement,
    onDone,
}: {
    announcement: ShownAnnouncement;
    onDone: () => void;
}) {
    const { t } = useTranslations();
    const titleId = useId();
    const bodyId = useId();
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const doneRef = useRef(onDone);

    useEffect(() => {
        doneRef.current = onDone;
    }, [onDone]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 250);
        const end = window.setTimeout(
            () => doneRef.current(),
            Math.max(0, announcement.deadline - Date.now()),
        );
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(end);
        };
    }, [announcement.deadline]);

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialogRef.current?.focus();

        /**
         * Captured before any page handler (3D room movement keys, other
         * dialogs' Esc): keys never leave the modal and focus stays inside.
         */
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
            }
            event.stopPropagation();
            if (!dialogRef.current?.contains(document.activeElement)) {
                dialogRef.current?.focus();
            }
        };
        const onFocus = (event: FocusEvent) => {
            if (
                dialogRef.current &&
                !dialogRef.current.contains(event.target as Node)
            ) {
                dialogRef.current.focus();
            }
        };
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
        document.addEventListener('focusin', onFocus);

        return () => {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('keyup', onKey, true);
            document.removeEventListener('focusin', onFocus);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
        };
    }, []);

    if (typeof document === 'undefined') {
        return null;
    }

    const remainingMs = Math.max(0, announcement.deadline - now);
    const seconds = Math.ceil(remainingMs / 1000);
    const percent =
        announcement.totalMs > 0
            ? Math.min(100, (remainingMs / announcement.totalMs) * 100)
            : 0;

    return createPortal(
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#1f2a44]/70 p-3 backdrop-blur-sm sm:p-4"
            data-testid="classroom-announcement-backdrop"
        >
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                tabIndex={-1}
                className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border-[3px] border-[#1f2a44] bg-[#FFFDF7] text-[#1f2a44] shadow-[6px_6px_0px_#1f2a44] outline-none motion-safe:animate-in motion-safe:zoom-in-95"
                data-testid="classroom-announcement-modal"
            >
                <div className="flex items-start gap-3 border-b-2 border-[#1f2a44]/10 px-5 pt-5 pb-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-[#1f2a44] bg-[#ffd93d]">
                        <Megaphone className="size-6" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold tracking-wide text-[#1f2a44]/60 uppercase">
                            {t('classroom.announcement.label')}
                        </p>
                        <h2
                            id={titleId}
                            className="text-lg leading-snug font-bold break-words"
                        >
                            {announcement.title ||
                                t('classroom.announcement.defaultTitle')}
                        </h2>
                    </div>
                    <span
                        className="shrink-0 rounded-full border-2 border-[#1f2a44] bg-white px-2.5 py-1 text-sm font-bold tabular-nums"
                        aria-live="off"
                        data-testid="classroom-announcement-countdown"
                    >
                        {t('classroom.announcement.seconds', {
                            count: seconds,
                        })}
                    </span>
                </div>
                <div className="overflow-y-auto px-5 py-4">
                    <p
                        id={bodyId}
                        className="text-base leading-relaxed font-semibold break-words whitespace-pre-line"
                        data-testid="classroom-announcement-body"
                    >
                        {announcement.body}
                    </p>
                </div>
                <div className="flex flex-col gap-2 border-t-2 border-[#1f2a44]/10 px-5 pt-3 pb-4">
                    <div
                        className="h-2.5 w-full overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white"
                        role="progressbar"
                        aria-label={t('classroom.announcement.timeLeft')}
                        aria-valuemin={0}
                        aria-valuemax={Math.round(announcement.totalMs / 1000)}
                        aria-valuenow={seconds}
                    >
                        <div
                            className="h-full bg-[#f5a623] transition-[width] duration-300 ease-linear"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <p className="text-xs font-semibold text-[#1f2a44]/60">
                        {t('classroom.announcement.autoClose')}
                    </p>
                </div>
            </div>
        </div>,
        document.body,
    );
}
