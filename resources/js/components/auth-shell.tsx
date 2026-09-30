import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
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
                    <a href="/" className="auth-brand" aria-label="EduFunHub">
                        <span className="auth-brand-mark">
                            <Gamepad2 className="size-6" />
                        </span>
                        <span>
                            EduFun<span>Hub</span>
                        </span>
                    </a>
                    <a
                        href={backHref}
                        className="inline-flex items-center gap-2 text-sm font-semibold"
                    >
                        <ArrowLeft className="size-4" />
                        {t(`${namespace}.back`)}
                    </a>
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
