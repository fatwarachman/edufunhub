import { useTranslations } from '@/hooks/use-translations';
import { Link, router } from '@inertiajs/react';
import { ChevronDown, LogOut, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface NavItem {
    href: string;
    labelKey: string;
    icon: LucideIcon;
    external?: boolean;
    /** Hidden on phones when another control already covers it. */
    mobileHide?: boolean;
    testId?: string;
    /** Count bubble (unread chats, friend requests). */
    count?: number;
}

export interface NavGroup {
    key: string;
    labelKey: string;
    icon: LucideIcon;
    items: NavItem[];
    /** Adds a log out row at the end of the panel. */
    logout?: boolean;
    testId: string;
}

export function isActive(url: string, href: string): boolean {
    const path = url.split(/[?#]/)[0];
    return path === href || (href !== '/' && path.startsWith(`${href}/`));
}

export function groupCount(group: NavGroup): number {
    return group.items.reduce((sum, item) => sum + (item.count ?? 0), 0);
}

function countLabel(count: number, max = 9): string {
    return count > max ? `${max}+` : String(count);
}

/**
 * Parent item in the header nav: one button that slides its child links
 * down in a panel. Closes on outside tap, Escape and navigation, and folds
 * to an icon with the rest of the header when space runs out.
 */
export function NavMenu({ group, url }: { group: NavGroup; url: string }) {
    const { t } = useTranslations();
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement | null>(null);
    const trigger = useRef<HTMLButtonElement | null>(null);
    const panelId = useId();
    const [lastUrl, setLastUrl] = useState(url);
    const Icon = group.icon;
    const active = group.items.some((item) => isActive(url, item.href));
    const total = groupCount(group);
    const label = t(group.labelKey);

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

    return (
        <div
            className="edu-game-menu edu-nav-menu"
            ref={root}
            data-testid={group.testId}
        >
            <button
                ref={trigger}
                type="button"
                className="edu-nav-btn"
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={panelId}
                aria-current={active ? 'page' : undefined}
                aria-label={
                    total > 0
                        ? t('nav.withCount', { label, count: total })
                        : label
                }
                data-tip={open ? undefined : label}
                onClick={() => setOpen((value) => !value)}
                data-testid={`${group.testId}-trigger`}
            >
                <Icon aria-hidden="true" />
                {total > 0 && (
                    <span className="edu-notice-badge" data-testid="nav-badge">
                        {countLabel(total)}
                    </span>
                )}
                <span className="edu-nav-label">{label}</span>
                <ChevronDown
                    aria-hidden="true"
                    className="edu-game-menu-chevron"
                    data-open={open}
                />
            </button>
            <div
                id={panelId}
                className="edu-game-menu-panel edu-nav-menu-panel"
                data-open={open}
                inert={!open}
                data-testid={`${group.testId}-panel`}
            >
                <ul>
                    {group.items.map((item) => (
                        <li key={item.href}>
                            <NavMenuLink item={item} url={url} />
                        </li>
                    ))}
                    {group.logout && (
                        <li className="edu-nav-menu-divider">
                            <LogoutRow />
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
}

/** One child link row (header panels and the phone menu). */
export function NavMenuLink({ item, url }: { item: NavItem; url: string }) {
    const { t } = useTranslations();
    const Icon = item.icon;
    const current = isActive(url, item.href) ? ('page' as const) : undefined;
    const content = (
        <>
            <span className="edu-game-menu-icon edu-nav-more-icon">
                <Icon aria-hidden="true" />
            </span>
            <span className="edu-game-menu-title">{t(item.labelKey)}</span>
            {(item.count ?? 0) > 0 && (
                <span className="edu-nav-more-count">
                    {countLabel(item.count ?? 0, 99)}
                </span>
            )}
        </>
    );

    return item.external ? (
        <a
            href={item.href}
            className="edu-game-menu-item"
            aria-current={current}
            data-testid={item.testId}
        >
            {content}
        </a>
    ) : (
        <Link
            href={item.href}
            className="edu-game-menu-item"
            aria-current={current}
            data-testid={item.testId}
        >
            {content}
        </Link>
    );
}

export function LogoutRow() {
    const { t } = useTranslations();
    return (
        <button
            type="button"
            onClick={() => router.post('/logout')}
            className="edu-game-menu-item edu-nav-more-logout"
            data-testid="nav-logout"
        >
            <span className="edu-game-menu-icon edu-nav-more-icon">
                <LogOut aria-hidden="true" />
            </span>
            <span className="edu-game-menu-title">{t('nav.logout')}</span>
        </button>
    );
}

/**
 * Phone menu section: a parent row that slides its children down smoothly
 * (grid-rows transition), so the menu shows groups instead of one long list.
 */
export function NavMenuSection({
    group,
    url,
}: {
    group: NavGroup;
    url: string;
}) {
    const { t } = useTranslations();
    const active = group.items.some((item) => isActive(url, item.href));
    const [open, setOpen] = useState(active || groupCount(group) > 0);
    const panelId = useId();
    const Icon = group.icon;
    const total = groupCount(group);

    return (
        <li className="edu-nav-section" data-open={open}>
            <button
                type="button"
                className="edu-game-menu-item edu-nav-section-toggle"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((value) => !value)}
                data-testid={`${group.testId}-section`}
            >
                <span className="edu-game-menu-icon edu-nav-more-icon">
                    <Icon aria-hidden="true" />
                </span>
                <span className="edu-game-menu-title">{t(group.labelKey)}</span>
                {total > 0 && (
                    <span className="edu-nav-more-count">
                        {countLabel(total, 99)}
                    </span>
                )}
                <ChevronDown
                    aria-hidden="true"
                    className="edu-game-menu-chevron edu-nav-section-chevron"
                    data-open={open}
                />
            </button>
            <div
                id={panelId}
                className="edu-nav-section-panel"
                inert={!open}
                data-testid={`${group.testId}-section-panel`}
            >
                <ul>
                    {group.items.map((item) => (
                        <li key={item.href}>
                            <NavMenuLink item={item} url={url} />
                        </li>
                    ))}
                    {group.logout && (
                        <li>
                            <LogoutRow />
                        </li>
                    )}
                </ul>
            </div>
        </li>
    );
}
