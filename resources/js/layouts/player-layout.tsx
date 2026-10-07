import { BrandWordmark } from '@/components/brand-wordmark';
import { DigitalClock } from '@/components/digital-clock';
import { SiteNav } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { Gamepad2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import '../../css/auth-landing.css';

export default function PlayerLayout({
    title,
    fill = false,
    children,
}: {
    title: string;
    /** Content fills the viewport height below the header (chat). */
    fill?: boolean;
    children: ReactNode;
}) {
    const { i18n } = useTranslations();
    const { locale } = usePage<SharedData>().props;

    useEffect(() => {
        if (locale && i18n.language !== locale) {
            i18n.changeLanguage(locale);
        }
    }, [locale, i18n]);

    return (
        <div
            className={
                fill ? 'auth-landing flex h-dvh flex-col' : 'auth-landing'
            }
        >
            <Head title={title}>
                <link
                    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <header className="auth-header">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <Link
                        href="/portal"
                        className="auth-brand"
                        aria-label="edufunhub.com"
                    >
                        <span className="auth-brand-mark">
                            <Gamepad2 className="size-6" />
                        </span>
                        <BrandWordmark hideOnPhone />
                    </Link>
                    <DigitalClock />
                </div>
                <SiteNav compact />
            </header>
            <main
                className={
                    fill
                        ? 'flex min-h-0 w-full flex-1 flex-col px-[clamp(12px,2vw,32px)] pt-4 pb-[max(20px,env(safe-area-inset-bottom))]'
                        : 'flex w-full flex-col gap-8 px-[clamp(16px,2vw,32px)] py-6 md:py-8'
                }
            >
                {children}
            </main>
        </div>
    );
}
