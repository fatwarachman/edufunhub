import { DigitalClock } from '@/components/digital-clock';
import { GameMenu } from '@/components/game-menu';
import { NotificationBell } from '@/components/notification-bell';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    BookOpenCheck,
    BrainCircuit,
    Gamepad2,
    Home,
    LayoutDashboard,
    LogIn,
    LogOut,
    type LucideIcon,
    Menu,
    MessageCircle,
    MessageSquarePlus,
    ShieldCheck,
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
    /** Small count bubble on the icon (e.g. unread chats). */
    badge?: number;
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
    badge,
    children,
}: NavButtonProps) {
    const content = (
        <>
            {Icon && <Icon aria-hidden="true" />}
            {badge ? (
                <span className="edu-notice-badge" data-testid="nav-badge">
                    {badge > 9 ? '9+' : badge}
                </span>
            ) : null}
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
    { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { href: '/gamelist', labelKey: 'nav.games', icon: Gamepad2 },
    { href: '/portal', labelKey: 'nav.portal', icon: Trophy, mobileHide: true },
    { href: '/character', labelKey: 'nav.character', icon: UserRound },
    { href: '/chat', labelKey: 'nav.chat', icon: MessageCircle },
];

const TEACHER_ITEM: NavItem = {
    href: '/teacher/questions',
    labelKey: 'nav.teacher',
    icon: BookOpenCheck,
};

/** Admins and superadmins: jump from the player site to the admin dashboard. */
const ADMIN_ITEM: NavItem = {
    href: '/admin/dashboard',
    labelKey: 'nav.admin',
    icon: ShieldCheck,
};

/** Signed-in players: own ability analysis, icon button in the header. */
const ABILITY_ITEM: NavItem = {
    href: '/ability',
    labelKey: 'nav.ability',
    icon: BrainCircuit,
};

/** Signed-in players: icon button next to the bell, labelled in the phone menu. */
const FEEDBACK_ITEM: NavItem = {
    href: '/feedback',
    labelKey: 'nav.feedback',
    icon: MessageSquarePlus,
};

const LOGIN_ITEM: NavItem = {
    href: '/login',
    labelKey: 'nav.login',
    icon: LogIn,
};

const GUEST_ITEMS: NavItem[] = [
    { href: '/', labelKey: 'nav.home', icon: Home, external: true },
    { href: '/gamelist', labelKey: 'nav.games', icon: Gamepad2 },
    LOGIN_ITEM,
];

function isActive(url: string, href: string): boolean {
    const path = url.split(/[?#]/)[0];
    return path === href || (href !== '/' && path.startsWith(`${href}/`));
}

/**
 * Main site navigation. Signed-in players get dashboard/games/portal/character,
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
    const isAdmin = Boolean(props.auth?.user?.is_admin);
    const unreadChats = Number(props.unreadChats ?? 0);
    const items = signedIn
        ? [
              ...PLAYER_ITEMS,
              ...(isTeacher ? [TEACHER_ITEM] : []),
              ...(isAdmin ? [ADMIN_ITEM] : []),
          ]
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
                testId={
                    item === ADMIN_ITEM
                        ? 'nav-admin'
                        : item.href === '/chat'
                          ? 'nav-chat'
                          : undefined
                }
                badge={item.href === '/chat' ? unreadChats : undefined}
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
                items.length > PLAYER_ITEMS.length && 'edu-nav-bar--crowded',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            data-testid="site-nav"
        >
            <DigitalClock />
            <div className="edu-nav-links">{links}</div>
            {signedIn && (
                <div className="edu-nav-links">
                    <NavButton
                        href={ABILITY_ITEM.href}
                        icon={ABILITY_ITEM.icon}
                        label={t(ABILITY_ITEM.labelKey)}
                        iconOnly
                        active={
                            isActive(url, ABILITY_ITEM.href) ||
                            isActive(url, '/a')
                        }
                        testId="nav-ability"
                    />
                    <NavButton
                        href={FEEDBACK_ITEM.href}
                        icon={FEEDBACK_ITEM.icon}
                        label={t(FEEDBACK_ITEM.labelKey)}
                        iconOnly
                        active={isActive(url, FEEDBACK_ITEM.href)}
                        testId="nav-feedback"
                    />
                </div>
            )}
            {signedIn && <NotificationBell />}
            <div className="edu-nav-links">{account}</div>
            {compact && (
                <MobileMenu
                    items={items}
                    signedIn={signedIn}
                    url={url}
                    unreadChats={unreadChats}
                />
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
    unreadChats = 0,
}: {
    items: NavItem[];
    signedIn: boolean;
    url: string;
    unreadChats?: number;
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

    /* Guests get sign in / sign up as buttons at the top of the panel. */
    const entries: NavItem[] = signedIn
        ? [...items, ABILITY_ITEM, FEEDBACK_ITEM]
        : items.filter((item) => item !== LOGIN_ITEM);

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
                {!open && unreadChats > 0 && (
                    <span className="edu-notice-badge">
                        {unreadChats > 9 ? '9+' : unreadChats}
                    </span>
                )}
            </button>
            <div
                id={panelId}
                className="edu-game-menu-panel edu-nav-more-panel"
                hidden={!open}
                data-testid="nav-more-panel"
            >
                {!signedIn && (
                    <div
                        className="edu-nav-more-auth"
                        data-testid="nav-more-auth"
                    >
                        <NavButton
                            href={LOGIN_ITEM.href}
                            icon={LOGIN_ITEM.icon}
                            label={t(LOGIN_ITEM.labelKey)}
                            active={isActive(url, LOGIN_ITEM.href)}
                            testId="nav-more-login"
                        />
                        <NavButton
                            href="/register"
                            icon={UserPlus}
                            label={t('nav.registerFree')}
                            variant="primary"
                            active={isActive(url, '/register')}
                            testId="nav-more-register"
                        />
                    </div>
                )}
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
                                {item.href === '/chat' && unreadChats > 0 && (
                                    <span className="edu-nav-more-count">
                                        {unreadChats > 99 ? '99+' : unreadChats}
                                    </span>
                                )}
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
