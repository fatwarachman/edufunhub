import { useUserOnline } from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';

/**
 * Green dot pinned to the corner of an avatar while that account is
 * connected. Renders nothing for offline users, guests and seats without an
 * account. The avatar wrapper must be `relative`.
 */
export function OnlineDot({
    userId,
    className,
}: {
    userId: number | null | undefined;
    className?: string;
}) {
    const { t } = useTranslations();
    const online = useUserOnline(userId);
    if (!online) {
        return null;
    }
    return (
        <span
            role="img"
            aria-label={t('presence.online')}
            title={t('presence.online')}
            className={cn('edu-online-dot', className)}
            data-testid="online-dot"
            data-user={userId ?? undefined}
        />
    );
}
