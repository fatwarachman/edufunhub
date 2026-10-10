import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { tr } from '@/lib/admin-i18n';
import { isGroup, navItems, type NavItem } from '@/lib/admin-navigation';
import { Link, usePage } from '@inertiajs/react';
import { Home } from 'lucide-react';
import { Fragment, useLayoutEffect, useSyncExternalStore } from 'react';

/** One step of the admin breadcrumb trail. The last step has no link. */
export interface AdminCrumb {
    title: string;
    href?: string;
}

let pageTrail: AdminCrumb[] | null = null;
const listeners = new Set<() => void>();

function setPageTrail(next: AdminCrumb[] | null): void {
    pageTrail = next;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Lets a page describe the steps after its menu item (e.g. the user's name
 * and the opened game), since those come from page data. Titles are shown
 * as given, so translate them with `tr()` first.
 */
export function useAdminBreadcrumbs(trail: AdminCrumb[]): void {
    const key = JSON.stringify(trail);
    useLayoutEffect(() => {
        setPageTrail(JSON.parse(key) as AdminCrumb[]);
        return () => setPageTrail(null);
    }, [key]);
}

function pathOf(url: string): string {
    return url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

function matches(item: NavItem, path: string): boolean {
    return item.exact
        ? path === item.href
        : path === item.href || path.startsWith(item.href + '/');
}

function humanize(segment: string): string {
    if (/^\d+$/.test(segment)) {
        return tr('Details');
    }
    const words = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim();
    const known: Record<string, string> = {
        create: 'Create',
        edit: 'Edit',
        generate: 'Generate',
        log: 'Log',
    };
    return known[words]
        ? tr(known[words])
        : words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Dashboard › menu group › menu item › page steps, derived from the URL. */
export function buildAdminTrail(
    url: string,
    pageSteps: AdminCrumb[] | null,
): AdminCrumb[] {
    const path = pathOf(url);
    const home: AdminCrumb = {
        title: tr('Dashboard'),
        href: '/admin/dashboard',
    };
    if (path === '/admin/dashboard' || path === '/admin') {
        return [{ title: home.title }];
    }

    let best: { item: NavItem; group?: string } | null = null;
    for (const entry of navItems) {
        const candidates = isGroup(entry)
            ? entry.children.map((item) => ({ item, group: entry.title }))
            : [{ item: entry }];
        for (const candidate of candidates) {
            if (
                matches(candidate.item, path) &&
                (!best || candidate.item.href.length > best.item.href.length)
            ) {
                best = candidate;
            }
        }
    }

    const trail: AdminCrumb[] = [home];
    if (best) {
        if (best.group) {
            trail.push({ title: tr(best.group) });
        }
        trail.push({ title: tr(best.item.title), href: best.item.href });
    }

    if (pageSteps && pageSteps.length > 0) {
        trail.push(...pageSteps);
    } else {
        const base = best ? best.item.href : '/admin';
        const rest = path.slice(base.length).split('/').filter(Boolean);
        let href = base;
        rest.forEach((segment) => {
            href += `/${segment}`;
            trail.push({ title: humanize(segment), href });
        });
    }

    return trail.map((crumb, index) =>
        index === trail.length - 1 ? { title: crumb.title } : crumb,
    );
}

/** Breadcrumb trail above every admin page, so each level is one click away. */
export function AdminBreadcrumbs() {
    const { url } = usePage();
    const steps = useSyncExternalStore(
        subscribe,
        () => pageTrail,
        () => null,
    );
    const trail = buildAdminTrail(url, steps);

    if (trail.length < 2) {
        return null;
    }

    return (
        <Breadcrumb className="mb-4 min-w-0" data-testid="admin-breadcrumbs">
            <BreadcrumbList className="gap-1 text-xs sm:gap-1.5 sm:text-sm">
                {trail.map((crumb, index) => {
                    const last = index === trail.length - 1;
                    return (
                        <Fragment key={`${index}-${crumb.title}`}>
                            <BreadcrumbItem className="min-w-0">
                                {last ? (
                                    <BreadcrumbPage
                                        className="max-w-[16rem] truncate font-medium sm:max-w-md"
                                        data-testid="admin-breadcrumb-current"
                                    >
                                        {crumb.title}
                                    </BreadcrumbPage>
                                ) : crumb.href ? (
                                    <BreadcrumbLink asChild>
                                        <Link
                                            href={crumb.href}
                                            className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            data-testid="admin-breadcrumb-link"
                                        >
                                            {index === 0 && (
                                                <Home
                                                    className="size-3.5 shrink-0"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="truncate">
                                                {crumb.title}
                                            </span>
                                        </Link>
                                    </BreadcrumbLink>
                                ) : (
                                    <span className="max-w-[10rem] truncate">
                                        {crumb.title}
                                    </span>
                                )}
                            </BreadcrumbItem>
                            {!last && <BreadcrumbSeparator />}
                        </Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
