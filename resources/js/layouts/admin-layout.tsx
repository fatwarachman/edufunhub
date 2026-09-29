import { AdminSidebarGroup } from '@/components/admin/admin-sidebar-group';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { FeatureProvider } from '@/contexts/feature-context';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    Boxes,
    LayoutDashboard,
    Menu,
    ScrollText,
    Search,
    Shield,
    TrendingUp,
    Users,
    X,
} from 'lucide-react';
import {
    type PropsWithChildren,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

interface QuickStats {
    total_users: number;
    total_roles: number;
    total_permissions: number;
}

function AdminQuickStatsWidget() {
    const [stats, setStats] = useState<QuickStats | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/admin/quick-stats', {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch('/admin/quick-stats', {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                });
                if (!cancelled && res.ok) {
                    setStats(await res.json());
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (!stats) {
        return (
            <div className="grid grid-cols-3 gap-1 rounded-md border border-sidebar-border bg-sidebar-accent/20 p-2">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                        <div className="h-4 w-8 animate-pulse rounded bg-sidebar-accent/40" />
                        <div className="h-2.5 w-10 animate-pulse rounded bg-sidebar-accent/30" />
                    </div>
                ))}
            </div>
        );
    }

    const items = [
        {
            label: 'Users',
            value: stats.total_users.toLocaleString(),
        },
        {
            label: 'Roles',
            value: stats.total_roles.toLocaleString(),
        },
        {
            label: 'Permissions',
            value: stats.total_permissions.toLocaleString(),
        },
    ];

    return (
        <div className="relative rounded-md border border-sidebar-border bg-sidebar-accent/20 p-2">
            <button
                onClick={fetchStats}
                disabled={loading}
                className="absolute top-1 right-1 rounded p-1 transition-colors hover:bg-sidebar-accent/50"
                title="Refresh stats"
            >
                <TrendingUp
                    className={cn('size-3', loading && 'animate-spin')}
                />
            </button>
            <div className="grid grid-cols-3 gap-1">
                {items.map((item) => (
                    <div
                        key={item.label}
                        className="flex flex-col items-center gap-0.5"
                    >
                        <span className="text-sm font-semibold text-sidebar-foreground">
                            {item.value}
                        </span>
                        <span className="text-[10px] text-sidebar-foreground/50">
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Navigation groups configuration
const adminNavGroups = [
    {
        title: 'Dashboard',
        icon: LayoutDashboard,
        storageKey: 'dashboard',
        defaultExpanded: true,
        items: [
            {
                title: 'Overview',
                href: '/admin/dashboard',
                icon: LayoutDashboard,
            },
        ],
    },
    {
        title: 'Manajemen User',
        icon: Users,
        storageKey: 'user-management',
        defaultExpanded: true,
        items: [
            { title: 'Users', href: '/admin/users', icon: Users },
            { title: 'Roles', href: '/admin/roles', icon: Shield },
            { title: 'Modules', href: '/admin/modules', icon: Boxes },
            {
                title: 'Impersonation Logs',
                href: '/admin/impersonation-logs',
                icon: ScrollText,
            },
        ],
    },
];

interface SearchResult {
    id: number;
    name?: string;
    email?: string;
    url: string;
}

function AdminSearchBar() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[] | null>(null);
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchResults = useCallback(async (q: string) => {
        if (q.length < 2) {
            setResults(null);
            return;
        }
        const res = await fetch(`/admin/search?q=${encodeURIComponent(q)}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (res.ok) {
            const data = await res.json();
            setResults(data.users ?? []);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => fetchResults(query), 300);
        return () => clearTimeout(timer);
    }, [query, fetchResults]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const hasResults = results && results.length > 0;

    const navigate = (url: string) => {
        setOpen(false);
        setQuery('');
        setResults(null);
        router.visit(url);
    };

    return (
        <div ref={containerRef} className="relative px-3 py-2">
            <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2.5 py-1.5">
                <Search className="size-3.5 shrink-0 text-sidebar-foreground/50" />
                <input
                    className="w-full bg-transparent text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/50"
                    placeholder="Cari user…"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                />
            </div>

            {open && query.length >= 2 && (
                <div className="absolute top-full right-3 left-3 z-50 mt-1 rounded-md border border-border bg-popover shadow-lg">
                    {!hasResults ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                            Tidak ada hasil.
                        </p>
                    ) : (
                        <div className="max-h-80 overflow-y-auto">
                            {results.map((u) => (
                                <button
                                    key={u.id}
                                    onClick={() => navigate(u.url)}
                                    className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
                                >
                                    <span className="font-medium">
                                        {u.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {u.email}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Mobile drawer component
function MobileAdminDrawer({
    currentPath,
    isOpen,
    onClose,
}: {
    currentPath: string;
    isOpen: boolean;
    onClose: () => void;
}) {
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                onClick={onClose}
            />
            {/* Drawer */}
            <div className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar lg:hidden">
                <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
                    <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-md bg-red-600 text-xs font-bold text-white">
                            A
                        </div>
                        <span className="text-sm font-semibold text-sidebar-foreground">
                            Admin Panel
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded p-1 hover:bg-sidebar-accent"
                    >
                        <X className="size-5 text-sidebar-foreground" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                    {adminNavGroups.map((group) => (
                        <AdminSidebarGroup
                            key={group.title}
                            title={group.title}
                            icon={group.icon}
                            items={group.items}
                            currentPath={currentPath}
                            defaultExpanded={group.defaultExpanded}
                            storageKey={group.storageKey}
                        />
                    ))}
                </div>
                <div className="border-t border-sidebar-border p-3">
                    <Link
                        href="/dashboard"
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        Back to App
                    </Link>
                </div>
            </div>
        </>
    );
}

// Breadcrumb component
function AdminBreadcrumb({ currentPath }: { currentPath: string }) {
    // Find the current group and item
    let currentGroup = '';
    let currentItem = '';

    for (const group of adminNavGroups) {
        const item = group.items.find(
            (i) =>
                currentPath === i.href || currentPath.startsWith(i.href + '/'),
        );
        if (item) {
            currentGroup = group.title;
            currentItem = item.title;
            break;
        }
    }

    if (!currentItem) return null;

    return (
        <nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Link
                href="/admin/dashboard"
                className="transition-colors hover:text-foreground"
            >
                Admin
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground">{currentGroup}</span>
            {currentItem !== currentGroup && (
                <>
                    <span className="text-muted-foreground/50">/</span>
                    <span className="font-medium text-foreground">
                        {currentItem}
                    </span>
                </>
            )}
        </nav>
    );
}

export default function AdminLayout({ children }: PropsWithChildren) {
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const currentPath =
        typeof window !== 'undefined' ? window.location.pathname : '';

    return (
        <FeatureProvider>
            <div className="flex min-h-screen">
                {/* Desktop Sidebar */}
                <aside className="hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
                    <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-6">
                        <div className="flex size-7 items-center justify-center rounded-md bg-red-600 text-xs font-bold text-white">
                            A
                        </div>
                        <span className="text-sm font-semibold">
                            Admin Panel
                        </span>
                    </div>

                    <AdminSearchBar />

                    <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                        {adminNavGroups.map((group) => (
                            <AdminSidebarGroup
                                key={group.title}
                                title={group.title}
                                icon={group.icon}
                                items={group.items}
                                currentPath={currentPath}
                                defaultExpanded={group.defaultExpanded}
                                storageKey={group.storageKey}
                            />
                        ))}
                    </nav>

                    <div className="flex flex-col gap-2 border-t border-sidebar-border p-3">
                        <AdminQuickStatsWidget />
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                        >
                            <ArrowLeft className="size-4" />
                            Back to App
                        </Link>
                    </div>
                </aside>

                {/* Mobile Drawer */}
                <MobileAdminDrawer
                    currentPath={currentPath}
                    isOpen={mobileDrawerOpen}
                    onClose={() => setMobileDrawerOpen(false)}
                />

                {/* Main Content */}
                <div className="flex min-w-0 flex-1 flex-col">
                    <ImpersonationBanner />

                    {/* Mobile Header */}
                    <header className="flex h-14 items-center gap-4 border-b px-4 lg:hidden">
                        <button
                            onClick={() => setMobileDrawerOpen(true)}
                            className="rounded-md p-2 hover:bg-accent"
                        >
                            <Menu className="size-5" />
                        </button>
                        <div className="flex size-7 items-center justify-center rounded-md bg-red-600 text-xs font-bold text-white">
                            A
                        </div>
                        <span className="text-sm font-semibold">
                            Admin Panel
                        </span>
                    </header>

                    <main className="flex-1 overflow-y-auto p-4 lg:p-8">
                        <div className="mx-auto max-w-7xl">
                            <AdminBreadcrumb currentPath={currentPath} />
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </FeatureProvider>
    );
}
