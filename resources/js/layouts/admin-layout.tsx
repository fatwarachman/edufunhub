import AppLogoIcon from '@/components/app-logo-icon';
import { LanguageToggle } from '@/components/language-toggle';
import { useAppearance } from '@/hooks/use-appearance';
import { useInitials } from '@/hooks/use-initials';
import { useTranslations } from '@/hooks/use-translations';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import {
    Activity,
    BellRing,
    BookMarked,
    Bot,
    Cable,
    ChartColumnBig,
    ChevronLeft,
    ChevronRight,
    Clock,
    Coins,
    Gauge,
    KeyRound,
    ListChecks,
    Lock,
    LogOut,
    Megaphone,
    Menu,
    Moon,
    Network,
    Server,
    Settings,
    ShieldCheck,
    ShoppingBag,
    Sun,
    Swords,
    Trophy,
    UserCog,
    Users,
    UsersRound,
    Volume2,
    X,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

interface NavItem {
    title: string;
    href: string;
    icon: React.ElementType;
    exact?: boolean;
    superadminOnly?: boolean;
}

const navItems: NavItem[] = [
    { title: 'Dashboard', href: '/admin/dashboard', icon: Gauge, exact: true },
    { title: 'Users', href: '/admin/users', icon: Users },
    { title: 'Roles', href: '/admin/roles', icon: ShieldCheck },
    { title: 'Permissions', href: '/admin/permissions', icon: Lock },
    {
        title: 'User Statistics',
        href: '/admin/user-statistics',
        icon: UsersRound,
        superadminOnly: true,
    },
    {
        title: 'Playing Time',
        href: '/admin/playing-time',
        icon: Clock,
        superadminOnly: true,
    },
    {
        title: 'Game Statistics',
        href: '/admin/games',
        icon: ChartColumnBig,
        superadminOnly: true,
    },
    {
        title: 'Leaderboard',
        href: '/admin/leaderboard',
        icon: Trophy,
        superadminOnly: true,
    },
    {
        title: 'Question Bank',
        href: '/admin/questions',
        icon: ListChecks,
        superadminOnly: true,
    },
    {
        title: 'Subjects',
        href: '/admin/subjects',
        icon: BookMarked,
        superadminOnly: true,
    },
    {
        title: 'Sequence Bank',
        href: '/admin/sequence-sets',
        icon: Cable,
        superadminOnly: true,
    },
    {
        title: 'Sorter Bank',
        href: '/admin/sorter-sets',
        icon: Network,
        superadminOnly: true,
    },
    {
        title: 'Point Rules',
        href: '/admin/point-rules',
        icon: Coins,
        superadminOnly: true,
    },
    {
        title: 'Sound Settings',
        href: '/admin/sound-settings',
        icon: Volume2,
        superadminOnly: true,
    },
    {
        title: 'Notifications',
        href: '/admin/notifications',
        icon: BellRing,
        superadminOnly: true,
    },
    {
        title: 'AI Settings',
        href: '/admin/ai-settings',
        icon: Bot,
        superadminOnly: true,
    },
    {
        title: 'Character Items',
        href: '/admin/character-items',
        icon: ShoppingBag,
        superadminOnly: true,
    },
    {
        title: 'Advertising',
        href: '/admin/ads',
        icon: Megaphone,
        superadminOnly: true,
    },
    {
        title: 'Match History',
        href: '/admin/matches',
        icon: Swords,
        superadminOnly: true,
    },
    {
        title: 'Teacher Compensation',
        href: '/admin/compensation',
        icon: Coins,
        superadminOnly: true,
    },
    {
        title: 'Server Monitor',
        href: '/admin/server-monitor',
        icon: Server,
        superadminOnly: true,
    },
    { title: 'Activity Log', href: '/admin/activity-log', icon: Activity },
    { title: 'Settings', href: '/admin/settings', icon: Settings },
];

function isActive(href: string, currentUrl: string, exact = false): boolean {
    if (exact) return currentUrl === href || currentUrl.startsWith(href + '?');
    return (
        currentUrl === href ||
        currentUrl.startsWith(href + '/') ||
        currentUrl.startsWith(href + '?')
    );
}

interface AdminLayoutProps {
    children: ReactNode;
    title?: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
    const { auth } = usePage<SharedData>().props;
    const { i18n } = useTranslations();
    const { resolvedAppearance, toggleAppearance } = useAppearance();
    const getInitials = useInitials();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const currentUrl = usePage().url;
    const prevUrlRef = useRef(currentUrl);

    // Close sidebar on mobile when route changes
    useEffect(() => {
        if (prevUrlRef.current !== currentUrl) {
            prevUrlRef.current = currentUrl;
            setSidebarOpen(false);
        }
    }, [currentUrl]);

    // Close user menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setUserMenuOpen(false);
        if (userMenuOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [userMenuOpen]);

    const handleLogout = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        router.post('/logout');
    }, []);

    const user = auth.user;
    const initials = getInitials(user.name);

    return (
        <div key={i18n.language} className="flex min-h-screen bg-background">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-200',
                    'md:relative md:z-auto',
                    sidebarCollapsed ? 'md:w-14' : 'md:w-64',
                    sidebarOpen
                        ? 'w-72 translate-x-0'
                        : '-translate-x-full md:translate-x-0',
                )}
            >
                {/* Sidebar header */}
                <div
                    className={cn(
                        'flex items-center gap-2 border-b border-sidebar-border p-4',
                        sidebarCollapsed && 'md:justify-center md:px-2',
                    )}
                >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <AppLogoIcon className="size-5 fill-current" />
                    </div>
                    {!sidebarCollapsed && (
                        <div className="flex flex-col">
                            <span className="font-display text-sm leading-tight font-semibold text-sidebar-foreground">
                                {tr('EduFunHub')}
                            </span>
                            <span className="text-xs text-sidebar-foreground/60">
                                {tr('Admin Panel')}
                            </span>
                        </div>
                    )}
                    {/* Mobile close */}
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="ml-auto rounded-md p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
                        aria-label={tr('Close sidebar')}
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Nav items */}
                <nav className="flex-1 overflow-y-auto p-2">
                    <ul className="flex flex-col gap-1" role="list">
                        {navItems
                            .filter(
                                (item) =>
                                    !item.superadminOnly ||
                                    auth.user.is_superadmin,
                            )
                            .map((item) => {
                                const active = isActive(
                                    item.href,
                                    currentUrl,
                                    item.exact,
                                );
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            className={cn(
                                                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                                'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                                                active &&
                                                    'bg-sidebar-accent text-sidebar-accent-foreground',
                                                !active &&
                                                    'text-sidebar-foreground/80',
                                                sidebarCollapsed &&
                                                    'md:justify-center md:px-2',
                                            )}
                                            aria-current={
                                                active ? 'page' : undefined
                                            }
                                            title={
                                                sidebarCollapsed
                                                    ? item.title
                                                    : undefined
                                            }
                                        >
                                            <item.icon className="size-4 shrink-0" />
                                            {!sidebarCollapsed && (
                                                <span className="truncate">
                                                    {tr(item.title)}
                                                </span>
                                            )}
                                        </Link>
                                    </li>
                                );
                            })}

                        {/* Separator */}
                        <li
                            role="separator"
                            className="my-1 border-t border-sidebar-border"
                            aria-hidden="true"
                        />

                        {/* Back to Site */}
                        <li>
                            <Link
                                href="/dashboard"
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                    'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                    'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                                    sidebarCollapsed &&
                                        'md:justify-center md:px-2',
                                )}
                                title={
                                    sidebarCollapsed
                                        ? tr('Back to Site')
                                        : undefined
                                }
                            >
                                <ChevronLeft className="size-4 shrink-0" />
                                {!sidebarCollapsed && (
                                    <span className="truncate">
                                        {tr('Back to Site')}
                                    </span>
                                )}
                            </Link>
                        </li>
                    </ul>
                </nav>

                {/* Collapse toggle (desktop only) */}
                <div className="hidden border-t border-sidebar-border p-2 md:block">
                    <button
                        onClick={() => setSidebarCollapsed((c) => !c)}
                        className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60',
                            'transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                            sidebarCollapsed && 'justify-center px-2',
                        )}
                        aria-label={
                            sidebarCollapsed
                                ? tr('Expand sidebar')
                                : tr('Collapse sidebar')
                        }
                    >
                        {sidebarCollapsed ? (
                            <ChevronRight className="size-4" />
                        ) : (
                            <>
                                <ChevronLeft className="size-4" />
                                <span>{tr('Collapse')}</span>
                            </>
                        )}
                    </button>
                </div>
            </aside>

            {/* Main area */}
            <div className="flex min-w-0 flex-1 flex-col">
                {/* Header */}
                <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    {/* Mobile hamburger */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
                        aria-label={tr('Open sidebar')}
                    >
                        <Menu className="size-5" />
                    </button>

                    {/* Title */}
                    {title && (
                        <h1 className="font-display text-lg font-semibold text-foreground">
                            {tr(title)}
                        </h1>
                    )}

                    <div className="ml-auto flex items-center gap-2">
                        <LanguageToggle variant="admin" />
                        {/* Theme toggle */}
                        <button
                            onClick={toggleAppearance}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            aria-label={tr('Toggle theme')}
                        >
                            {resolvedAppearance === 'dark' ? (
                                <Sun className="size-4" />
                            ) : (
                                <Moon className="size-4" />
                            )}
                        </button>

                        {/* User menu */}
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setUserMenuOpen((o) => !o);
                                }}
                                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                aria-label={tr('User menu')}
                                aria-expanded={userMenuOpen}
                            >
                                <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                    {user.avatar_url ? (
                                        <img
                                            src={user.avatar_url}
                                            alt={user.name}
                                            className="size-full rounded-full object-cover"
                                        />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                <span className="hidden text-sm font-medium text-foreground sm:block">
                                    {user.name}
                                </span>
                            </button>

                            {userMenuOpen && (
                                <div
                                    className="absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border border-border bg-popover py-1 shadow-lg"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="border-b border-border px-3 py-2">
                                        <p className="text-sm font-medium text-foreground">
                                            {user.name}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {user.email}
                                        </p>
                                    </div>
                                    <Link
                                        href="/profile"
                                        className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                                    >
                                        <UserCog className="size-4" />
                                        {tr('Profile Settings')}
                                    </Link>
                                    <Link
                                        href="/admin/settings"
                                        className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                                    >
                                        <Settings className="size-4" />
                                        {tr('Admin Settings')}
                                    </Link>
                                    <Link
                                        href="/profile/security"
                                        className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                                    >
                                        <KeyRound className="size-4" />
                                        {tr('Security')}
                                    </Link>
                                    <div className="border-t border-border" />
                                    <button
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
                                    >
                                        <LogOut className="size-4" />
                                        {tr('Log out')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 p-4 md:p-6">{children}</main>
            </div>
        </div>
    );
}

// Persistent layout factory for Inertia
AdminLayout.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>;
