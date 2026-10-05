import AuthShell from '@/components/auth-shell';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/hooks/use-translations';
import { Link, useForm } from '@inertiajs/react';
import { Loader2, Mail } from 'lucide-react';
import { type FormEventHandler } from 'react';

interface ForgotPasswordProps {
    status?: string;
}

export default function ForgotPassword({ status }: ForgotPasswordProps) {
    const { t } = useTranslations();
    const { data, setData, post, processing, errors } = useForm({
        email: '',
    });

    const submit: FormEventHandler = (event) => {
        event.preventDefault();
        post('/forgot-password');
    };

    return (
        <AuthShell namespace="forgot" backHref="/login">
            <div className="mb-6 flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight">
                    {t('forgot.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('forgot.description')}
                </p>
            </div>
            {status && (
                <div
                    role="status"
                    className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400"
                >
                    {status}
                </div>
            )}
            <form onSubmit={submit} noValidate>
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="email">{t('forgot.email')}</Label>
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
                                placeholder={t('forgot.emailPlaceholder')}
                                autoComplete="email"
                                autoFocus
                                required
                            />
                        </div>
                        <InputError message={errors.email} />
                    </div>
                    <Button
                        type="submit"
                        disabled={processing}
                        className="h-auto min-h-11 w-full py-2.5"
                    >
                        {processing ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                {t('forgot.sending')}
                            </>
                        ) : (
                            t('forgot.submit')
                        )}
                    </Button>
                    <Link href="/login" className="link text-center text-sm">
                        {t('forgot.back')}
                    </Link>
                </div>
            </form>
        </AuthShell>
    );
}
