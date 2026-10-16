/**
 * WhatsApp share helpers. Message copy lives in the locale catalogs
 * (player.shareWaRoomText / player.shareWaGameText); callers build the
 * text with t() and hand it here.
 */

/**
 * Opens WhatsApp with the given text pre-filled, in a new tab. Uses the
 * api.whatsapp.com endpoint directly: the wa.me redirect can mangle emoji
 * into "�" on WhatsApp Web/Desktop.
 */
export function shareWhatsApp(text: string): void {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
}

/** Absolute URL for a path on the current origin (share links must be absolute). */
export function absoluteUrl(path: string): string {
    if (/^https?:\/\//.test(path)) {
        return path;
    }
    return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function shareText(title: string, text: string): Promise<boolean> {
    if (navigator.share) {
        try {
            await navigator.share({ title, text });
            return true;
        } catch {
            // User cancelled or native sharing failed; try clipboard.
        }
    }

    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/** Social networks the shared {@link ShareMenu} can post to. */
export type ShareNetwork = 'whatsapp' | 'facebook' | 'x' | 'telegram';

/**
 * Share-intent URL for a network. `text` is the translated message and
 * `url` an absolute link; Facebook only accepts the link (it reads the
 * page preview), the others pre-fill text + link.
 */
export function shareNetworkUrl(
    network: ShareNetwork,
    text: string,
    url: string,
): string {
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);
    switch (network) {
        case 'whatsapp':
            return `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${url}`)}`;
        case 'facebook':
            return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        case 'x':
            return `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
        case 'telegram':
            return `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
    }
}

/** Opens a network's share intent in a new tab. */
export function shareToNetwork(
    network: ShareNetwork,
    text: string,
    url: string,
): void {
    window.open(
        shareNetworkUrl(network, text, url),
        '_blank',
        'noopener,noreferrer',
    );
}

/** Whether the browser offers the native share sheet (Web Share API). */
export function canNativeShare(): boolean {
    return (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function'
    );
}

/** Copies text to the clipboard; false when the browser refuses. */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
