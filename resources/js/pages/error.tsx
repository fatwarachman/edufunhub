import { NavButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { Gamepad2, Home } from 'lucide-react';
import '../../css/auth-landing.css';

interface ErrorPageProps {
    status: number;
}

const MESSAGES: Record<number, { id: string; en: string }> = {
    403: {
        id: 'Anda tidak memiliki izin untuk membuka halaman ini.',
        en: 'You do not have permission to open this page.',
    },
    404: {
        id: 'Halaman yang Anda cari tidak ditemukan.',
        en: 'The page you were looking for could not be found.',
    },
    429: {
        id: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.',
        en: 'Too many requests. Please try again shortly.',
    },
    500: {
        id: 'Terjadi kesalahan pada server kami.',
        en: 'Something went wrong on our server.',
    },
    503: {
        id: 'Layanan sedang dalam pemeliharaan.',
        en: 'The service is under maintenance.',
    },
};

export default function ErrorPage({ status }: ErrorPageProps) {
    const { t, i18n } = useTranslations();
    const signedIn = Boolean(usePage<SharedData>().props.auth?.user);
    const message = MESSAGES[status] ?? MESSAGES[500];
    const fallback =
        i18n.language === 'id' ? MESSAGES[500].id : MESSAGES[500].en;

    return (
        <div className="auth-landing">
            <Head title={`${status}`}>
                <link
                    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <header className="auth-header">
                <a href="/" className="auth-brand" aria-label="edufunhub.com">
                    <span className="auth-brand-mark">
                        <Gamepad2 className="size-6" />
                    </span>
                    <span>
                        edufun<span>hub</span>.com
                    </span>
                </a>
            </header>
            <main className="auth-main">
                <section className="auth-intro">
                    <span className="auth-badge">{t('login.badge')}</span>
                    <h1>
                        <span>{status}</span>
                    </h1>
                    <p>
                        {message
                            ? i18n.language === 'id'
                                ? message.id
                                : message.en
                            : fallback}
                    </p>
                    <div className="auth-shapes" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                    </div>
                </section>
                <section className="min-w-0">
                    <div className="auth-card items-start">
                        <p className="text-6xl font-bold tabular-nums">
                            {status}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <NavButton
                                href={signedIn ? '/portal' : '/'}
                                icon={Home}
                                label={t(signedIn ? 'nav.portal' : 'nav.home')}
                                variant="primary"
                                external={!signedIn}
                            />
                            <NavButton
                                href="/gamelist"
                                icon={Gamepad2}
                                label={t('nav.games')}
                            />
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
