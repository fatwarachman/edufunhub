import { Google } from '@/components/brand-icons';
import { BrandWordmark } from '@/components/brand-wordmark';
import InputError from '@/components/input-error';
import { BackButton, NavButton } from '@/components/site-nav';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/hooks/use-translations';
import { Head, useForm, usePage } from '@inertiajs/react';
import {
    Eye,
    EyeOff,
    Gamepad2,
    Loader2,
    Lock,
    Mail,
    ShieldCheck,
    User,
} from 'lucide-react';
import { type FormEventHandler, useState } from 'react';
import '../../../css/auth-landing.css';

interface RegisterProps {
    googleEnabled: boolean;
    googleRedirectUrl: string | null;
    emailRegistrationEnabled?: boolean;
}

/**
 * Sign-up with email + password: name, email and password only. Birth date,
 * school and grade are collected by the first-login profile wizard.
 */
function EmailRegisterForm() {
    const { t } = useTranslations();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
        website: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post('/register', {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <form
            onSubmit={submit}
            noValidate
            data-testid="register-email-form"
            className="flex flex-col gap-5"
        >
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">{t('register.name')}</Label>
                <div className="relative">
                    <User className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="name"
                        type="text"
                        name="name"
                        value={data.name}
                        onChange={(e) => setData('name', e.target.value)}
                        className="pl-9"
                        placeholder={t('register.namePlaceholder')}
                        autoComplete="name"
                        maxLength={255}
                        required
                        aria-invalid={Boolean(errors.name)}
                    />
                </div>
                <InputError message={errors.name} />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">{t('login.email')}</Label>
                <div className="relative">
                    <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        className="pl-9"
                        placeholder={t('login.emailPlaceholder')}
                        autoComplete="email"
                        maxLength={255}
                        required
                        aria-invalid={Boolean(errors.email)}
                    />
                </div>
                <InputError message={errors.email} />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">{t('login.password')}</Label>
                <div className="relative">
                    <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={data.password}
                        onChange={(e) => setData('password', e.target.value)}
                        className="pr-10 pl-9"
                        placeholder="••••••••"
                        autoComplete="new-password"
                        required
                        aria-invalid={Boolean(errors.password)}
                        aria-describedby="register-password-hint"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none"
                        aria-label={
                            showPassword
                                ? t('register.hide')
                                : t('register.show')
                        }
                    >
                        {showPassword ? (
                            <EyeOff className="size-4" />
                        ) : (
                            <Eye className="size-4" />
                        )}
                    </button>
                </div>
                <p
                    id="register-password-hint"
                    className="text-xs text-muted-foreground"
                >
                    {t('register.length')}
                </p>
                <InputError message={errors.password} />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="password_confirmation">
                    {t('register.confirm')}
                </Label>
                <div className="relative">
                    <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="password_confirmation"
                        type={showConfirm ? 'text' : 'password'}
                        name="password_confirmation"
                        value={data.password_confirmation}
                        onChange={(e) =>
                            setData('password_confirmation', e.target.value)
                        }
                        className="pr-10 pl-9"
                        placeholder="••••••••"
                        autoComplete="new-password"
                        required
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none"
                        aria-label={
                            showConfirm
                                ? t('register.hideConfirm')
                                : t('register.showConfirm')
                        }
                    >
                        {showConfirm ? (
                            <EyeOff className="size-4" />
                        ) : (
                            <Eye className="size-4" />
                        )}
                    </button>
                </div>
                {data.password_confirmation !== '' && (
                    <p
                        className={
                            data.password === data.password_confirmation
                                ? 'text-xs text-green-600 dark:text-green-400'
                                : 'text-xs text-destructive'
                        }
                    >
                        {data.password === data.password_confirmation
                            ? t('register.match')
                            : t('register.mismatch')}
                    </p>
                )}
            </div>

            <div
                aria-hidden="true"
                className="absolute -left-[9999px] h-px w-px overflow-hidden"
            >
                <label htmlFor="register-website">
                    {t('register.honeypot')}
                </label>
                <input
                    id="register-website"
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={data.website}
                    onChange={(e) => setData('website', e.target.value)}
                />
            </div>
            <InputError message={errors.website} />

            <p className="text-xs text-muted-foreground">
                {t('register.wizardNote')}
            </p>

            <Button
                type="submit"
                className="w-full font-semibold"
                disabled={processing}
                data-testid="register-email-submit"
            >
                {processing ? (
                    <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        {t('register.pending')}
                    </>
                ) : (
                    t('register.submit')
                )}
            </Button>
        </form>
    );
}

/**
 * New accounts are created with a Google account (verified email) and, when
 * the super admin turns it on, with email + password as well.
 */
export default function Register({
    googleEnabled,
    googleRedirectUrl,
    emailRegistrationEnabled = false,
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
                            className="auth-card relative"
                            data-testid={
                                emailRegistrationEnabled
                                    ? 'register-google-email'
                                    : 'register-google-only'
                            }
                        >
                            <div className="mb-6 flex flex-col gap-2">
                                <h2
                                    id="register-heading"
                                    className="text-3xl font-bold tracking-tight"
                                >
                                    {t('register.title')}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {t(
                                        emailRegistrationEnabled
                                            ? 'register.googleOrEmail'
                                            : 'register.googleOnly',
                                    )}
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
                                {emailRegistrationEnabled && (
                                    <>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="h-px flex-1 bg-border" />
                                            <span>
                                                {t('register.emailDivider')}
                                            </span>
                                            <span className="h-px flex-1 bg-border" />
                                        </div>
                                        <EmailRegisterForm />
                                    </>
                                )}
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
