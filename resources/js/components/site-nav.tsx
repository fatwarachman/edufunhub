import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    BookOpenCheck,
    Gamepad2,
    Home,
    LayoutDashboard,
    LogIn,
    LogOut,
    type LucideIcon,
    Trophy,
    UserPlus,
    UserRound,
} from 'lucide-react';
import { type ReactNode } from 'react';
import '../../css/edu-nav.css';

type Variant = 'default' | 'primary';

interface NavButtonProps {
    href: string;
    icon?: LucideIcon;
    label: string;
    variant?: Variant;
    iconOnly?: boolean;
    block?: boolean;
    active?: boolean;
    external?: boolean;
    className?: string;
    testId?: string;
    children?: ReactNode;
}

function classes({
    variant = 'default',
    iconOnly,
    block,
    className,
}: Pick<NavButtonProps, 'variant' | 'iconOnly' | 'block' | 'className'>) {
    return [
        'edu-nav-btn',
        variant === 'primary' && 'edu-nav-btn--primary',
        iconOnly && 'edu-nav-btn--icon',
        block && 'edu-nav-btn--block',
        className,
    ]
        .filter(Boolean)
        .join(' ');
}

/** Single navigation button used across every player-facing page. */
export function NavButton({
    href,
    icon: Icon,
    label,
    variant,
    iconOnly,
    block,
    active,
    external,
    className,
    testId,
    children,
}: NavButtonProps) {
    const content = (
        <>
            {Icon && <Icon aria-hidden="true" />}
            {iconOnly ? null : (
                <span className="edu-nav-label">{children ?? label}</span>
            )}
        </>
    );
    const common = {
        className: classes({ variant, iconOnly, block, className }),
        'aria-label': iconOnly ? label : undefined,
        title: iconOnly ? label : undefined,
        'aria-current': active ? ('page' as const) : undefined,
        'data-testid': testId,
    };
    if (external) {
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

/** Back button with the same style everywhere. */
export function BackButton({
    href,
    label,
    iconOnly,
    external,
}: {
    href: string;
    label: string;
    iconOnly?: boolean;
    external?: boolean;
}) {
    return (
        <NavButton
            href={href}
            icon={ArrowLeft}
            label={label}
            iconOnly={iconOnly}
            external={external}
            testId="nav-back"
        />
    );
}

interface NavItem {
    href: string;
    labelKey: string;
    icon: LucideIcon;
    external?: boolean;
}

const PLAYER_ITEMS: NavItem[] = [
    { href: '/portal', labelKey: 'nav.portal', icon: Trophy },
    { href: '/gamelist', labelKey: 'nav.games', icon: Gamepad2 },
    { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { href: '/character', labelKey: 'nav.character', icon: UserRound },
];

const TEACHER_ITEM: NavItem = {
    href: '/teacher/questions',
    labelKey: 'nav.teacher',
    icon: BookOpenCheck,
};

const GUEST_ITEMS: NavItem[] = [
    { href: '/', labelKey: 'nav.home', icon: Home, external: true },
    { href: '/gamelist', labelKey: 'nav.games', icon: Gamepad2 },
    { href: '/login', labelKey: 'nav.login', icon: LogIn },
];

function isActive(url: string, href: string): boolean {
    const path = url.split(/[?#]/)[0];
    return path === href || (href !== '/' && path.startsWith(`${href}/`));
}

/**
 * Main site navigation. Signed-in players get portal/games/dashboard/character/logout;
 * guests get home/games/login/register. Labels collapse to icons below 768px.
 */
export function SiteNav({
    className,
    compact,
}: {
    className?: string;
    /** Collapse labels to icons below 1024px (crowded game headers). */
    compact?: boolean;
}) {
    const { t } = useTranslations();
    const { props, url } = usePage<SharedData>();
    const signedIn = Boolean(props.auth?.user);
    const isTeacher = Boolean(props.auth?.user?.is_teacher);
    const items = signedIn
        ? isTeacher
            ? [...PLAYER_ITEMS, TEACHER_ITEM]
            : PLAYER_ITEMS
        : GUEST_ITEMS;

    return (
        <nav
            aria-label={t('nav.label')}
            className={[
                'edu-nav-bar',
                compact && 'edu-nav-bar--compact',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            data-testid="site-nav"
        >
            {items.map((item) => (
                <NavButton
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    active={isActive(url, item.href)}
                    external={item.external}
                />
            ))}
            {signedIn ? (
                <button
                    type="button"
                    onClick={() => router.post('/logout')}
                    className="edu-nav-btn"
                    aria-label={t('nav.logout')}
                    title={t('nav.logout')}
                    data-testid="nav-logout"
                >
                    <LogOut aria-hidden="true" />
                    <span className="edu-nav-label">{t('nav.logout')}</span>
                </button>
            ) : (
                <NavButton
                    href="/register"
                    icon={UserPlus}
                    label={t('nav.register')}
                    variant="primary"
                    active={isActive(url, '/register')}
                    className="edu-nav-optional"
                />
            )}
        </nav>
    );
}

/** Href for "back" from a game: portal when signed in, game list otherwise. */
export function useGameBackHref(): string {
    const { props } = usePage<SharedData>();
    return props.auth?.user ? '/portal' : '/gamelist';
}
