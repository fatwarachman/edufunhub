import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Gamepad2, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import '../../css/auth-landing.css';

export default function PlayerLayout({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    const { t, i18n } = useTranslations();
    const { locale } = usePage<SharedData>().props;

    useEffect(() => {
        if (locale && i18n.language !== locale) {
            i18n.changeLanguage(locale);
        }
    }, [locale, i18n]);

    return (
        <div className="auth-landing">
            <Head title={title}>
                <link
                    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <header className="auth-header flex-wrap">
                <a href="/" className="auth-brand">
                    <span className="auth-brand-mark">
                        <Gamepad2 className="size-6" />
                    </span>
                    <span>
                        EduFun<span>Hub</span>
                    </span>
                </a>
                <nav
                    aria-label={t('player.navigation')}
                    className="flex flex-wrap items-center gap-4 text-sm font-semibold"
                >
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2"
                    >
                        <LayoutDashboard className="size-4" />
                        {t('player.dashboard')}
                    </Link>
                    <Link
                        href="/character"
                        className="inline-flex items-center gap-2"
                    >
                        <UserRound className="size-4" />
                        {t('player.character')}
                    </Link>
                    <button
                        type="button"
                        onClick={() => router.post('/logout')}
                        className="inline-flex items-center gap-2"
                    >
                        <LogOut className="size-4" />
                        {t('player.logout')}
                    </button>
                </nav>
            </header>
            <main className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-8 md:px-10 md:py-12">
                {children}
            </main>
        </div>
    );
}
