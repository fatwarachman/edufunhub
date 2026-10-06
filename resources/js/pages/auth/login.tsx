import { Google } from '@/components/brand-icons';
import { BrandWordmark } from '@/components/brand-wordmark';
import InputError from '@/components/input-error';
import { BackButton, NavButton } from '@/components/site-nav';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Eye, EyeOff, Gamepad2, Loader2, Lock, Mail } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';
import '../../../css/auth-landing.css';

interface LoginProps {
    adminLogin?: boolean;
    canResetPassword: boolean;
    status?: string;
    googleEnabled: boolean;
    googleRedirectUrl: string;
}

export default function Login({
    adminLogin = false,
    canResetPassword,
    status,
    googleEnabled,
    googleRedirectUrl,
}: LoginProps) {
    const { t } = useTranslations();
    const { errors: pageErrors } = usePage<SharedData>().props;
    const [showPassword, setShowPassword] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false as boolean,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(adminLogin ? '/admin/login' : '/login', {
            onFinish: () => reset('password'),
        });
    };

    return (
        <>
            <Head title={t(adminLogin ? 'login.adminTitle' : 'login.title')}>
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
                            {t('login.hero')}{' '}
                            <span>{t('login.heroAccent')}</span>
                        </h1>
                        <p>{t('login.description')}</p>
                        <div className="auth-shapes" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </div>
                    </section>
                    <section
                        className="min-w-0"
                        aria-labelledby="login-heading"
                    >
                        {/* Status message */}
                        {status && (
                            <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                {status}
                            </div>
                        )}

                        {/* Card */}
                        <div className="auth-card">
                            <div className="mb-6 flex flex-col gap-2">
                                <h2
                                    id="login-heading"
                                    className="text-3xl font-bold tracking-tight"
                                >
                                    {t(
                                        adminLogin
                                            ? 'login.adminTitle'
                                            : 'login.title',
                                    )}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {t('login.subtitle')}
                                </p>
                            </div>
                            {!adminLogin && (
                                <div className="mb-6 flex flex-col gap-3">
                                    {googleEnabled ? (
                                        <Button
                                            variant="outline"
                                            asChild
                                            className="auth-google h-auto min-h-11 w-full py-2.5 text-center whitespace-normal"
                                        >
                                            <a href={googleRedirectUrl}>
                                                <Google className="size-4 shrink-0" />
                                                {t('login.google')}
                                            </a>
                                        </Button>
                                    ) : (
                                        <>
                                            <Button
                                                variant="outline"
                                                disabled
                                                className="auth-google h-auto min-h-11 w-full py-2.5 text-center whitespace-normal"
                                                aria-describedby="google-unavailable"
                                            >
                                                <Google className="size-4 shrink-0" />
                                                {t('login.google')}
                                            </Button>
                                            <p
                                                id="google-unavailable"
                                                className="text-center text-xs text-muted-foreground"
                                            >
                                                {t('login.unavailable')}
                                            </p>
                                        </>
                                    )}
                                    {pageErrors.google && (
                                        <div role="alert">
                                            <InputError
                                                message={pageErrors.google}
                                            />
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span className="h-px flex-1 bg-border" />
                                        <span>{t('login.alternative')}</span>
                                        <span className="h-px flex-1 bg-border" />
                                    </div>
                                </div>
                            )}
                            <form onSubmit={submit} noValidate>
                                <div className="flex flex-col gap-5">
                                    {/* Email */}
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="email">
                                            {t('login.email')}
                                        </Label>
                                        <div className="relative">
                                            <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                id="email"
                                                type="email"
                                                name="email"
                                                value={data.email}
                                                onChange={(e) =>
                                                    setData(
                                                        'email',
                                                        e.target.value,
                                                    )
                                                }
                                                className="pl-9"
                                                placeholder={t(
                                                    'login.emailPlaceholder',
                                                )}
                                                autoComplete="email"
                                                autoFocus
                                                required
                                            />
                                        </div>
                                        <InputError message={errors.email} />
                                    </div>

                                    {/* Password */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="password">
                                                {t('login.password')}
                                            </Label>
                                            {canResetPassword && (
                                                <TextLink
                                                    href="/forgot-password"
                                                    className="text-xs"
                                                >
                                                    {t('login.forgot')}
                                                </TextLink>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                id="password"
                                                type={
                                                    showPassword
                                                        ? 'text'
                                                        : 'password'
                                                }
                                                name="password"
                                                value={data.password}
                                                onChange={(e) =>
                                                    setData(
                                                        'password',
                                                        e.target.value,
                                                    )
                                                }
                                                className="pr-10 pl-9"
                                                placeholder="••••••••"
                                                autoComplete="current-password"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowPassword((s) => !s)
                                                }
                                                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none"
                                                aria-label={
                                                    showPassword
                                                        ? t('login.hide')
                                                        : t('login.show')
                                                }
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="size-4" />
                                                ) : (
                                                    <Eye className="size-4" />
                                                )}
                                            </button>
                                        </div>
                                        <InputError message={errors.password} />
                                    </div>

                                    {/* Remember me */}
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="remember"
                                            checked={data.remember}
                                            onCheckedChange={(checked) =>
                                                setData(
                                                    'remember',
                                                    Boolean(checked),
                                                )
                                            }
                                        />
                                        <Label
                                            htmlFor="remember"
                                            className="cursor-pointer text-sm font-normal"
                                        >
                                            {t('login.remember')}
                                        </Label>
                                    </div>

                                    {/* Submit */}
                                    <Button
                                        type="submit"
                                        className="w-full font-semibold"
                                        disabled={processing}
                                    >
                                        {processing ? (
                                            <>
                                                <Loader2 className="mr-2 size-4 animate-spin" />
                                                {t('login.pending')}
                                            </>
                                        ) : (
                                            t('login.submit')
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>

                        {/* Register link */}
                        {!adminLogin && (
                            <p className="mt-6 text-center text-sm text-muted-foreground">
                                {t('login.newAccount')}{' '}
                                <TextLink href="/register">
                                    {t('login.register')}
                                </TextLink>
                            </p>
                        )}
                    </section>
                </main>
            </div>
        </>
    );
}
