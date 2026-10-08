import { BrandWordmark } from '@/components/brand-wordmark';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Gamepad2 } from 'lucide-react';
import '../../css/auth-landing.css';

/** Beranda: the player dashboard when signed in, the landing page for guests. */
export function useBrandHomeHref(): string {
    const { props } = usePage<SharedData>();
    return props.auth?.user ? '/dashboard' : '/';
}

/**
 * The edufunhub brand (logo mark + wordmark) linking to Beranda on every
 * player-facing header. `variant="mark"` renders only the smaller logo mark
 * for crowded game headers. Guests get a plain anchor because `/` is the
 * static landing page, not an Inertia page.
 */
export function BrandLink({
    variant = 'full',
    hideWordmarkOnPhone,
    className,
}: {
    variant?: 'full' | 'mark';
    hideWordmarkOnPhone?: boolean;
    className?: string;
}) {
    const { t } = useTranslations();
    const href = useBrandHomeHref();
    const common = {
        className: [
            'auth-brand edu-brand-link',
            variant === 'mark' && 'edu-brand-link--mark',
            className,
        ]
            .filter(Boolean)
            .join(' '),
        'aria-label': t('nav.brandHome'),
        'data-testid': 'brand-home-link',
    };
    const content = (
        <>
            <span className="auth-brand-mark">
                <Gamepad2 className="size-6" />
            </span>
            {variant === 'full' && (
                <BrandWordmark hideOnPhone={hideWordmarkOnPhone} />
            )}
        </>
    );

    if (href === '/') {
        return (
            <a href={href} {...common}>
                {content}
            </a>
        );
    }

    return (
        <Link href={href} {...common}>
            {content}
        </Link>
    );
}
