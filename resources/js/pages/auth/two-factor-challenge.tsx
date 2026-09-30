import AuthShell from '@/components/auth-shell';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/hooks/use-translations';
import { Link, useForm } from '@inertiajs/react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { type FormEventHandler, useState } from 'react';

export default function TwoFactorChallenge() {
    const { t } = useTranslations();
    const [recovery, setRecovery] = useState(false);
    const { data, setData, post, processing, errors, reset } = useForm({
        code: '',
        recovery_code: '',
    });

    const submit: FormEventHandler = (event) => {
        event.preventDefault();
        post('/two-factor-challenge', {
            onFinish: () => reset('code', 'recovery_code'),
        });
    };

    return (
        <AuthShell namespace="twoFactor" backHref="/login">
            <div className="mb-6 flex flex-col gap-3">
                <span className="inline-flex size-12 items-center justify-center rounded-full border-2 border-[#151b2e] bg-[#ffd93d]">
                    <ShieldCheck className="size-6" />
                </span>
                <h2 className="text-3xl font-bold tracking-tight">
                    {t('twoFactor.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('twoFactor.description')}
                </p>
            </div>
            <form onSubmit={submit} noValidate>
                <div className="flex flex-col gap-5">
                    {recovery ? (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="recovery_code">
                                {t('twoFactor.recovery')}
                            </Label>
                            <Input
                                id="recovery_code"
                                name="recovery_code"
                                value={data.recovery_code}
                                onChange={(event) =>
                                    setData('recovery_code', event.target.value)
                                }
                                placeholder={t('twoFactor.recoveryPlaceholder')}
                                autoFocus
                            />
                            <InputError message={errors.recovery_code} />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="code">{t('twoFactor.code')}</Label>
                            <Input
                                id="code"
                                name="code"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                value={data.code}
                                onChange={(event) =>
                                    setData('code', event.target.value)
                                }
                                placeholder={t('twoFactor.codePlaceholder')}
                                autoFocus
                            />
                            <InputError message={errors.code} />
                        </div>
                    )}
                    <Button
                        type="submit"
                        disabled={processing}
                        className="h-auto min-h-11 w-full py-2.5"
                    >
                        {processing ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                {t('twoFactor.verifying')}
                            </>
                        ) : (
                            t('twoFactor.submit')
                        )}
                    </Button>
                    <button
                        type="button"
                        onClick={() => setRecovery((value) => !value)}
                        className="text-sm font-semibold underline"
                    >
                        {recovery
                            ? t('twoFactor.useCode')
                            : t('twoFactor.useRecovery')}
                    </button>
                    <Link
                        href="/login"
                        className="text-center text-sm font-semibold underline"
                    >
                        {t('twoFactor.back')}
                    </Link>
                </div>
            </form>
        </AuthShell>
    );
}
