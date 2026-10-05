import { useTranslations } from '@/hooks/use-translations';
import { router } from '@inertiajs/react';
import { Undo2, UserRoundCog } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ImpersonationState {
    active: boolean;
    name: string;
}

function readState(
    props: Record<string, unknown> | undefined,
): ImpersonationState {
    const auth = props?.auth as
        | { is_impersonating?: boolean; user?: { name?: string } | null }
        | undefined;
    return {
        active: Boolean(auth?.is_impersonating),
        name: auth?.user?.name ?? '',
    };
}

/**
 * Floating "Login as" indicator shown on every page (portal, games, admin)
 * while an admin is impersonating a user. Mounted once next to the Inertia
 * app and kept in sync through router navigation events, so pages with
 * their own headers (games) do not need to render it.
 */
export function ImpersonationBanner({
    initialProps,
}: {
    initialProps: Record<string, unknown>;
}) {
    const { t } = useTranslations();
    const [state, setState] = useState(() => readState(initialProps));
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        document.body.classList.toggle('is-impersonating', state.active);
        return () => document.body.classList.remove('is-impersonating');
    }, [state.active]);

    useEffect(
        () =>
            router.on('navigate', (event) =>
                setState(
                    readState(
                        event.detail.page.props as Record<string, unknown>,
                    ),
                ),
            ),
        [],
    );

    if (!state.active) {
        return null;
    }

    return (
        <div
            className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 z-[100] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-2xl border-2 border-[#151b2e] bg-[#151b2e] py-2 pr-2 pl-3 text-sm text-white shadow-[3px_3px_0_#f5a623]"
            role="status"
            data-testid="impersonation-banner"
        >
            <UserRoundCog
                className="size-5 shrink-0 text-[#f5a623]"
                aria-hidden="true"
            />
            <span className="min-w-0 truncate font-semibold">
                {t('impersonation.as', { name: state.name })}
            </span>
            <button
                type="button"
                onClick={() =>
                    router.post(
                        '/admin/impersonate/leave',
                        {},
                        {
                            onStart: () => setLeaving(true),
                            onFinish: () => setLeaving(false),
                        },
                    )
                }
                disabled={leaving}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border-2 border-white bg-[#f5a623] px-3 font-bold text-[#151b2e] disabled:opacity-60"
                data-testid="impersonation-leave"
            >
                <Undo2 className="size-4" aria-hidden="true" />
                {t('impersonation.leave')}
            </button>
        </div>
    );
}
