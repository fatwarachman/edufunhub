import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Languages } from 'lucide-react';
import { useState } from 'react';

const LANGUAGES = [
    { code: 'id', short: 'ID', labelKey: 'language.id' },
    { code: 'en', short: 'EN', labelKey: 'language.en' },
] as const;

type LanguageCode = (typeof LANGUAGES)[number]['code'];

/**
 * Indonesian/English switch. Indonesian is the default; the choice is saved on
 * the account (or the session for guests) and the page reloads its props so
 * server-made text (history names, item names) follows the new language.
 */
export function LanguageToggle({
    variant = 'player',
    className,
}: {
    variant?: 'player' | 'admin';
    className?: string;
}) {
    const { t, i18n } = useTranslations();
    const { locale } = usePage<SharedData>().props;
    const [pending, setPending] = useState<LanguageCode | null>(null);
    const current: LanguageCode = pending ?? (locale === 'en' ? 'en' : 'id');

    const choose = (code: LanguageCode) => {
        if (code === current || pending !== null) {
            return;
        }
        const previous = current;
        setPending(code);
        i18n.changeLanguage(code);
        router.patch(
            '/locale',
            { locale: code },
            {
                preserveScroll: true,
                onError: () => {
                    i18n.changeLanguage(previous);
                },
                onFinish: () => setPending(null),
            },
        );
    };

    return (
        <div
            role="radiogroup"
            aria-label={t('language.label')}
            data-testid="language-toggle"
            className={cn(
                'inline-flex items-center gap-1',
                variant === 'player'
                    ? 'rounded-xl border-[2.5px] border-[#151b2e] bg-[#fffaf0] p-1 shadow-[2px_2px_0_#151b2e]'
                    : 'rounded-lg border border-border bg-muted/40 p-0.5',
                className,
            )}
        >
            <Languages
                aria-hidden="true"
                className={cn(
                    'shrink-0',
                    variant === 'player'
                        ? 'mx-1 size-4 text-[#151b2e]'
                        : 'mx-1 size-3.5 text-muted-foreground',
                )}
            />
            {LANGUAGES.map((language) => {
                const active = language.code === current;
                return (
                    <button
                        key={language.code}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={t(language.labelKey)}
                        title={t(language.labelKey)}
                        disabled={pending !== null}
                        onClick={() => choose(language.code)}
                        data-testid={`language-${language.code}`}
                        className={cn(
                            'inline-flex items-center justify-center font-bold transition-colors focus-visible:outline-none disabled:cursor-wait',
                            variant === 'player'
                                ? 'min-h-9 min-w-11 rounded-lg px-2.5 text-sm text-[#151b2e] focus-visible:ring-3 focus-visible:ring-[#6c5ce7]'
                                : 'h-7 min-w-9 rounded-md px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring',
                            active
                                ? variant === 'player'
                                    ? 'bg-[#ffd93d]'
                                    : 'bg-background text-foreground shadow-sm'
                                : variant === 'player'
                                  ? 'hover:bg-[#ffe9a6]'
                                  : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {language.short}
                    </button>
                );
            })}
        </div>
    );
}
