import AppLogoIcon from '@/components/app-logo-icon';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type SharedData } from '@/types';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

function PasswordStrength({ password }: { password: string }) {
    const checks = [
        { label: 'At least 8 characters', pass: password.length >= 8 },
        { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
        { label: 'Lowercase letter', pass: /[a-z]/.test(password) },
        { label: 'Number', pass: /[0-9]/.test(password) },
        { label: 'Special character', pass: /[^A-Za-z0-9]/.test(password) },
    ];

    const score = checks.filter((c) => c.pass).length;

    const strengthLabel =
        score === 0 ? '' : score <= 2 ? 'Weak' : score <= 3 ? 'Fair' : score === 4 ? 'Good' : 'Strong';

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
                    <span className="text-xs text-muted-foreground">{strengthLabel}</span>
                )}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                {checks.map((check) => (
                    <li
                        key={check.label}
                        className={`flex items-center gap-1.5 text-xs ${
                            check.pass ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
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
    const { name } = usePage<SharedData>().props;
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
            <Head title="Create account" />

            <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
                {/* Background decoration */}
                <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
                    <div className="absolute -left-20 top-10 size-72 rounded-full bg-bubble-green opacity-20 blur-3xl" />
                    <div className="absolute -right-20 bottom-10 size-72 rounded-full bg-bubble-pink opacity-20 blur-3xl" />
                    <div className="absolute left-1/2 top-1/3 size-96 -translate-x-1/2 rounded-full bg-bubble-blue opacity-10 blur-3xl" />
                </div>

                <div className="relative w-full max-w-sm">
                    {/* Logo */}
                    <div className="mb-8 flex flex-col items-center gap-3">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
                            <AppLogoIcon className="size-8 fill-white" />
                        </div>
                        <div className="text-center">
                            <h1 className="font-display text-2xl font-bold text-foreground">
                                Join {name || 'EduFunHub'}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Create your free account
                            </p>
                        </div>
                    </div>

                    {/* Card */}
                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <form onSubmit={submit} noValidate>
                            <div className="flex flex-col gap-5">
                                {/* Name */}
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="name">Full name</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="name"
                                            type="text"
                                            name="name"
                                            value={data.name}
                                            onChange={(e) => setData('name', e.target.value)}
                                            className="pl-9"
                                            placeholder="Jane Smith"
                                            autoComplete="name"
                                            autoFocus
                                            required
                                        />
                                    </div>
                                    <InputError message={errors.name} />
                                </div>

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
                                            required
                                        />
                                    </div>
                                    <InputError message={errors.email} />
                                </div>

                                {/* Password */}
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="password">Password</Label>
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
                                            autoComplete="new-password"
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
                                    <PasswordStrength password={data.password} />
                                </div>

                                {/* Password confirmation */}
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="password_confirmation">Confirm password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="password_confirmation"
                                            type={showConfirm ? 'text' : 'password'}
                                            name="password_confirmation"
                                            value={data.password_confirmation}
                                            onChange={(e) =>
                                                setData('password_confirmation', e.target.value)
                                            }
                                            className="pl-9 pr-10"
                                            placeholder="••••••••"
                                            autoComplete="new-password"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirm((s) => !s)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none"
                                            aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                                        >
                                            {showConfirm ? (
                                                <EyeOff className="size-4" />
                                            ) : (
                                                <Eye className="size-4" />
                                            )}
                                        </button>
                                    </div>
                                    <InputError message={errors.password_confirmation} />
                                    {data.password && data.password_confirmation && (
                                        <p
                                            className={`text-xs ${
                                                data.password === data.password_confirmation
                                                    ? 'text-green-600 dark:text-green-400'
                                                    : 'text-red-500'
                                            }`}
                                        >
                                            {data.password === data.password_confirmation
                                                ? '✓ Passwords match'
                                                : '✗ Passwords do not match'}
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
                                            Creating account…
                                        </>
                                    ) : (
                                        'Create account'
                                    )}
                                </Button>

                                <p className="text-center text-xs text-muted-foreground">
                                    By signing up, you agree to our{' '}
                                    <TextLink href="/terms" className="text-xs">
                                        Terms of Service
                                    </TextLink>{' '}
                                    and{' '}
                                    <TextLink href="/privacy" className="text-xs">
                                        Privacy Policy
                                    </TextLink>
                                    .
                                </p>
                            </div>
                        </form>
                    </div>

                    {/* Login link */}
                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <TextLink href="/login">Sign in</TextLink>
                    </p>
                </div>
            </div>
        </>
    );
}
