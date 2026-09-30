import AuthShell from '@/components/auth-shell';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/hooks/use-translations';
import { Link, useForm } from '@inertiajs/react';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

interface ResetPasswordProps {
    email: string;
    token: string;
}

export default function ResetPassword({ email, token }: ResetPasswordProps) {
    const { t } = useTranslations();
    const [visible, setVisible] = useState(false);
    const { data, setData, post, processing, errors, reset } = useForm({
        email,
        password: '',
        password_confirmation: '',
        token,
    });

    const submit: FormEventHandler = (event) => {
        event.preventDefault();
        post('/reset-password', {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <AuthShell namespace="reset" backHref="/login">
            <div className="mb-6 flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight">
                    {t('reset.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('reset.description')}
                </p>
            </div>
            <form onSubmit={submit} noValidate>
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="email">{t('reset.email')}</Label>
                        <div className="relative">
                            <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="email"
                                type="email"
                                name="email"
                                value={data.email}
                                onChange={(event) =>
                                    setData('email', event.target.value)
                                }
                                className="pl-9"
                                autoComplete="email"
                                required
                            />
                        </div>
                        <InputError message={errors.email} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="password">{t('reset.password')}</Label>
                        <div className="relative">
                            <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="password"
                                type={visible ? 'text' : 'password'}
                                name="password"
                                value={data.password}
                                onChange={(event) =>
                                    setData('password', event.target.value)
                                }
                                className="pr-10 pl-9"
                                autoComplete="new-password"
                                autoFocus
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setVisible((value) => !value)}
                                aria-label={
                                    visible ? t('reset.hide') : t('reset.show')
                                }
                                className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5"
                            >
                                {visible ? (
                                    <EyeOff className="size-4" />
                                ) : (
                                    <Eye className="size-4" />
                                )}
                            </button>
                        </div>
                        <InputError message={errors.password} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="password_confirmation">
                            {t('reset.confirm')}
                        </Label>
                        <div className="relative">
                            <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="password_confirmation"
                                type={visible ? 'text' : 'password'}
                                name="password_confirmation"
                                value={data.password_confirmation}
                                onChange={(event) =>
                                    setData(
                                        'password_confirmation',
                                        event.target.value,
                                    )
                                }
                                className="pl-9"
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        <InputError message={errors.password_confirmation} />
                    </div>
                    <Button
                        type="submit"
                        disabled={processing}
                        className="h-auto min-h-11 w-full py-2.5"
                    >
                        {processing ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                {t('reset.saving')}
                            </>
                        ) : (
                            t('reset.submit')
                        )}
                    </Button>
                    <Link
                        href="/login"
                        className="text-center text-sm font-semibold underline"
                    >
                        {t('reset.back')}
                    </Link>
                </div>
            </form>
        </AuthShell>
    );
}
