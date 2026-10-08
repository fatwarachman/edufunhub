import { DigitalClock } from '@/components/digital-clock';
import { GameMenu } from '@/components/game-menu';
import { JoinByPinButton } from '@/components/join-by-pin';
import {
    isActive,
    type NavGroup,
    type NavItem,
    NavMenu,
    NavMenuLink,
    NavMenuSection,
} from '@/components/nav-menu';
import { NotificationBell } from '@/components/notification-bell';
import { useNavFold } from '@/hooks/use-nav-fold';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    BookOpenCheck,
    BrainCircuit,
    CircleUserRound,
    Gamepad2,
    Home,
    KeyRound,
    LayoutDashboard,
    LogIn,
    type LucideIcon,
    Menu,
    MessageCircle,
    MessageSquarePlus,
    ShieldCheck,
    Trophy,
    UserPlus,
    UserRound,
    Users,
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
        'data-tip': block ? undefined : label,
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

const PLAYER_ITEMS: NavItem[] = [
    { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { href: '/gamelist', labelKey: 'nav.games', icon: Gamepad2 },
    { href: '/portal', labelKey: 'nav.portal', icon: Trophy, mobileHide: true },
];

const CHAT_ITEM: NavItem = {
    href: '/chat',
    labelKey: 'nav.chat',
    icon: MessageCircle,
    testId: 'nav-chat',
};

const FRIENDS_ITEM: NavItem = {
    href: '/friends',
    labelKey: 'nav.friends',
    icon: Users,
    testId: 'nav-friends',
};

const CHARACTER_ITEM: NavItem = {
    href: '/character',
    labelKey: 'nav.character',
    icon: UserRound,
    testId: 'nav-character',
};

const TEACHER_ITEM: NavItem = {
    href: '/teacher/questions',
    labelKey: 'nav.teacher',
    icon: BookOpenCheck,
    testId: 'nav-teacher',
};

/** Admins and superadmins: jump from the player site to the admin dashboard. */
const ADMIN_ITEM: NavItem = {
    href: '/admin/dashboard',
    labelKey: 'nav.admin',
    icon: ShieldCheck,
    testId: 'nav-admin',
};

/** Signed-in players: own ability analysis. */
const ABILITY_ITEM: NavItem = {
    href: '/ability',
    labelKey: 'nav.ability',
    icon: BrainCircuit,
    testId: 'nav-ability',
};

/** Signed-in players: own profile (account, details, password). */
const PROFILE_ITEM: NavItem = {
    href: '/profile',
    labelKey: 'nav.profile',
    icon: CircleUserRound,
    testId: 'nav-profile',
};

const FEEDBACK_ITEM: NavItem = {
    href: '/feedback',
    labelKey: 'nav.feedback',
    icon: MessageSquarePlus,
    testId: 'nav-feedback',
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

/**
 * Parent menus of the signed-in header: friends and chat under "Social",
 * personal pages (and teacher/admin shortcuts) under "Account".
 */
function playerGroups({
    unreadChats,
    pendingFriends,
    isTeacher,
    isAdmin,
}: {
    unreadChats: number;
    pendingFriends: number;
    isTeacher: boolean;
    isAdmin: boolean;
}): NavGroup[] {
    return [
        {
            key: 'social',
            labelKey: 'nav.social',
            icon: Users,
            testId: 'nav-social',
            items: [
                { ...FRIENDS_ITEM, count: pendingFriends },
                { ...CHAT_ITEM, count: unreadChats },
            ],
        },
        {
            key: 'account',
            labelKey: 'nav.account',
            icon: CircleUserRound,
            testId: 'nav-account',
            logout: true,
            items: [
                PROFILE_ITEM,
                CHARACTER_ITEM,
                ABILITY_ITEM,
                FEEDBACK_ITEM,
                ...(isTeacher ? [TEACHER_ITEM] : []),
                ...(isAdmin ? [ADMIN_ITEM] : []),
            ],
        },
    ];
}

/**
 * Main site navigation. Signed-in players get dashboard/games/portal/character,
 * the notification bell and logout; guests get home/games/login/register.
 * Labels show while they fit; when the header gets tight they fold into icons
 * one by one from the rightmost button (useNavFold). In `compact` mode (every
 * header) phones below 768px always show only the bell and a Menu button that
 * opens the other items in a panel; wider screens fall back to it only when
 * even icons do not fit.
 */
export function SiteNav({
    className,
    compact,
    clock = false,
}: {
    className?: string;
    /** Collapse labels to icons below 1024px (crowded game headers). */
    compact?: boolean;
    /**
     * Render the clock inside the nav. Off by default: headers place
     * <DigitalClock /> next to the logo instead.
     */
    clock?: boolean;
}) {
    const { t } = useTranslations();
    const { props, url } = usePage<SharedData>();
    const navRef = useRef<HTMLElement>(null);
    useNavFold(navRef);
    const signedIn = Boolean(props.auth?.user);
    const isTeacher = Boolean(props.auth?.user?.is_teacher);
    const isAdmin = Boolean(props.auth?.user?.is_admin);
    const unreadChats = Number(props.unreadChats ?? 0);
    const pendingFriends = Number(
        (props as { pendingFriends?: number }).pendingFriends ?? 0,
    );
    const items = signedIn ? PLAYER_ITEMS : GUEST_ITEMS;
    const groups = signedIn
        ? playerGroups({ unreadChats, pendingFriends, isTeacher, isAdmin })
        : [];

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
                testId={item.testId}
            />
        ),
    );

    return (
        <nav
            ref={navRef}
            aria-label={t('nav.label')}
            className={[
                'edu-nav-bar',
                compact && 'edu-nav-bar--compact',
                (isTeacher || isAdmin) && 'edu-nav-bar--crowded',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            data-testid="site-nav"
        >
            {clock && <DigitalClock />}
            <div className="edu-nav-links">
                {links}
                {groups.map((group) => (
                    <NavMenu key={group.key} group={group} url={url} />
                ))}
            </div>
            {signedIn && (
                <div className="edu-nav-links">
                    <JoinByPinButton />
                </div>
            )}
            {signedIn && <NotificationBell />}
            {!signedIn && (
                <div className="edu-nav-links">
                    <NavButton
                        href="/register"
                        icon={UserPlus}
                        label={t('nav.register')}
                        variant="primary"
                        active={isActive(url, '/register')}
                        className="edu-nav-optional"
                    />
                </div>
            )}
            {compact && (
                <MobileMenu
                    items={items}
                    groups={groups}
                    signedIn={signedIn}
                    url={url}
                    badge={unreadChats + pendingFriends}
                />
            )}
        </nav>
    );
}

/**
 * Compact header menu (narrow screens): one button that opens every
 * navigation item; parent menus become sections that slide their children
 * down. Closes on outside tap, Escape and navigation.
 */
function MobileMenu({
    items,
    groups,
    signedIn,
    url,
    badge = 0,
}: {
    items: NavItem[];
    groups: NavGroup[];
    signedIn: boolean;
    url: string;
    badge?: number;
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
        ? items
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
                data-tip={open ? undefined : t('nav.menu')}
                onClick={() => setOpen((value) => !value)}
                data-testid="nav-more"
            >
                <span
                    className="edu-nav-burger"
                    data-open={open}
                    aria-hidden="true"
                >
                    <Menu />
                    <X />
                </span>
                {!open && badge > 0 && (
                    <span className="edu-notice-badge">
                        {badge > 9 ? '9+' : badge}
                    </span>
                )}
            </button>
            <div
                id={panelId}
                className="edu-game-menu-panel edu-nav-more-panel"
                data-open={open}
                inert={!open}
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
                    {signedIn && (
                        <li>
                            <JoinByPinButton className="edu-game-menu-item">
                                <span className="edu-game-menu-icon edu-nav-more-icon">
                                    <KeyRound aria-hidden="true" />
                                </span>
                                <span className="edu-game-menu-title">
                                    {t('joinPin.button')}
                                </span>
                            </JoinByPinButton>
                        </li>
                    )}
                    {entries.map((item) => (
                        <li key={item.href}>
                            <NavMenuLink item={item} url={url} />
                        </li>
                    ))}
                    {groups.map((group) => (
                        <NavMenuSection
                            key={group.key}
                            group={group}
                            url={url}
                        />
                    ))}
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
