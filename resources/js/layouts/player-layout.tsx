import { SiteNav } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { Gamepad2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import '../../css/auth-landing.css';

export default function PlayerLayout({
    title,
    children,
}: {
    title: string;
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
        <div className="auth-landing">
            <Head title={title}>
                <link
                    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <header className="auth-header">
                <Link
                    href="/portal"
                    className="auth-brand"
                    aria-label="EduFunHub"
                >
                    <span className="auth-brand-mark">
                        <Gamepad2 className="size-6" />
                    </span>
                    <span className="edu-brand-text">
                        EduFun<span>Hub</span>
                    </span>
                </Link>
                <SiteNav />
            </header>
            <main className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-8 md:px-10 md:py-12">
                {children}
            </main>
        </div>
    );
}
