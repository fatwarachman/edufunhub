import { Google } from '@/components/brand-icons';
import { BrandWordmark } from '@/components/brand-wordmark';
import InputError from '@/components/input-error';
import { BackButton, NavButton } from '@/components/site-nav';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/hooks/use-translations';
import { Head, usePage } from '@inertiajs/react';
import { Gamepad2, ShieldCheck } from 'lucide-react';
import '../../../css/auth-landing.css';

interface RegisterProps {
    googleEnabled: boolean;
    googleRedirectUrl: string | null;
}

/**
 * New accounts are created only with a Google account (verified email).
 * Manual email + password sign-up is closed; existing accounts still sign
 * in on /login.
 */
export default function Register({
    googleEnabled,
    googleRedirectUrl,
}: RegisterProps) {
    const { t } = useTranslations();
    const { errors } = usePage<{ errors: Record<string, string> }>().props;

    return (
        <>
            <Head title={t('register.title')}>
                <link
                    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <div className="auth-landing">
                <header className="auth-header">
                    <a
                        href="/"
                        className="auth-brand"
                        aria-label="edufunhub.com"
                    >
                        <span className="auth-brand-mark">
                            <Gamepad2 className="size-6" />
                        </span>
                        <BrandWordmark />
                    </a>
                    <div className="edu-nav-bar">
                        <BackButton href="/" label={t('login.back')} external />
                        <NavButton
                            href="/gamelist"
                            icon={Gamepad2}
                            label={t('nav.games')}
                        />
                    </div>
                </header>
                <main className="auth-main">
                    <section className="auth-intro">
                        <span className="auth-badge">{t('login.badge')}</span>
                        <h1>
                            {t('register.hero')}{' '}
                            <span>{t('register.heroAccent')}</span>
                        </h1>
                        <p>{t('register.description')}</p>
                        <div className="auth-shapes" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </div>
                    </section>
                    <section
                        className="min-w-0"
                        aria-labelledby="register-heading"
                    >
                        <div
                            className="auth-card"
                            data-testid="register-google-only"
                        >
                            <div className="mb-6 flex flex-col gap-2">
                                <h2
                                    id="register-heading"
                                    className="text-3xl font-bold tracking-tight"
                                >
                                    {t('register.title')}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {t('register.googleOnly')}
                                </p>
                            </div>
                            <div className="flex flex-col gap-4">
                                {googleEnabled && googleRedirectUrl ? (
                                    <Button
                                        variant="outline"
                                        asChild
                                        className="auth-google h-auto min-h-12 w-full py-3 text-center text-base whitespace-normal"
                                    >
                                        <a
                                            href={googleRedirectUrl}
                                            data-testid="register-google"
                                        >
                                            <Google className="size-5 shrink-0" />
                                            {t('register.google')}
                                        </a>
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            variant="outline"
                                            disabled
                                            className="auth-google h-auto min-h-12 w-full py-3 text-center text-base whitespace-normal"
                                            aria-describedby="register-google-unavailable"
                                        >
                                            <Google className="size-5 shrink-0" />
                                            {t('register.google')}
                                        </Button>
                                        <p
                                            id="register-google-unavailable"
                                            className="text-center text-xs text-muted-foreground"
                                            data-testid="register-google-unavailable"
                                        >
                                            {t('register.googleUnavailable')}
                                        </p>
                                    </>
                                )}
                                {errors?.google && (
                                    <div role="alert">
                                        <InputError message={errors.google} />
                                    </div>
                                )}
                                <p
                                    className="flex items-start gap-2 rounded-xl border-2 border-[#151b2e] bg-[#e8f8ee] p-3 text-xs leading-relaxed font-medium text-[#151b2e]"
                                    data-testid="register-google-why"
                                >
                                    <ShieldCheck
                                        className="mt-0.5 size-4 shrink-0 text-green-600"
                                        aria-hidden="true"
                                    />
                                    {t('register.googleWhy')}
                                </p>
                                <p className="text-center text-xs text-muted-foreground">
                                    {t('register.agreement')}{' '}
                                    <TextLink href="/terms" className="text-xs">
                                        {t('register.terms')}
                                    </TextLink>{' '}
                                    {t('register.and')}{' '}
                                    <TextLink
                                        href="/privacy"
                                        className="text-xs"
                                    >
                                        {t('register.privacy')}
                                    </TextLink>
                                    .
                                </p>
                            </div>
                        </div>

                        <p className="mt-6 text-center text-sm text-muted-foreground">
                            {t('register.existing')}{' '}
                            <TextLink href="/login">
                                {t('login.submit')}
                            </TextLink>
                        </p>
                    </section>
                </main>
            </div>
        </>
    );
}
