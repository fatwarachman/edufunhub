import { useTranslations } from '@/hooks/use-translations';
import { Head, Link } from '@inertiajs/react';
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
                <a href="/" className="auth-brand" aria-label="EduFunHub">
                    <span className="auth-brand-mark">
                        <Gamepad2 className="size-6" />
                    </span>
                    <span>
                        EduFun<span>Hub</span>
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
                        <Link
                            href="/"
                            className="inline-flex min-h-11 items-center gap-2 font-semibold underline"
                        >
                            <Home className="size-4" />
                            {t('login.back')}
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
