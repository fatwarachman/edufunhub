import InputError from '@/components/input-error';
import { BackButton, NavButton } from '@/components/site-nav';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/hooks/use-translations';
import { Head, useForm } from '@inertiajs/react';
import { Eye, EyeOff, Gamepad2, Loader2, Lock, Mail, User } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';
import '../../../css/auth-landing.css';

function PasswordStrength({ password }: { password: string }) {
    const { t } = useTranslations();
    const checks = [
        { label: t('register.length'), pass: password.length >= 8 },
        { label: t('register.uppercase'), pass: /[A-Z]/.test(password) },
        { label: t('register.lowercase'), pass: /[a-z]/.test(password) },
        { label: t('register.number'), pass: /[0-9]/.test(password) },
        { label: t('register.symbol'), pass: /[^A-Za-z0-9]/.test(password) },
    ];

    const score = checks.filter((c) => c.pass).length;

    const strengthLabel =
        score === 0
            ? ''
            : score <= 2
              ? t('register.weak')
              : score <= 3
                ? t('register.fair')
                : score === 4
                  ? t('register.good')
                  : t('register.strong');

    const strengthColor =
        score === 0
            ? 'bg-muted'
            : score <= 2
              ? 'bg-red-500'
              : score <= 3
                ? 'bg-yellow-500'
                : score === 4
                  ? 'bg-blue-500'
                  : 'bg-green-500';

    if (!password) return null;

    return (
        <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                                i <= score ? strengthColor : 'bg-muted'
                            }`}
                        />
                    ))}
                </div>
                {strengthLabel && (
                    <span className="text-xs text-muted-foreground">
                        {strengthLabel}
                    </span>
                )}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                {checks.map((check) => (
                    <li
                        key={check.label}
                        className={`flex items-center gap-1.5 text-xs ${
                            check.pass
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-muted-foreground'
                        }`}
                    >
                        <span
                            className={`size-1.5 rounded-full ${check.pass ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                        />
                        {check.label}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function Register() {
    const { t } = useTranslations();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post('/register', {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

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
                    <a href="/" className="auth-brand" aria-label="EduFunHub">
                        <span className="auth-brand-mark">
                            <Gamepad2 className="size-6" />
                        </span>
                        <span>
                            EduFun<span>Hub</span>
                        </span>
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
                        <div className="auth-card">
                            <div className="mb-6 flex flex-col gap-2">
                                <h2
                                    id="register-heading"
                                    className="text-3xl font-bold tracking-tight"
                                >
                                    {t('register.title')}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {t('register.subtitle')}
                                </p>
                            </div>
                            <form onSubmit={submit} noValidate>
                                <div className="flex flex-col gap-5">
                                    {/* Name */}
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="name">
                                            {t('register.name')}
                                        </Label>
                                        <div className="relative">
                                            <User className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                id="name"
                                                type="text"
                                                name="name"
                                                value={data.name}
                                                onChange={(e) =>
                                                    setData(
                                                        'name',
                                                        e.target.value,
                                                    )
                                                }
                                                className="pl-9"
                                                placeholder={t(
                                                    'register.namePlaceholder',
                                                )}
                                                autoComplete="name"
                                                autoFocus
                                                required
                                            />
                                        </div>
                                        <InputError message={errors.name} />
                                    </div>

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
                                                required
                                            />
                                        </div>
                                        <InputError message={errors.email} />
                                    </div>

                                    {/* Password */}
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="password">
                                            {t('login.password')}
                                        </Label>
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
                                                autoComplete="new-password"
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
                                        <InputError message={errors.password} />
                                        <PasswordStrength
                                            password={data.password}
                                        />
                                    </div>

                                    {/* Password confirmation */}
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="password_confirmation">
                                            {t('register.confirm')}
                                        </Label>
                                        <div className="relative">
                                            <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                id="password_confirmation"
                                                type={
                                                    showConfirm
                                                        ? 'text'
                                                        : 'password'
                                                }
                                                name="password_confirmation"
                                                value={
                                                    data.password_confirmation
                                                }
                                                onChange={(e) =>
                                                    setData(
                                                        'password_confirmation',
                                                        e.target.value,
                                                    )
                                                }
                                                className="pr-10 pl-9"
                                                placeholder="••••••••"
                                                autoComplete="new-password"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowConfirm((s) => !s)
                                                }
                                                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none"
                                                aria-label={
                                                    showConfirm
                                                        ? t(
                                                              'register.hideConfirm',
                                                          )
                                                        : t(
                                                              'register.showConfirm',
                                                          )
                                                }
                                            >
                                                {showConfirm ? (
                                                    <EyeOff className="size-4" />
                                                ) : (
                                                    <Eye className="size-4" />
                                                )}
                                            </button>
                                        </div>
                                        <InputError
                                            message={
                                                errors.password_confirmation
                                            }
                                        />
                                        {data.password &&
                                            data.password_confirmation && (
                                                <p
                                                    className={`text-xs ${
                                                        data.password ===
                                                        data.password_confirmation
                                                            ? 'text-green-600 dark:text-green-400'
                                                            : 'text-red-500'
                                                    }`}
                                                >
                                                    {data.password ===
                                                    data.password_confirmation
                                                        ? t('register.match')
                                                        : t(
                                                              'register.mismatch',
                                                          )}
                                                </p>
                                            )}
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
                                                {t('register.pending')}
                                            </>
                                        ) : (
                                            t('register.title')
                                        )}
                                    </Button>

                                    <p className="text-center text-xs text-muted-foreground">
                                        {t('register.agreement')}{' '}
                                        <TextLink
                                            href="/terms"
                                            className="text-xs"
                                        >
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
                            </form>
                        </div>

                        {/* Login link */}
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
