import { useTranslations } from '@/hooks/use-translations';
import { gameIcon } from '@/lib/games';
import { questionLevelKey, QUESTION_LEVELS } from '@/lib/question-levels';
import { cn } from '@/lib/utils';
import { type GameMenuGame, type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { X } from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
    type ClassroomStatus,
    type Difficulty,
    type Mastery,
    type TopicRef,
} from './types';

export const INK = '#1f2a44';

/** Catalog lookup for classroom game keys (shared `gameMenu` prop). */
export function useGameCatalog() {
    const { props } = usePage<SharedData>();
    const { t } = useTranslations();
    return useMemo(() => {
        const map = new Map<string, GameMenuGame>();
        for (const category of props.gameMenu ?? []) {
            for (const game of category.games) {
                map.set(game.key, game);
            }
        }
        return {
            get: (key: string) => map.get(key),
            title: (key: string) => {
                const game = map.get(key);
                return game
                    ? t(game.titleKey)
                    : t(`teacher.games.${key}`, { defaultValue: key });
            },
            icon: (key: string) => gameIcon(map.get(key)?.icon ?? ''),
            accent: (key: string) => map.get(key)?.accent ?? '#ffd93d',
            url: (key: string) => map.get(key)?.url ?? null,
        };
    }, [props.gameMenu, t]);
}

/** Small chip with a game icon and title. */
export function GameChip({
    gameKey,
    iconOnly,
    className,
}: {
    gameKey: string;
    iconOnly?: boolean;
    className?: string;
}) {
    const catalog = useGameCatalog();
    const Icon = catalog.icon(gameKey);
    const title = catalog.title(gameKey);
    return (
        <span
            className={cn(
                'inline-flex min-w-0 items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-white px-2 py-0.5 text-xs font-bold',
                iconOnly && 'size-8 justify-center px-0',
                className,
            )}
            title={title}
        >
            <span
                className="grid size-5 shrink-0 place-items-center rounded-full"
                style={{ background: catalog.accent(gameKey) }}
            >
                <Icon className="size-3 text-white" aria-hidden="true" />
            </span>
            {iconOnly ? (
                <span className="sr-only">{title}</span>
            ) : (
                <span className="truncate">{title}</span>
            )}
        </span>
    );
}

const STATUS_TONE: Record<ClassroomStatus, string> = {
    scheduled: 'bg-[#fff4cc]',
    active: 'bg-[#c9f5e5]',
    ended: 'bg-[#ece9e1]',
};

export function StatusPill({ status }: { status: ClassroomStatus }) {
    const { t } = useTranslations();
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] px-2.5 py-0.5 text-xs font-bold',
                STATUS_TONE[status],
            )}
            data-testid="classroom-status"
            data-status={status}
        >
            {status === 'active' && (
                <span
                    className="size-2 rounded-full bg-[#15803d] motion-safe:animate-pulse"
                    aria-hidden="true"
                />
            )}
            {t(`classroom.status.${status}`)}
        </span>
    );
}

const MASTERY_TONE: Record<Mastery, string> = {
    excellent: 'bg-[#c9f5e5] text-[#0d5a48]',
    good: 'bg-[#e0f0ff] text-[#1d4f7a]',
    fair: 'bg-[#fff4cc] text-[#7a4b00]',
    needs_help: 'bg-[#ffe1e6] text-[#8e2a3f]',
    no_data: 'bg-[#ece9e1] text-[#1f2a44]',
};

export function MasteryBadge({ mastery }: { mastery: Mastery }) {
    const { t } = useTranslations();
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border-2 border-[#1f2a44] px-2 py-0.5 text-xs font-bold whitespace-nowrap',
                MASTERY_TONE[mastery],
            )}
            data-testid="classroom-mastery"
        >
            {t(`classroom.mastery.${mastery}`)}
        </span>
    );
}

const DIFFICULTY_TONE: Record<Difficulty, string> = {
    easy: 'bg-[#dff7ea]',
    medium: 'bg-[#fff4cc]',
    hard: 'bg-[#ffe1e6]',
};

export function DifficultyChip({
    difficulty,
}: {
    difficulty: Difficulty | null;
}) {
    const { t } = useTranslations();
    if (!difficulty) {
        return null;
    }
    return (
        <span
            className={cn(
                'rounded-full border-2 border-[#1f2a44] px-2 py-0.5 text-xs font-bold',
                DIFFICULTY_TONE[difficulty],
            )}
        >
            {t(`classroom.difficulty.${difficulty}`)}
        </span>
    );
}

/** Question level chip (1 easy, 2 intermediate, 3 hard). */
export function LevelChip({ level }: { level: number }) {
    const { t } = useTranslations();
    const key = questionLevelKey(level);
    const tone =
        QUESTION_LEVELS.find((item) => item.key === key)?.tone ?? '#dff7ea';
    return (
        <span
            className="rounded-full border-2 border-[#1f2a44] px-2 py-0.5 text-xs font-bold"
            style={{ background: tone }}
        >
            {t(`classroom.levels.${key}`)}
        </span>
    );
}

/** Formatters bound to the active language. */
export function useClassroomFormat() {
    const { i18n } = useTranslations();
    return useMemo(() => {
        const locale = i18n.language === 'en' ? 'en-GB' : 'id-ID';
        const number = new Intl.NumberFormat(locale);
        const dateTime = new Intl.DateTimeFormat(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
        const time = new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit',
        });
        return {
            number: (value: number) => number.format(value),
            percent: (value: number | null | undefined) =>
                value === null || value === undefined
                    ? '—'
                    : `${number.format(Math.round(value * 10) / 10)}%`,
            dateTime: (value: string | null | undefined) =>
                value ? dateTime.format(new Date(value)) : '—',
            time: (value: string | null | undefined) =>
                value ? time.format(new Date(value)) : '—',
        };
    }, [i18n.language]);
}

/** Localised prompt / topic helpers. */
export function useLocalized() {
    const { i18n } = useTranslations();
    const english = i18n.language?.startsWith('en');
    return useMemo(
        () => ({
            prompt: (item: { prompt_id: string; prompt_en: string | null }) =>
                english && item.prompt_en ? item.prompt_en : item.prompt_id,
            topic: (
                item:
                    | Pick<TopicRef, 'name_id' | 'name_en'>
                    | null
                    | undefined,
            ) =>
                item
                    ? english && item.name_en
                        ? item.name_en
                        : item.name_id
                    : '',
        }),
        [english],
    );
}

/** Ticks once per second while a target time is in the future. */
export function useNow(active = true): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) {
            return;
        }
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [active]);
    return now;
}

/** "2 h 05 m" / "3 d 4 h" style countdown text. */
export function useCountdownText() {
    const { t } = useTranslations();
    return useCallback(
        (ms: number) => {
            const total = Math.max(0, Math.floor(ms / 1000));
            const days = Math.floor(total / 86400);
            const hours = Math.floor((total % 86400) / 3600);
            const minutes = Math.floor((total % 3600) / 60);
            const seconds = total % 60;
            if (days > 0) {
                return t('classroom.countdown.days', { days, hours });
            }
            if (hours > 0) {
                return t('classroom.countdown.hours', {
                    hours,
                    minutes: String(minutes).padStart(2, '0'),
                });
            }
            return t('classroom.countdown.minutes', {
                minutes,
                seconds: String(seconds).padStart(2, '0'),
            });
        },
        [t],
    );
}

/** Accuracy bar (0–100) with an optional comparison marker. */
export function AccuracyBar({
    value,
    compare,
    label,
}: {
    value: number | null;
    compare?: number | null;
    label?: string;
}) {
    const width = value === null ? 0 : Math.max(0, Math.min(100, value));
    const tone =
        value === null
            ? '#d6d2c4'
            : value >= 70
              ? '#1aab8a'
              : value >= 40
                ? '#f5a623'
                : '#e85d75';
    return (
        <div
            className="relative h-3 w-full overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white"
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        >
            <span
                className="block h-full"
                style={{ width: `${width}%`, background: tone }}
            />
            {compare !== null && compare !== undefined && (
                <span
                    className="absolute top-0 h-full w-0.5 bg-[#1f2a44]"
                    style={{ left: `${Math.max(0, Math.min(100, compare))}%` }}
                />
            )}
        </div>
    );
}

/** Dashed empty-state box (portal style). */
export function EmptyBox({
    icon: Icon,
    title,
    hint,
    children,
}: {
    icon?: typeof X;
    title: string;
    hint?: string;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#151b2e]/30 px-4 py-8 text-center">
            {Icon && (
                <Icon
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                />
            )}
            <p className="font-bold">{title}</p>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
            {children}
        </div>
    );
}

/** Centered modal in the portal/game style. */
export function ClassroomDialog({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    wide,
    testId,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
    wide?: boolean;
    testId?: string;
}) {
    const { t } = useTranslations();
    const titleId = useId();

    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [open, onClose]);

    if (!open || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1f2a44]/60 p-3 backdrop-blur-sm sm:p-4"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={cn(
                    'relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-3xl border-[3px] border-[#1f2a44] bg-[#FFFDF7] text-[#1f2a44] shadow-[6px_6px_0px_#1f2a44] motion-safe:animate-in motion-safe:zoom-in-95',
                    wide ? 'max-w-3xl' : 'max-w-md',
                )}
                data-testid={testId}
            >
                <div className="flex items-start gap-3 border-b-2 border-[#1f2a44]/10 p-5 pr-16">
                    <div className="flex min-w-0 flex-col gap-1">
                        <h2
                            id={titleId}
                            className="font-display text-xl font-black text-balance"
                        >
                            {title}
                        </h2>
                        {description && (
                            <p className="text-sm font-semibold text-slate-600">
                                {description}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('classroom.common.close')}
                        className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full border-2 border-[#1f2a44] bg-white hover:bg-[#FFF176]"
                        data-testid="classroom-dialog-close"
                    >
                        <X className="size-5" aria-hidden="true" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    {children}
                </div>
                {footer && (
                    <div className="flex flex-wrap justify-end gap-2 border-t-2 border-[#1f2a44]/10 p-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

/** Yes/no confirmation in the classroom dialog style. */
export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel,
    busy,
    testId,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description?: string;
    confirmLabel: string;
    busy?: boolean;
    testId?: string;
}) {
    const { t } = useTranslations();
    return (
        <ClassroomDialog
            open={open}
            onClose={onClose}
            title={title}
            description={description}
            testId={testId}
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className={actionButtonClass}
                    >
                        {t('classroom.common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={dangerButtonClass}
                        data-testid={testId ? `${testId}-confirm` : undefined}
                    >
                        {confirmLabel}
                    </button>
                </>
            }
        />
    );
}

/** Thick-border action button (portal secondary). */
export const actionButtonClass =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3.5 text-sm font-bold text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#FFF176] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0';

export const primaryButtonClass =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-4 text-sm font-bold text-white shadow-[2px_2px_0px_#f5a623] transition-colors hover:bg-[#2a3352] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50';

export const dangerButtonClass =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#ffe1e6] px-3.5 text-sm font-bold text-[#8e2a3f] shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#ffc9d3] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50';
