import {
    Activity,
    BellRing,
    BookMarked,
    Bot,
    ChartColumnBig,
    ChartNoAxesCombined,
    Clock,
    Coins,
    Gauge,
    History,
    ListChecks,
    Lock,
    Megaphone,
    MessageSquarePlus,
    MonitorSmartphone,
    Server,
    Settings,
    ShieldCheck,
    ShoppingBag,
    SlidersHorizontal,
    Swords,
    Trophy,
    Users,
    UsersRound,
    Volume2,
} from 'lucide-react';

export interface NavItem {
    title: string;
    href: string;
    icon: React.ElementType;
    exact?: boolean;
    superadminOnly?: boolean;
}

/** Expandable sidebar entry that groups related pages (e.g. settings). */
export interface NavGroup {
    title: string;
    icon: React.ElementType;
    children: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
    return 'children' in entry;
}

export const navItems: NavEntry[] = [
    { title: 'Dashboard', href: '/admin/dashboard', icon: Gauge, exact: true },
    { title: 'AI Assistant', href: '/admin/ai-assistant', icon: Bot, superadminOnly: true },
    { title: 'Users', href: '/admin/users', icon: Users },
    { title: 'Roles', href: '/admin/roles', icon: ShieldCheck },
    { title: 'Permissions', href: '/admin/permissions', icon: Lock },
    {
        title: 'Analytics',
        icon: ChartNoAxesCombined,
        children: [
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
                title: 'Screen Time',
                href: '/admin/screen-time',
                icon: MonitorSmartphone,
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
        ],
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
        title: 'Notifications',
        href: '/admin/notifications',
        icon: BellRing,
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
    { title: 'Feedback', href: '/admin/feedback', icon: MessageSquarePlus },
    { title: 'Activity Log', href: '/admin/activity-log', icon: Activity },
    {
        title: 'Changelog',
        href: '/admin/changelog',
        icon: History,
        superadminOnly: true,
    },
    {
        title: 'Settings',
        icon: Settings,
        children: [
            {
                title: 'General',
                href: '/admin/settings',
                icon: SlidersHorizontal,
            },
            {
                title: 'Sound Settings',
                href: '/admin/sound-settings',
                icon: Volume2,
                superadminOnly: true,
            },
            {
                title: 'AI Settings',
                href: '/admin/ai-settings',
                icon: Bot,
                superadminOnly: true,
            },
            {
                title: 'Point Rules',
                href: '/admin/point-rules',
                icon: Coins,
                superadminOnly: true,
            },
        ],
    },
];
