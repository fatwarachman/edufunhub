import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { WhatsAppIcon } from '@/components/whatsapp-share-button';
import { useTranslations } from '@/hooks/use-translations';
import {
    absoluteUrl,
    canNativeShare,
    copyToClipboard,
    type ShareNetwork,
    shareToNetwork,
} from '@/lib/share';
import { cn } from '@/lib/utils';
import { Check, Link2, Send, Share2 } from 'lucide-react';
import { type ComponentType, useEffect, useState } from 'react';

const INK = 'border-[#151b2e]';

/** Facebook "f" glyph (lucide has no brand icons). */
function FacebookIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.931-1.956 1.886v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
        </svg>
    );
}

/** X (Twitter) glyph. */
function XIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.933zm-1.291 19.49h2.039L6.486 3.24H4.298l13.312 17.403z" />
        </svg>
    );
}

const NETWORKS: {
    key: ShareNetwork;
    icon: ComponentType<{ className?: string }>;
    tone: string;
}[] = [
    { key: 'whatsapp', icon: WhatsAppIcon, tone: 'bg-[#25D366] text-white' },
    { key: 'facebook', icon: FacebookIcon, tone: 'bg-[#1877F2] text-white' },
    { key: 'x', icon: XIcon, tone: 'bg-black text-white' },
    { key: 'telegram', icon: Send, tone: 'bg-[#229ED9] text-white' },
];

/**
 * Share button with a popover menu: native share sheet (when the browser
 * has one), WhatsApp, Facebook, X, Telegram and copy link. Copy comes from
 * the `shareMenu.*` catalog keys; callers pass the translated message.
 * Radix Popover handles focus, Esc and outside-click closing.
 */
export function ShareMenu({
    title,
    text,
    url,
    label,
    testId,
    className,
}: {
    /** Title for the native share sheet, already translated. */
    title: string;
    /** Share message, already translated. */
    text: string;
    /** Link to share; relative paths resolve against the current origin. */
    url: string;
    /** Trigger label, already translated. */
    label: string;
    /** Base data-testid; items use `${testId}-<option>`. */
    testId: string;
    className?: string;
}) {
    const { t } = useTranslations();
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    /** Content only mounts after a click, so this never runs during SSR. */
    const nativeAvailable = open && canNativeShare();

    useEffect(() => {
        if (!copied) {
            return;
        }
        const timer = window.setTimeout(() => setCopied(false), 2000);
        return () => window.clearTimeout(timer);
    }, [copied]);

    const link = () => absoluteUrl(url);
    const item =
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm font-bold text-[#151b2e] transition-colors hover:bg-[#fff0cf] focus-visible:bg-[#fff0cf] focus-visible:outline-none';
    const badge = `grid size-8 shrink-0 place-items-center rounded-lg border-2 ${INK}`;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        `inline-flex min-h-11 items-center gap-2 rounded-full border-2 ${INK} bg-white px-3 text-sm font-bold text-[#151b2e] shadow-[2px_2px_0_#151b2e] transition-colors hover:bg-[#fff0cf] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]`,
                        className,
                    )}
                    aria-haspopup="menu"
                    data-testid={testId}
                >
                    <Share2 className="size-4" aria-hidden />
                    {label}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className={`w-[min(16rem,calc(100vw-2rem))] rounded-2xl border-[3px] ${INK} bg-white p-2 text-[#151b2e] shadow-[4px_4px_0_#151b2e]`}
                data-testid={`${testId}-menu`}
            >
                <ul
                    role="menu"
                    aria-label={t('shareMenu.label')}
                    className="flex flex-col gap-0.5"
                >
                    {nativeAvailable && (
                        <li role="none">
                            <button
                                type="button"
                                role="menuitem"
                                className={item}
                                data-testid={`${testId}-native`}
                                onClick={async () => {
                                    try {
                                        await navigator.share({
                                            title,
                                            text,
                                            url: link(),
                                        });
                                        setOpen(false);
                                    } catch {
                                        // Cancelled: keep the menu open for another option.
                                    }
                                }}
                            >
                                <span className={`${badge} bg-[#ffd93d]`}>
                                    <Share2 className="size-4" aria-hidden />
                                </span>
                                {t('shareMenu.native')}
                            </button>
                        </li>
                    )}
                    {NETWORKS.map(({ key, icon: Icon, tone }) => (
                        <li role="none" key={key}>
                            <button
                                type="button"
                                role="menuitem"
                                className={item}
                                data-testid={`${testId}-${key}`}
                                onClick={() => {
                                    shareToNetwork(key, text, link());
                                    setOpen(false);
                                }}
                            >
                                <span className={`${badge} ${tone}`}>
                                    <Icon className="size-4" />
                                </span>
                                {t(`shareMenu.${key}`)}
                            </button>
                        </li>
                    ))}
                    <li role="none">
                        <button
                            type="button"
                            role="menuitem"
                            className={item}
                            data-testid={`${testId}-copy`}
                            onClick={async () => {
                                if (await copyToClipboard(link())) {
                                    setCopied(true);
                                }
                            }}
                        >
                            <span className={`${badge} bg-white`}>
                                {copied ? (
                                    <Check className="size-4" aria-hidden />
                                ) : (
                                    <Link2 className="size-4" aria-hidden />
                                )}
                            </span>
                            <span aria-live="polite">
                                {copied
                                    ? t('shareMenu.copied')
                                    : t('shareMenu.copyLink')}
                            </span>
                        </button>
                    </li>
                </ul>
            </PopoverContent>
        </Popover>
    );
}
