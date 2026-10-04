import { GameMenu } from '@/components/game-menu';
import { NotificationBell } from '@/components/notification-bell';
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
    Menu,
    Trophy,
    UserPlus,
    UserRound,
    X,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
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
    /** Hidden on phones when another control already covers it. */
    mobileHide?: boolean;
}

const PLAYER_ITEMS: NavItem[] = [
    { href: '/portal', labelKey: 'nav.portal', icon: Trophy, mobileHide: true },
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
 * Main site navigation. Signed-in players get portal/games/dashboard/character,
 * the notification bell and logout; guests get home/games/login/register.
 * Labels collapse to icons below 768px. In `compact` mode (game headers) phones
 * show only the bell and a Menu button that opens the other items in a panel,
 * so the header never overflows next to the game's own controls.
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

    const links = items.map((item) =>
        item.href === '/gamelist' ? (
            <GameMenu
                key={item.href}
                active={isActive(url, '/gamelist') || isActive(url, '/games')}
            />
        ) : (
            <NavButton
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={t(item.labelKey)}
                active={isActive(url, item.href)}
                external={item.external}
                className={item.mobileHide ? 'edu-nav-mobile-hide' : undefined}
            />
        ),
    );
    const account = signedIn ? (
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
    );

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
            <div className="edu-nav-links">{links}</div>
            {signedIn && <NotificationBell />}
            <div className="edu-nav-links">{account}</div>
            {compact && (
                <MobileMenu items={items} signedIn={signedIn} url={url} />
            )}
        </nav>
    );
}

/**
 * Phone-only menu for compact game headers: one button that opens every
 * navigation item as a full-width list. Closes on outside tap, Escape and
 * navigation.
 */
function MobileMenu({
    items,
    signedIn,
    url,
}: {
    items: NavItem[];
    signedIn: boolean;
    url: string;
}) {
    const { t } = useTranslations();
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement | null>(null);
    const trigger = useRef<HTMLButtonElement | null>(null);
    const panelId = useId();
    const [lastUrl, setLastUrl] = useState(url);

    if (lastUrl !== url) {
        setLastUrl(url);
        setOpen(false);
    }

    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointer = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                trigger.current?.focus();
            }
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const entries: NavItem[] = signedIn
        ? items
        : [
              ...items,
              { href: '/register', labelKey: 'nav.register', icon: UserPlus },
          ];

    return (
        <div className="edu-nav-more" ref={root}>
            <button
                ref={trigger}
                type="button"
                className="edu-nav-btn edu-nav-btn--icon"
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={t('nav.menu')}
                title={t('nav.menu')}
                onClick={() => setOpen((value) => !value)}
                data-testid="nav-more"
            >
                {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
            <div
                id={panelId}
                className="edu-game-menu-panel edu-nav-more-panel"
                hidden={!open}
                data-testid="nav-more-panel"
            >
                <ul>
                    {entries.map((item) => {
                        const Icon = item.icon;
                        const content = (
                            <>
                                <span className="edu-game-menu-icon edu-nav-more-icon">
                                    <Icon aria-hidden="true" />
                                </span>
                                <span className="edu-game-menu-title">
                                    {t(item.labelKey)}
                                </span>
                            </>
                        );
                        const current = isActive(url, item.href)
                            ? ('page' as const)
                            : undefined;
                        return (
                            <li key={item.href}>
                                {item.external ? (
                                    <a
                                        href={item.href}
                                        className="edu-game-menu-item"
                                        aria-current={current}
                                    >
                                        {content}
                                    </a>
                                ) : (
                                    <Link
                                        href={item.href}
                                        className="edu-game-menu-item"
                                        aria-current={current}
                                    >
                                        {content}
                                    </Link>
                                )}
                            </li>
                        );
                    })}
                    {signedIn && (
                        <li>
                            <button
                                type="button"
                                onClick={() => router.post('/logout')}
                                className="edu-game-menu-item edu-nav-more-logout"
                            >
                                <span className="edu-game-menu-icon edu-nav-more-icon">
                                    <LogOut aria-hidden="true" />
                                </span>
                                <span className="edu-game-menu-title">
                                    {t('nav.logout')}
                                </span>
                            </button>
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
}

/** Href for "back" from a game: portal when signed in, game list otherwise. */
export function useGameBackHref(): string {
    const { props } = usePage<SharedData>();
    return props.auth?.user ? '/portal' : '/gamelist';
}
