import {
    dangerButtonClass,
    primaryButtonClass,
    useNow,
} from '@/components/classroom/classroom-ui';
import { teacherFieldClass } from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { router, useForm } from '@inertiajs/react';
import { Megaphone, Send, Square } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';

/** Announcement row in the teacher's list (show page prop). */
export interface TeacherAnnouncement {
    id: number;
    title: string | null;
    body: string;
    display_seconds: number;
    starts_at: string;
    ends_at: string;
    active: boolean;
    remaining_seconds: number;
}

const QUICK_SECONDS = [10, 30, 60, 120, 300] as const;
const MIN_SECONDS = 5;
const MAX_SECONDS = 600;
const MAX_BODY = 1000;
const MAX_TITLE = 120;

/**
 * Live tab card: send a popup announcement to every active participant for
 * a chosen number of seconds, and stop running ones early.
 */
export function ClassroomAnnouncementCard({
    classroomId,
    active,
    announcements,
}: {
    classroomId: number;
    active: boolean;
    announcements: TeacherAnnouncement[];
}) {
    const { t } = useTranslations();
    const titleId = useId();
    const bodyId = useId();
    const customId = useId();
    const form = useForm<{
        title: string;
        body: string;
        display_seconds: number;
    }>({ title: '', body: '', display_seconds: 30 });
    const [stopping, setStopping] = useState<number | null>(null);
    const [receivedAt, setReceivedAt] = useState(() => Date.now());
    const now = useNow(active && announcements.some((a) => a.active));

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setReceivedAt(Date.now());
    }, [announcements]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(`/teacher/classrooms/${classroomId}/announcements`, {
            preserveScroll: true,
            onSuccess: () => form.reset('title', 'body'),
        });
    };

    const stop = (id: number) => {
        router.post(
            `/teacher/classrooms/${classroomId}/announcements/${id}/stop`,
            {},
            {
                preserveScroll: true,
                onStart: () => setStopping(id),
                onFinish: () => setStopping(null),
            },
        );
    };

    const remainingOf = (item: TeacherAnnouncement) =>
        Math.max(
            0,
            Math.ceil(item.remaining_seconds - (now - receivedAt) / 1000),
        );

    const seconds = form.data.display_seconds;
    const disabled = !active || form.processing;

    return (
        <section
            className="auth-card flex flex-col gap-4 !p-5"
            data-testid="classroom-announcement-card"
        >
            <div className="flex flex-col gap-1">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Megaphone className="size-5" aria-hidden="true" />
                    {t('classroom.announcement.cardTitle')}
                </h2>
                <p className="text-xs text-muted-foreground">
                    {active
                        ? t('classroom.announcement.cardHint')
                        : t('classroom.announcement.inactiveHint')}
                </p>
            </div>

            <form className="flex flex-col gap-3" onSubmit={submit}>
                <fieldset disabled={!active} className="contents">
                    <label htmlFor={titleId} className="flex flex-col gap-1.5">
                        <span className="text-sm font-bold">
                            {t('classroom.announcement.titleLabel')}
                        </span>
                        <input
                            id={titleId}
                            type="text"
                            value={form.data.title}
                            maxLength={MAX_TITLE}
                            onChange={(e) =>
                                form.setData('title', e.target.value)
                            }
                            placeholder={t(
                                'classroom.announcement.titlePlaceholder',
                            )}
                            className={teacherFieldClass}
                            data-testid="classroom-announcement-title"
                        />
                        {form.errors.title && (
                            <span className="text-xs font-semibold text-[#8e2a1f]">
                                {form.errors.title}
                            </span>
                        )}
                    </label>
                    <label htmlFor={bodyId} className="flex flex-col gap-1.5">
                        <span className="text-sm font-bold">
                            {t('classroom.announcement.bodyLabel')}
                        </span>
                        <textarea
                            id={bodyId}
                            value={form.data.body}
                            maxLength={MAX_BODY}
                            rows={3}
                            required
                            onChange={(e) =>
                                form.setData('body', e.target.value)
                            }
                            placeholder={t(
                                'classroom.announcement.bodyPlaceholder',
                            )}
                            className={cn(teacherFieldClass, 'py-2')}
                            data-testid="classroom-announcement-body-input"
                        />
                        <span className="self-end text-xs text-muted-foreground tabular-nums">
                            {form.data.body.length}/{MAX_BODY}
                        </span>
                        {form.errors.body && (
                            <span className="text-xs font-semibold text-[#8e2a1f]">
                                {form.errors.body}
                            </span>
                        )}
                    </label>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-bold">
                            {t('classroom.announcement.durationLabel')}
                        </span>
                        <div
                            className="flex flex-wrap items-center gap-2"
                            role="group"
                            aria-label={t(
                                'classroom.announcement.durationLabel',
                            )}
                        >
                            {QUICK_SECONDS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={seconds === value}
                                    onClick={() =>
                                        form.setData('display_seconds', value)
                                    }
                                    className={cn(
                                        'min-h-11 rounded-full border-2 border-[#1f2a44] px-3 text-sm font-bold disabled:opacity-50',
                                        seconds === value
                                            ? 'bg-[#1f2a44] text-white'
                                            : 'bg-white hover:bg-[#FFF176]',
                                    )}
                                    data-testid={`classroom-announcement-duration-${value}`}
                                >
                                    {t('classroom.announcement.seconds', {
                                        count: value,
                                    })}
                                </button>
                            ))}
                            <label
                                htmlFor={customId}
                                className="flex items-center gap-2 text-sm font-bold"
                            >
                                <span>
                                    {t('classroom.announcement.custom')}
                                </span>
                                <input
                                    id={customId}
                                    type="number"
                                    inputMode="numeric"
                                    min={MIN_SECONDS}
                                    max={MAX_SECONDS}
                                    value={Number.isNaN(seconds) ? '' : seconds}
                                    onChange={(e) =>
                                        form.setData(
                                            'display_seconds',
                                            e.target.valueAsNumber,
                                        )
                                    }
                                    className={cn(teacherFieldClass, 'w-24')}
                                    data-testid="classroom-announcement-duration-custom"
                                />
                            </label>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {t('classroom.announcement.durationHint', {
                                min: MIN_SECONDS,
                                max: MAX_SECONDS,
                            })}
                        </span>
                        {form.errors.display_seconds && (
                            <span className="text-xs font-semibold text-[#8e2a1f]">
                                {form.errors.display_seconds}
                            </span>
                        )}
                    </div>
                    <div>
                        <button
                            type="submit"
                            disabled={disabled || form.data.body.trim() === ''}
                            className={primaryButtonClass}
                            data-testid="classroom-announcement-send"
                        >
                            <Send className="size-4" aria-hidden="true" />
                            {form.processing
                                ? t('classroom.announcement.sending')
                                : t('classroom.announcement.send')}
                        </button>
                    </div>
                </fieldset>
            </form>

            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-bold">
                    {t('classroom.announcement.recent')}
                </h3>
                {announcements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('classroom.announcement.empty')}
                    </p>
                ) : (
                    <ul
                        className="flex flex-col gap-2"
                        data-testid="classroom-announcement-list"
                    >
                        {announcements.map((item) => {
                            const remaining = item.active
                                ? remainingOf(item)
                                : 0;
                            const running = active && remaining > 0;
                            return (
                                <li
                                    key={item.id}
                                    className="flex flex-col gap-2 rounded-xl border-2 border-[#1f2a44] bg-white p-3 sm:flex-row sm:items-start"
                                    data-testid={`classroom-announcement-${item.id}`}
                                >
                                    <div className="min-w-0 flex-1">
                                        {item.title && (
                                            <p className="truncate text-sm font-bold">
                                                {item.title}
                                            </p>
                                        )}
                                        <p className="line-clamp-3 text-sm break-words whitespace-pre-line">
                                            {item.body}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {t(
                                                'classroom.announcement.shownFor',
                                                { count: item.display_seconds },
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span
                                            className={cn(
                                                'rounded-full border-2 border-[#1f2a44] px-2.5 py-0.5 text-xs font-bold tabular-nums',
                                                running
                                                    ? 'bg-[#dff7ea]'
                                                    : 'bg-[#f1f1f1]',
                                            )}
                                        >
                                            {running
                                                ? t(
                                                      'classroom.announcement.activeLeft',
                                                      { count: remaining },
                                                  )
                                                : t(
                                                      'classroom.announcement.finished',
                                                  )}
                                        </span>
                                        {running && (
                                            <button
                                                type="button"
                                                onClick={() => stop(item.id)}
                                                disabled={stopping === item.id}
                                                className={cn(
                                                    dangerButtonClass,
                                                    'min-h-9 px-2.5',
                                                )}
                                                data-testid={`classroom-announcement-stop-${item.id}`}
                                            >
                                                <Square
                                                    className="size-3.5"
                                                    aria-hidden="true"
                                                />
                                                {t(
                                                    'classroom.announcement.stop',
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
}
