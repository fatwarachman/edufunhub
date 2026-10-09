import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useTranslations } from '@/hooks/use-translations';
import { tr } from '@/lib/admin-i18n';
import { isGroup, navItems } from '@/lib/admin-navigation';
import { searchFeatures, type FeatureSearchEntry } from '@/lib/feature-search';
import englishAdmin from '@/locales/en-admin.json';
import english from '@/locales/en-feature-search.json';
import indonesianAdmin from '@/locales/id-admin.json';
import indonesian from '@/locales/id-feature-search.json';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { ArrowUpRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export function AdminFeatureSearch() {
    const { auth, gameMenu = [] } = usePage<SharedData>().props;
    const { t, i18n } = useTranslations();
    const copy = i18n.language.startsWith('id') ? indonesian : english;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const entries: FeatureSearchEntry[] = navItems.flatMap((entry) => {
        const children = isGroup(entry) ? entry.children : [entry];
        return children.map((item) => ({
            ...item,
            title: tr(item.title),
            group: isGroup(entry) ? tr(entry.title) : copy.admin,
            keywords: `${item.title} ${(indonesianAdmin as Record<string, string>)[item.title] ?? ''} ${(englishAdmin as Record<string, string>)[item.title] ?? ''} ${item.href}`,
        }));
    });
    for (const [key, feature] of Object.entries(copy.features)) {
        entries.push({
            ...feature,
            group: feature.href.startsWith('/admin/')
                ? copy.admin
                : copy.player,
            keywords: `${english.features[key as keyof typeof english.features].title} ${indonesian.features[key as keyof typeof indonesian.features].title} ${feature.href}`,
        });
    }
    for (const category of gameMenu) {
        for (const game of category.games) {
            const keywords = [
                game.key,
                t(game.titleKey, { lng: 'id' }),
                t(game.titleKey, { lng: 'en' }),
                game.descriptionKey ? t(game.descriptionKey) : '',
            ].join(' ');
            entries.push({
                href: game.url,
                title: t(game.titleKey),
                group: `${copy.games} · ${t(category.titleKey)}`,
                keywords,
            });
            entries.push({
                href: `/admin/games/${game.key}`,
                title: `${tr('Game Statistics')} · ${t(game.titleKey)}`,
                group: copy.admin,
                keywords,
                superadminOnly: true,
            });
        }
    }
    const results = searchFeatures(entries, query, {
        superadmin: Boolean(auth.user.is_superadmin),
        teacher: Boolean(auth.user.is_teacher),
    });
    const groups = [...new Set(results.map((entry) => entry.group))];

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 'k'
            ) {
                event.preventDefault();
                setOpen((value) => !value);
                setQuery('');
            }
        };
        document.addEventListener('keydown', onKey);
        const unsubscribe = router.on('navigate', () => setOpen(false));
        return () => {
            document.removeEventListener('keydown', onKey);
            unsubscribe();
        };
    }, []);

    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                setOpen(value);
                setQuery('');
            }}
        >
            <DialogTrigger asChild>
                <button
                    type="button"
                    data-testid="admin-feature-search"
                    aria-label={copy.title}
                    className="flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                    <Search className="size-4 shrink-0" aria-hidden="true" />
                    <span className="hidden lg:inline">{copy.title}</span>
                    <kbd className="hidden rounded border border-border px-1 text-[10px] xl:inline">
                        Ctrl K
                    </kbd>
                </button>
            </DialogTrigger>
            <DialogContent className="gap-0 overflow-hidden p-0 dark:border-white/25 dark:shadow-white/5">
                <div className="flex flex-col gap-2 px-4 py-4 pr-12">
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>{copy.description}</DialogDescription>
                </div>
                <Command shouldFilter={false}>
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder={copy.placeholder}
                        aria-label={copy.title}
                    />
                    <CommandList
                        className="max-h-[min(55dvh,420px)]"
                        aria-label={copy.results}
                    >
                        <CommandEmpty>{copy.empty}</CommandEmpty>
                        {groups.map((group) => (
                            <CommandGroup key={group} heading={group}>
                                {results
                                    .filter((entry) => entry.group === group)
                                    .map((entry) => (
                                        <CommandItem
                                            key={entry.href}
                                            value={entry.href}
                                            onSelect={() => {
                                                setOpen(false);
                                                router.visit(entry.href);
                                            }}
                                            className="cursor-pointer gap-3 px-3 py-3"
                                        >
                                            <span className="min-w-0 flex-1 break-words">
                                                {entry.title}
                                            </span>
                                            <ArrowUpRight
                                                className="size-4 shrink-0"
                                                aria-hidden="true"
                                            />
                                        </CommandItem>
                                    ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
                <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    {copy.hint}
                </p>
            </DialogContent>
        </Dialog>
    );
}
