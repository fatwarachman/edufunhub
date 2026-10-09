import { AdminFeatureSearch } from '@/components/search/admin-feature-search';
import { isGroup, navItems, type NavItem, type NavGroup } from '@/lib/admin-navigation';
import { LanguageToggle } from '@/components/language-toggle';
import { OnlineDot } from '@/components/online-dot';
import { useAppearance } from '@/hooks/use-appearance';
import { useInitials } from '@/hooks/use-initials';
import { useTranslations } from '@/hooks/use-translations';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    KeyRound,
    LogOut,
    Menu,
    Moon,
    Settings,
    Sun,
    UserCog,
    X,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

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
    const canSee = (item: NavItem) =>
        !item.superadminOnly || Boolean(auth.user.is_superadmin);
    const groupActive = (group: NavGroup) =>
        group.children.some((child) =>
            isActive(child.href, currentUrl, child.exact),
        );
    /* Groups start open when the current page is inside them. */
    const [openGroups, setOpenGroups] = useState<Set<string>>(
        () =>
            new Set(
                navItems
                    .filter(isGroup)
                    .filter(groupActive)
                    .map((group) => group.title),
            ),
    );
    const toggleGroup = (title: string) =>
        setOpenGroups((current) => {
            const next = new Set(current);
            if (next.has(title)) {
                next.delete(title);
            } else {
                next.add(title);
            }
            return next;
        });

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
    const linkClasses = cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
    );
    const renderLink = (item: NavItem) => {
        const active = isActive(item.href, currentUrl, item.exact);
        return (
            <Link
                href={item.href}
                className={cn(
                    linkClasses,
                    active &&
                        'bg-sidebar-accent text-sidebar-accent-foreground',
                    !active && 'text-sidebar-foreground/80',
                    sidebarCollapsed && 'md:justify-center md:px-2',
                )}
                aria-current={active ? 'page' : undefined}
                title={tr(item.title)}
            >
                <item.icon className="size-4 shrink-0" />
                {!sidebarCollapsed && (
                    <span className="truncate">{tr(item.title)}</span>
                )}
            </Link>
        );
    };

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
                    'md:sticky md:top-0 md:z-auto md:h-dvh md:shrink-0 md:self-start',
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
                    <img
                        src="/favicon.svg?v=edufunhub-logo-2"
                        alt=""
                        aria-hidden="true"
                        className="size-9 shrink-0 select-none"
                        draggable={false}
                        data-testid="admin-brand-logo"
                    />
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
                <nav className="flex-1 [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklab,var(--sidebar-foreground)_25%,transparent)_transparent] overflow-y-auto p-2">
                    <ul className="flex flex-col gap-1" role="list">
                        {navItems.map((entry) => {
                            if (!isGroup(entry)) {
                                return canSee(entry) ? (
                                    <li key={entry.href}>
                                        {renderLink(entry)}
                                    </li>
                                ) : null;
                            }
                            const children = entry.children.filter(canSee);
                            if (children.length === 0) {
                                return null;
                            }
                            const active = groupActive(entry);
                            const open =
                                openGroups.has(entry.title) &&
                                !sidebarCollapsed;
                            const panelId = `admin-nav-${entry.title.toLowerCase().replace(/\s+/g, '-')}`;
                            return (
                                <li key={entry.title}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (sidebarCollapsed) {
                                                setSidebarCollapsed(false);
                                                setOpenGroups((current) =>
                                                    new Set(current).add(
                                                        entry.title,
                                                    ),
                                                );
                                                return;
                                            }
                                            toggleGroup(entry.title);
                                        }}
                                        className={cn(
                                            linkClasses,
                                            'w-full text-left',
                                            active &&
                                                !open &&
                                                'bg-sidebar-accent text-sidebar-accent-foreground',
                                            !(active && !open) &&
                                                'text-sidebar-foreground/80',
                                            active && 'font-semibold',
                                            sidebarCollapsed &&
                                                'md:justify-center md:px-2',
                                        )}
                                        aria-expanded={open}
                                        aria-controls={panelId}
                                        title={tr(entry.title)}
                                        data-testid="admin-nav-group"
                                    >
                                        <entry.icon className="size-4 shrink-0" />
                                        {!sidebarCollapsed && (
                                            <>
                                                <span className="min-w-0 flex-1 truncate">
                                                    {tr(entry.title)}
                                                </span>
                                                <ChevronDown
                                                    className={cn(
                                                        'size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none',
                                                        open && 'rotate-180',
                                                    )}
                                                />
                                            </>
                                        )}
                                    </button>
                                    <div
                                        id={panelId}
                                        className={cn(
                                            'grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-none',
                                            open
                                                ? 'mt-1 grid-rows-[1fr] opacity-100'
                                                : 'grid-rows-[0fr] opacity-0',
                                        )}
                                        aria-hidden={!open}
                                        inert={!open}
                                    >
                                        <ul
                                            className="ml-[1.15rem] flex min-h-0 flex-col gap-1 overflow-hidden border-l border-sidebar-border pl-2"
                                            role="list"
                                        >
                                            {children.map((child) => (
                                                <li key={child.href}>
                                                    {renderLink(child)}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
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
                                title={tr('Back to Site')}
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
                <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:gap-3 sm:px-4">
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
                        <h1 className="min-w-0 truncate font-display text-lg font-semibold text-foreground">
                            {tr(title)}
                        </h1>
                    )}

                    <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
                        <AdminFeatureSearch />
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
                                className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-2"
                                aria-label={tr('User menu')}
                                aria-expanded={userMenuOpen}
                            >
                                <div className="relative flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                                    {user.avatar_url ? (
                                        <img
                                            src={user.avatar_url}
                                            alt={user.name}
                                            className="size-full rounded-full object-cover"
                                        />
                                    ) : (
                                        initials
                                    )}
                                    <OnlineDot
                                        userId={user.id}
                                        className="edu-online-dot--round"
                                    />
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
