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
 * Compact Indonesian/English switch for in-game headers. Changing the
 * language switches the i18n catalog immediately so the Go referee receives
 * the `locale` message and re-sends its state (set titles, bin names, hints
 * and cable labels follow), then persists the choice on the account.
 */
export function GameLanguageToggle({
    className,
    testId = 'game-language-toggle',
}: {
    className?: string;
    testId?: string;
}) {
    const { t, i18n } = useTranslations();
    const { locale } = usePage<SharedData>().props;
    const [pending, setPending] = useState<LanguageCode | null>(null);
    const current: LanguageCode =
        pending ?? (i18n.language === 'en' || locale === 'en' ? 'en' : 'id');

    const choose = (code: LanguageCode) => {
        if (code === current || pending !== null) {
            return;
        }
        const previous = current;
        setPending(code);
        void i18n.changeLanguage(code);
        router.patch(
            '/locale',
            { locale: code },
            {
                preserveScroll: true,
                preserveState: true,
                onError: () => {
                    void i18n.changeLanguage(previous);
                },
                onFinish: () => setPending(null),
            },
        );
    };

    return (
        <div
            role="radiogroup"
            aria-label={t('language.label')}
            data-testid={testId}
            className={cn(
                'inline-flex h-11 items-center gap-0.5 rounded-xl border-2 border-[#1f2a44] bg-white p-1',
                className,
            )}
        >
            <Languages
                aria-hidden="true"
                className="mx-1 size-4 shrink-0 text-[#1f2a44]"
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
                        data-testid={`${testId}-${language.code}`}
                        className={cn(
                            'inline-flex h-8 min-w-9 items-center justify-center rounded-lg px-2 text-xs font-black text-[#1f2a44] transition-colors focus-visible:ring-3 focus-visible:ring-[#6c5ce7] focus-visible:outline-none disabled:cursor-wait',
                            active ? 'bg-[#ffd93d]' : 'hover:bg-[#ffe9a6]',
                        )}
                    >
                        {language.short}
                    </button>
                );
            })}
        </div>
    );
}
