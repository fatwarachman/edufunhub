import AppLogoIcon from '@/components/app-logo-icon';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type SharedData } from '@/types';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

interface LoginProps {
    canResetPassword: boolean;
    status?: string;
}

export default function Login({ canResetPassword, status }: LoginProps) {
    const { name } = usePage<SharedData>().props;
    const [showPassword, setShowPassword] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false as boolean,
    });

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post('/login', {
            onFinish: () => reset('password'),
        });
    };

    return (
        <>
            <Head title="Log in" />

            <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
                {/* Background decoration */}
                <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
                    <div className="absolute -left-20 -top-20 size-72 rounded-full bg-bubble-yellow opacity-20 blur-3xl" />
                    <div className="absolute -bottom-20 -right-20 size-72 rounded-full bg-bubble-orange opacity-20 blur-3xl" />
                    <div className="absolute left-1/2 top-1/2 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bubble-purple opacity-10 blur-3xl" />
                </div>

                <div className="relative w-full max-w-sm">
                    {/* Logo */}
                    <div className="mb-8 flex flex-col items-center gap-3">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
                            <AppLogoIcon className="size-8 fill-white" />
                        </div>
                        <div className="text-center">
                            <h1 className="font-display text-2xl font-bold text-foreground">
                                {name || 'EduFunHub'}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Sign in to your account
                            </p>
                        </div>
                    </div>

                    {/* Status message */}
                    {status && (
                        <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                            {status}
                        </div>
                    )}

                    {/* Card */}
                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <form onSubmit={submit} noValidate>
                            <div className="flex flex-col gap-5">
                                {/* Email */}
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="email">Email address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="email"
                                            type="email"
                                            name="email"
                                            value={data.email}
                                            onChange={(e) => setData('email', e.target.value)}
                                            className="pl-9"
                                            placeholder="you@example.com"
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
                                        <Label htmlFor="password">Password</Label>
                                        {canResetPassword && (
                                            <TextLink
                                                href="/forgot-password"
                                                className="text-xs"
                                            >
                                                Forgot password?
                                            </TextLink>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={data.password}
                                            onChange={(e) => setData('password', e.target.value)}
                                            className="pl-9 pr-10"
                                            placeholder="••••••••"
                                            autoComplete="current-password"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((s) => !s)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none"
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                                            setData('remember', Boolean(checked))
                                        }
                                    />
                                    <Label
                                        htmlFor="remember"
                                        className="cursor-pointer text-sm font-normal"
                                    >
                                        Remember me for 30 days
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
                                            Signing in…
                                        </>
                                    ) : (
                                        'Sign in'
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>

                    {/* Register link */}
                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Don't have an account?{' '}
                        <TextLink href="/register">Create one free</TextLink>
                    </p>
                </div>
            </div>
        </>
    );
}
