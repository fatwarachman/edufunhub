import { isActive } from '@/components/nav-menu';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    CircleUserRound,
    Gamepad2,
    Home,
    LayoutDashboard,
    LogIn,
    type LucideIcon,
    MessageCircle,
    Trophy,
    UserPlus,
} from 'lucide-react';
import '../../css/edu-nav.css';

interface TabItem {
    href: string;
    labelKey: string;
    icon: LucideIcon;
    /** Other paths that keep this tab highlighted. */
    match?: string[];
    /** Full page load (static landing page). */
    external?: boolean;
    badge?: number;
    testId: string;
}

function playerTabs(unreadChats: number): TabItem[] {
    return [
        {
            href: '/dashboard',
            labelKey: 'nav.dashboard',
            icon: LayoutDashboard,
            testId: 'tab-dashboard',
        },
        {
            href: '/gamelist',
            labelKey: 'nav.games',
            icon: Gamepad2,
            testId: 'tab-games',
        },
        {
            href: '/portal',
            labelKey: 'nav.portal',
            icon: Trophy,
            match: ['/leaderboard', '/subjects', '/players'],
            testId: 'tab-portal',
        },
        {
            href: '/chat',
            labelKey: 'nav.chat',
            icon: MessageCircle,
            match: ['/friends'],
            badge: unreadChats,
            testId: 'tab-chat',
        },
        {
            href: '/profile',
            labelKey: 'nav.profile',
            icon: CircleUserRound,
            match: ['/character', '/ability', '/my-classrooms', '/feedback'],
            testId: 'tab-profile',
        },
    ];
}

const GUEST_TABS: TabItem[] = [
    {
        href: '/',
        labelKey: 'nav.home',
        icon: Home,
        external: true,
        testId: 'tab-home',
    },
    {
        href: '/gamelist',
        labelKey: 'nav.games',
        icon: Gamepad2,
        testId: 'tab-games',
    },
    { href: '/login', labelKey: 'nav.login', icon: LogIn, testId: 'tab-login' },
    {
        href: '/register',
        labelKey: 'nav.register',
        icon: UserPlus,
        testId: 'tab-register',
    },
];

/**
 * App-style bottom tab bar for phones (below 768px) on every page outside a
 * game: player portal pages, the game list and legal pages. Game pages never
 * render it, so gameplay keeps the full screen. Pair it with the
 * `edu-has-tabbar` class on the page root so content clears the bar.
 */
export function MobileTabBar() {
    const { t } = useTranslations();
    const { props, url } = usePage<SharedData>();
    const signedIn = Boolean(props.auth?.user);
    const tabs = signedIn
        ? playerTabs(Number(props.unreadChats ?? 0))
        : GUEST_TABS;
    const path = url.split(/[?#]/)[0];

    return (
        <nav
            className="edu-tabbar"
            aria-label={t('nav.tabBar')}
            data-testid="mobile-tab-bar"
        >
            {tabs.map((tab) => {
                const active =
                    (tab.href === '/'
                        ? path === '/'
                        : isActive(url, tab.href)) ||
                    (tab.match ?? []).some((href) => isActive(url, href));
                const label = t(tab.labelKey);
                const content = (
                    <>
                        <span className="edu-tabbar-icon" aria-hidden="true">
                            <tab.icon />
                            {tab.badge ? (
                                <span className="edu-notice-badge">
                                    {tab.badge > 9 ? '9+' : tab.badge}
                                </span>
                            ) : null}
                        </span>
                        <span className="edu-tabbar-label">{label}</span>
                    </>
                );
                const common = {
                    className: 'edu-tabbar-item',
                    'aria-current': active ? ('page' as const) : undefined,
                    'aria-label': tab.badge
                        ? t('nav.withCount', { label, count: tab.badge })
                        : undefined,
                    'data-testid': tab.testId,
                };

                return tab.external ? (
                    <a key={tab.href} href={tab.href} {...common}>
                        {content}
                    </a>
                ) : (
                    <Link key={tab.href} href={tab.href} {...common}>
                        {content}
                    </Link>
                );
            })}
        </nav>
    );
}
