import { useTranslations } from '@/hooks/use-translations';
import {
    installState,
    promptInstall,
    subscribeInstall,
    type InstallState,
} from '@/lib/pwa';
import { CheckCircle2, Download, Share, Smartphone } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

/** Latest Android build published by the server (see App\\Services\\AndroidApk). */
export interface AndroidApk {
    url: string;
    size: number;
    updated_at: string;
    hash: string;
}

function formatSize(bytes: number, locale: string): string {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1048576)} MB`;
}

/**
 * Dashboard card that installs EduFunHub as an app: a direct download of
 * the latest Android APK when one is published, plus the PWA install (the
 * browser install prompt where available, step-by-step help on iPhone/iPad,
 * and a short hint for other browsers).
 */
export function InstallAppCard({ apk = null }: { apk?: AndroidApk | null }) {
    const { t, i18n } = useTranslations();
    const locale = i18n.language === 'en' ? 'en-US' : 'id-ID';
    const state = useSyncExternalStore<InstallState>(
        subscribeInstall,
        installState,
        () => 'unsupported',
    );
    const [busy, setBusy] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    return (
        <section
            className="auth-card flex flex-col gap-3 !bg-[#dff3ff]"
            data-testid="install-app"
            data-state={state}
        >
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <Smartphone className="size-5" aria-hidden="true" />
                {t('pwa.title')}
            </h2>
            {state === 'installed' ? (
                <p
                    className="flex items-center gap-2 text-sm font-semibold"
                    data-testid="install-app-done"
                >
                    <CheckCircle2
                        className="size-5 shrink-0 text-[#116a56]"
                        aria-hidden="true"
                    />
                    {t('pwa.installed')}
                </p>
            ) : (
                <>
                    <p className="text-sm">
                        {t(apk ? 'pwa.apkIntro' : 'pwa.intro')}
                    </p>
                    {apk && (
                        <div className="flex flex-col gap-1.5">
                            <a
                                href={apk.url}
                                download="edufunhub.apk"
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#151b2e] bg-[#ffd93d] px-4 text-center font-bold text-[#151b2e] shadow-[2px_2px_0_#151b2e] hover:bg-[#ffe680] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]"
                                data-testid="install-app-apk"
                            >
                                <Download
                                    className="size-5 shrink-0"
                                    aria-hidden="true"
                                />
                                {t('pwa.apk')}
                            </a>
                            <p
                                className="text-center text-xs font-semibold text-[#3a4258]"
                                data-testid="install-app-apk-meta"
                            >
                                {t('pwa.apkMeta', {
                                    size: formatSize(apk.size, locale),
                                    date: new Intl.DateTimeFormat(locale, {
                                        dateStyle: 'medium',
                                    }).format(new Date(apk.updated_at)),
                                })}
                            </p>
                        </div>
                    )}
                    {apk ? null : state === 'available' ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                                setBusy(true);
                                await promptInstall();
                                setBusy(false);
                            }}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#151b2e] bg-[#151b2e] px-4 font-bold text-white shadow-[2px_2px_0_#f5a623] disabled:opacity-60"
                            data-testid="install-app-button"
                        >
                            <Download className="size-5" aria-hidden="true" />
                            {t('pwa.install')}
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowHelp((value) => !value)}
                                aria-expanded={showHelp}
                                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#151b2e] bg-[#151b2e] px-4 font-bold text-white shadow-[2px_2px_0_#f5a623]"
                                data-testid="install-app-help-toggle"
                            >
                                <Download
                                    className="size-5"
                                    aria-hidden="true"
                                />
                                {t('pwa.install')}
                            </button>
                            {showHelp && (
                                <ol
                                    className="flex list-decimal flex-col gap-1.5 rounded-xl border-2 border-[#151b2e] bg-white py-3 pr-3 pl-8 text-sm font-semibold"
                                    data-testid="install-app-help"
                                >
                                    {state === 'ios' ? (
                                        <>
                                            <li>
                                                <span className="inline-flex flex-wrap items-center gap-1">
                                                    {t('pwa.iosStep1')}
                                                    <Share
                                                        className="size-4"
                                                        aria-label={t(
                                                            'pwa.share',
                                                        )}
                                                    />
                                                </span>
                                            </li>
                                            <li>{t('pwa.iosStep2')}</li>
                                            <li>{t('pwa.iosStep3')}</li>
                                        </>
                                    ) : (
                                        <>
                                            <li>{t('pwa.otherStep1')}</li>
                                            <li>{t('pwa.otherStep2')}</li>
                                        </>
                                    )}
                                </ol>
                            )}
                        </>
                    )}
                </>
            )}
        </section>
    );
}
