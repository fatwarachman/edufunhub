import { shareWhatsApp } from '@/lib/share';
import { cn } from '@/lib/utils';

/** Official WhatsApp glyph (lucide has no brand icons). */
export function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
            aria-hidden="true"
        >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.533 5.854L0 24l6.335-1.51C8.01 23.45 9.97 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.885 0-3.652-.507-5.178-1.393l-.371-.22-3.762.896.956-3.666-.242-.378C2.618 15.447 2.182 13.777 2.182 12 2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z" />
        </svg>
    );
}

/**
 * Small WhatsApp share button. `compact` renders an icon-only square
 * (for game cards/rows); the default shows the label from sm up.
 */
export function WhatsAppShareButton({
    text,
    label,
    testId,
    compact = false,
    className,
}: {
    /** Pre-built share text (from the locale catalog). */
    text: string;
    /** Accessible label + tooltip, already translated. */
    label: string;
    testId?: string;
    compact?: boolean;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                shareWhatsApp(text);
            }}
            data-testid={testId}
            aria-label={label}
            title={label}
            className={cn(
                'inline-flex items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-[#25D366] font-black text-white shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#1ebe57] focus-visible:ring-3 focus-visible:ring-[#6c5ce7] focus-visible:outline-none',
                compact
                    ? 'size-11 shrink-0'
                    : 'min-h-11 min-w-0 gap-1.5 px-2.5 text-sm whitespace-nowrap sm:px-3',
                className,
            )}
        >
            <WhatsAppIcon className="size-4 shrink-0" />
            {!compact && <span className="hidden sm:inline">{label}</span>}
        </button>
    );
}
