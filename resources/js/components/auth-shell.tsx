import { BrandWordmark } from '@/components/brand-wordmark';
import { BackButton, NavButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { Gamepad2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import '../../css/auth-landing.css';

interface AuthShellProps {
    namespace: string;
    children: ReactNode;
    backHref?: string;
}

export default function AuthShell({
    namespace,
    children,
    backHref = '/',
}: AuthShellProps) {
    const { t, i18n } = useTranslations();
    const { locale } = usePage<SharedData>().props;

    useEffect(() => {
        if (locale && i18n.language !== locale) {
            i18n.changeLanguage(locale);
        }
    }, [locale, i18n]);

    return (
        <>
            <Head title={t(`${namespace}.title`)}>
                <link
                    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <div className="auth-landing">
                <header className="auth-header">
                    <a href="/" className="auth-brand" aria-label="edufunhub.com">
                        <span className="auth-brand-mark">
                            <Gamepad2 className="size-6" />
                        </span>
                        <BrandWordmark />
                    </a>
                    <div className="edu-nav-bar">
                        <BackButton
                            href={backHref}
                            label={t(`${namespace}.back`)}
                            external={backHref === '/'}
                        />
                        <NavButton
                            href="/gamelist"
                            icon={Gamepad2}
                            label={t('nav.games')}
                        />
                    </div>
                </header>
                <main className="auth-main">
                    <section className="auth-intro">
                        <span className="auth-badge">
                            {t(`${namespace}.badge`)}
                        </span>
                        <h1>
                            {t(`${namespace}.hero`)}{' '}
                            <span>{t(`${namespace}.heroAccent`)}</span>
                        </h1>
                        <p>{t(`${namespace}.description`)}</p>
                        <div className="auth-shapes" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </div>
                    </section>
                    <section className="min-w-0">
                        <div className="auth-card">{children}</div>
                    </section>
                </main>
            </div>
        </>
    );
}
