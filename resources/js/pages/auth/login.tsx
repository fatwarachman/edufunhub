import InputError from '@/components/input-error';
import SocialLoginButtons from '@/components/social-login-buttons';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useTranslations } from '@/hooks/use-translations';
import AuthLayout from '@/layouts/auth-layout';
import { register } from '@/routes';
import { store } from '@/routes/login';
import { request } from '@/routes/password';
import { Form, Head, Link } from '@inertiajs/react';

interface LoginProps {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
    email?: string;
    redirect?: string;
}

export default function Login({
    status,
    canResetPassword,
    canRegister,
    email,
    redirect,
}: LoginProps) {
    const { t } = useTranslations();

    // Build register URL with email and redirect params if present
    const registerUrl = () => {
        const baseUrl = register();
        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (redirect) params.set('redirect', redirect);
        return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    };

    return (
        <AuthLayout
            title={t('auth.login.title', 'Welcome back, Pejuang Ilmu! 🎮')}
            description={t(
                'auth.login.description',
                'Masuk untuk lanjutkan petualangan belajarmu',
            )}
        >
            <Head title={t('auth.login.page_title', 'Log in')} />

            <Form
                {...store.form()}
                resetOnSuccess={['password']}
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="email">
                                    {t('auth.email', 'Email address')}
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoFocus={!email}
                                    tabIndex={1}
                                    autoComplete="email"
                                    placeholder={t(
                                        'auth.email_placeholder',
                                        'email@example.com',
                                    )}
                                    defaultValue={email}
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">
                                        {t('auth.password', 'Password')}
                                    </Label>
                                    {canResetPassword && (
                                        <TextLink
                                            href={request()}
                                            className="ml-auto text-sm font-semibold"
                                            tabIndex={5}
                                        >
                                            {t(
                                                'auth.forgot_password',
                                                'Forgot password?',
                                            )}
                                        </TextLink>
                                    )}
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    name="password"
                                    required
                                    tabIndex={2}
                                    autoComplete="current-password"
                                    placeholder={t('auth.password', 'Password')}
                                    autoFocus={!!email}
                                />
                                <InputError message={errors.password} />
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="remember"
                                    name="remember"
                                    tabIndex={3}
                                />
                                <Label
                                    htmlFor="remember"
                                    className="cursor-pointer text-sm font-normal"
                                >
                                    {t('auth.remember_me', 'Remember me')}
                                </Label>
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                size="lg"
                                tabIndex={4}
                                disabled={processing}
                                data-test="login-button"
                            >
                                {processing && <Spinner />}
                                {t('auth.login.button', 'Sign in')}
                            </Button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">
                                        Or
                                    </span>
                                </div>
                            </div>

                            <Link href="/magic-login" className="w-full">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    size="lg"
                                >
                                    Sign in with Magic Link
                                </Button>
                            </Link>
                        </div>

                        {canRegister && (
                            <div className="text-center text-sm text-muted-foreground">
                                {t('auth.no_account', "Don't have an account?")}{' '}
                                <TextLink
                                    href={registerUrl()}
                                    tabIndex={5}
                                    className="font-semibold"
                                >
                                    {t('auth.sign_up', 'Sign up')}
                                </TextLink>
                            </div>
                        )}
                        <div className="mt-2 space-y-3 border-t pt-4">
                            <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                                Developer Quick Login
                            </span>
                            <div className="grid grid-cols-1 gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-9 bg-bubble-orange/15 px-2 text-xs text-bubble-orange hover:bg-bubble-orange/25 dark:bg-bubble-orange/20 dark:text-orange-300 dark:hover:bg-bubble-orange/30"
                                    onClick={() => {
                                        const e = document.getElementById(
                                            'email',
                                        ) as HTMLInputElement;
                                        const p = document.getElementById(
                                            'password',
                                        ) as HTMLInputElement;
                                        if (e && p) {
                                            e.value = 'superadmin@example.com';
                                            p.value = 'password';
                                            e.form?.requestSubmit();
                                        }
                                    }}
                                >
                                    Super Admin
                                </Button>
                            </div>
                        </div>

                        <SocialLoginButtons />
                    </>
                )}
            </Form>

            {status && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {status}
                </div>
            )}
        </AuthLayout>
    );
}
