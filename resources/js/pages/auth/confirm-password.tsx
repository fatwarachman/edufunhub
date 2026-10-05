import AuthShell from '@/components/auth-shell';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/hooks/use-translations';
import { Link, useForm } from '@inertiajs/react';
import { Loader2, Lock } from 'lucide-react';
import { type FormEventHandler } from 'react';

export default function ConfirmPassword() {
    const { t } = useTranslations();
    const { data, setData, post, processing, errors, reset } = useForm({
        password: '',
    });

    const submit: FormEventHandler = (event) => {
        event.preventDefault();
        post('/user/confirm-password', {
            onFinish: () => reset('password'),
        });
    };

    return (
        <AuthShell namespace="confirm">
            <div className="mb-6 flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight">
                    {t('confirm.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('confirm.description')}
                </p>
            </div>
            <form onSubmit={submit} noValidate>
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="password">
                            {t('confirm.password')}
                        </Label>
                        <div className="relative">
                            <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="password"
                                type="password"
                                name="password"
                                value={data.password}
                                onChange={(event) =>
                                    setData('password', event.target.value)
                                }
                                className="pl-9"
                                autoComplete="current-password"
                                autoFocus
                                required
                            />
                        </div>
                        <InputError message={errors.password} />
                    </div>
                    <Button
                        type="submit"
                        disabled={processing}
                        className="h-auto min-h-11 w-full py-2.5"
                    >
                        {processing ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                {t('confirm.confirming')}
                            </>
                        ) : (
                            t('confirm.submit')
                        )}
                    </Button>
                    <Link href="/" className="link text-center text-sm">
                        {t('confirm.back')}
                    </Link>
                </div>
            </form>
        </AuthShell>
    );
}
