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
