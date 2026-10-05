import AuthShell from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/hooks/use-translations';
import { Link, router } from '@inertiajs/react';
import { Loader2, MailCheck } from 'lucide-react';
import { useState } from 'react';

interface VerifyEmailProps {
    status?: string;
}

export default function VerifyEmail({ status }: VerifyEmailProps) {
    const { t } = useTranslations();
    const [sending, setSending] = useState(false);

    const resend = () => {
        setSending(true);
        router.post(
            '/email/verification-notification',
            {},
            { onFinish: () => setSending(false) },
        );
    };

    return (
        <AuthShell namespace="verify">
            <div className="mb-6 flex flex-col gap-3">
                <span className="inline-flex size-12 items-center justify-center rounded-full border-2 border-[#151b2e] bg-[#ffd93d]">
                    <MailCheck className="size-6" />
                </span>
                <h2
                    id="verify-heading"
                    className="text-3xl font-bold tracking-tight"
                >
                    {t('verify.title')}
                </h2>
                {(status ?? t('verify.notice')) && (
                    <p className="text-sm text-muted-foreground">
                        {status ?? t('verify.notice')}
                    </p>
                )}
            </div>
            <div className="flex flex-col gap-3">
                <Button
                    type="button"
                    onClick={resend}
                    disabled={sending}
                    className="h-auto min-h-11 w-full py-2.5"
                >
                    {sending ? (
                        <>
                            <Loader2 className="size-4 animate-spin" />
                            {t('verify.sending')}
                        </>
                    ) : (
                        t('verify.resend')
                    )}
                </Button>
                <Link
                    href="/logout"
                    method="post"
                    as="button"
                    type="button"
                    className="link text-sm"
                >
                    {t('verify.logout')}
                </Link>
            </div>
        </AuthShell>
    );
}
