import { useTranslations } from '@/hooks/use-translations';
import { gameIcon } from '@/lib/games';
import http from '@/lib/http';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { ChevronRight, KeyRound, Loader2, X } from 'lucide-react';
import {
    type FormEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * "Join with a PIN" from anywhere: the player types only the room code and
 * lands in the right game, without opening the game first. The Laravel
 * endpoint asks the Go service which game owns the PIN.
 */
interface PinRoom {
    game_key: string;
    titleKey: string;
    icon: string;
    accent: string;
    phase: string;
    open: boolean;
    url: string;
}

type LookupState =
    | { kind: 'idle' }
    | { kind: 'searching' }
    | { kind: 'going'; room: PinRoom }
    | { kind: 'choose'; rooms: PinRoom[] }
    | { kind: 'error'; message: string };

const PIN_PATTERN = /^\d{6}$/;

/** Joins the room of `pin`, or explains why it cannot. */
function usePinLookup() {
    const { t } = useTranslations();
    const { props } = usePage<SharedData>();
    const signedIn = Boolean(props.auth?.user);
    const [state, setState] = useState<LookupState>({ kind: 'idle' });

    const go = useCallback((room: PinRoom) => {
        setState({ kind: 'going', room });
        router.visit(room.url);
    }, []);

    const lookup = useCallback(
        async (pin: string) => {
            if (!PIN_PATTERN.test(pin)) {
                setState({ kind: 'error', message: t('joinPin.invalid') });
                return;
            }
            if (!signedIn) {
                window.location.assign(`/join/${pin}`);
                return;
            }
            setState({ kind: 'searching' });
            try {
                const { data, response } = await http.get<{
                    rooms: PinRoom[];
                }>(`/join/${pin}/rooms`);
                if (!response.ok) {
                    setState({ kind: 'error', message: t('joinPin.error') });
                    return;
                }
                const rooms = data?.rooms ?? [];
                if (rooms.length === 0) {
                    setState({
                        kind: 'error',
                        message: t('joinPin.notFound', { pin }),
                    });
                } else if (rooms.length === 1) {
                    go(rooms[0]);
                } else {
                    setState({ kind: 'choose', rooms });
                }
            } catch {
                setState({ kind: 'error', message: t('joinPin.error') });
            }
        },
        [go, signedIn, t],
    );

    const reset = useCallback(() => setState({ kind: 'idle' }), []);

    return { state, lookup, go, reset };
}

function PinForm({
    initialPin = '',
    autoFocus,
    onSubmitted,
    compact,
}: {
    initialPin?: string;
    autoFocus?: boolean;
    onSubmitted?: () => void;
    /** Inline card variant: input and button in one row. */
    compact?: boolean;
}) {
    const { t } = useTranslations();
    const inputId = useId();
    const messageId = useId();
    const [pin, setPin] = useState(initialPin);
    const { state, lookup, go, reset } = usePinLookup();
    const autoRun = useRef(initialPin);
    const busy = state.kind === 'searching' || state.kind === 'going';

    useEffect(() => {
        if (PIN_PATTERN.test(autoRun.current)) {
            const pin = autoRun.current;
            autoRun.current = '';
            void lookup(pin);
        }
    }, [lookup]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        onSubmitted?.();
        void lookup(pin);
    };

    return (
        <form
            onSubmit={submit}
            className="flex flex-col gap-2"
            data-testid="join-pin-form"
            noValidate
        >
            <label htmlFor={inputId} className="sr-only">
                {t('joinPin.label')}
            </label>
            <div
                className={cn(
                    'flex gap-2',
                    compact
                        ? 'flex-col min-[400px]:flex-row'
                        : 'flex-col sm:flex-row',
                )}
            >
                <input
                    id={inputId}
                    value={pin}
                    onChange={(event) => {
                        setPin(
                            event.target.value.replace(/\D/g, '').slice(0, 6),
                        );
                        if (state.kind === 'error' || state.kind === 'choose') {
                            reset();
                        }
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder={t('joinPin.placeholder')}
                    autoFocus={autoFocus}
                    aria-invalid={state.kind === 'error'}
                    aria-describedby={messageId}
                    className="h-12 min-w-0 flex-1 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-center font-display text-xl font-black tracking-[0.25em] text-[#1f2a44] placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#FF9E44] focus-visible:outline-none"
                    data-testid="join-pin-input"
                />
                <button
                    type="submit"
                    disabled={busy || pin.length !== 6}
                    className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-5 font-display text-sm font-black text-white shadow-[3px_3px_0px_#FF9E44] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#FF9E44] focus-visible:outline-none disabled:translate-y-0 disabled:border-[#1f2a44]/40 disabled:bg-[#e8e4d6] disabled:text-[#1f2a44]/70 disabled:shadow-none"
                    data-testid="join-pin-submit"
                >
                    {busy ? (
                        <Loader2
                            className="size-4 animate-spin motion-reduce:animate-none"
                            aria-hidden
                        />
                    ) : (
                        <KeyRound className="size-4" aria-hidden />
                    )}
                    {t('joinPin.submit')}
                </button>
            </div>
            <div id={messageId} aria-live="polite" className="min-h-0">
                {state.kind === 'searching' && (
                    <p className="text-sm font-bold text-slate-600">
                        {t('joinPin.searching')}
                    </p>
                )}
                {state.kind === 'going' && (
                    <p
                        className="text-sm font-bold text-emerald-700"
                        data-testid="join-pin-going"
                    >
                        {t('joinPin.going', { game: t(state.room.titleKey) })}
                    </p>
                )}
                {state.kind === 'error' && (
                    <p
                        className="rounded-xl border-2 border-[#c0392b] bg-[#ffe9e6] px-3 py-2 text-sm font-bold text-[#8e2a1f]"
                        data-testid="join-pin-error"
                    >
                        {state.message}
                    </p>
                )}
                {state.kind === 'choose' && (
                    <div
                        className="flex flex-col gap-2"
                        data-testid="join-pin-choose"
                    >
                        <p className="text-sm font-bold text-[#1f2a44]">
                            {t('joinPin.choose', { pin })}
                        </p>
                        <ul className="flex flex-col gap-2">
                            {state.rooms.map((room) => {
                                const Icon = gameIcon(room.icon);
                                return (
                                    <li key={room.game_key}>
                                        <button
                                            type="button"
                                            onClick={() => go(room)}
                                            className="flex min-h-12 w-full items-center gap-3 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-left hover:bg-[#FFF176] focus-visible:ring-2 focus-visible:ring-[#FF9E44] focus-visible:outline-none"
                                            data-testid={`join-pin-room-${room.game_key}`}
                                        >
                                            <Icon
                                                className="size-5 shrink-0"
                                                style={{ color: room.accent }}
                                                aria-hidden
                                            />
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate text-sm font-black text-[#1f2a44]">
                                                    {t(room.titleKey)}
                                                </span>
                                                <span className="text-xs font-bold text-slate-600">
                                                    {room.open
                                                        ? t('joinPin.open')
                                                        : t('joinPin.started')}
                                                </span>
                                            </span>
                                            <ChevronRight
                                                className="size-4 shrink-0"
                                                aria-hidden
                                            />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </form>
    );
}

/** Modal with the PIN form; `initialPin` joins right away (e.g. `?join=`). */
export function JoinByPinDialog({
    open,
    onClose,
    initialPin,
}: {
    open: boolean;
    onClose: () => void;
    initialPin?: string;
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
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-[12vh] backdrop-blur-sm sm:p-4 sm:pt-[15vh]"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
            data-testid="join-pin-dialog"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative flex w-full max-w-md animate-in flex-col gap-3 rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-5 text-[#1f2a44] shadow-[8px_8px_0px_#1f2a44] duration-200 zoom-in-95"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full border-2 border-[#1f2a44] bg-white hover:bg-[#FFF176] focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none"
                    aria-label={t('joinPin.close')}
                    data-testid="join-pin-close"
                >
                    <X className="size-5" aria-hidden />
                </button>
                <span className="flex size-12 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#FFD93D] shadow-[3px_3px_0px_#1f2a44]">
                    <KeyRound className="size-6" aria-hidden />
                </span>
                <h2
                    id={titleId}
                    className="pr-12 font-display text-xl font-black"
                >
                    {t('joinPin.title')}
                </h2>
                <p className="text-sm font-bold text-slate-600">
                    {t('joinPin.intro')}
                </p>
                <PinForm initialPin={initialPin} autoFocus />
            </div>
        </div>,
        document.body,
    );
}

/** Inline card for the portal and the game list. */
export function JoinByPinCard({ className }: { className?: string }) {
    const { t } = useTranslations();
    return (
        <section
            className={cn(
                'flex flex-col gap-3 rounded-3xl border-3 border-[#1f2a44] bg-[#FFF176] p-4 shadow-[4px_4px_0px_#1f2a44] sm:p-5',
                className,
            )}
            aria-label={t('joinPin.title')}
            data-testid="join-pin-card"
        >
            <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-white">
                    <KeyRound className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                    <h2 className="font-display text-lg font-black text-[#1f2a44]">
                        {t('joinPin.title')}
                    </h2>
                    <p className="text-sm font-bold text-slate-700">
                        {t('joinPin.intro')}
                    </p>
                </div>
            </div>
            <PinForm compact />
        </section>
    );
}

/**
 * Header button that opens the PIN dialog. Opens by itself when the page
 * URL carries `?join=123456` (the /join/{pin} short link when several games
 * share the PIN).
 */
export function JoinByPinButton({
    className,
    children,
}: {
    className?: string;
    /** Custom trigger content (phone menu row); icon button otherwise. */
    children?: ReactNode;
}) {
    const { t } = useTranslations();
    const { url } = usePage();
    const queryPin = new URLSearchParams(
        url.includes('?') ? url.slice(url.indexOf('?') + 1) : '',
    ).get('join');
    const fromQuery = queryPin && PIN_PATTERN.test(queryPin) ? queryPin : null;
    const [open, setOpen] = useState(Boolean(fromQuery) && !children);
    const close = useCallback(() => {
        setOpen(false);
        const current = new URL(window.location.href);
        if (current.searchParams.has('join')) {
            current.searchParams.delete('join');
            window.history.replaceState(window.history.state, '', current);
        }
    }, []);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={className ?? 'edu-nav-btn edu-nav-btn--icon'}
                aria-label={children ? undefined : t('joinPin.button')}
                data-tip={children ? undefined : t('joinPin.button')}
                aria-haspopup="dialog"
                data-testid={children ? 'nav-more-join-pin' : 'nav-join-pin'}
            >
                {children ?? <KeyRound aria-hidden="true" />}
            </button>
            <JoinByPinDialog
                open={open}
                onClose={close}
                initialPin={children ? undefined : (fromQuery ?? undefined)}
            />
        </>
    );
}
