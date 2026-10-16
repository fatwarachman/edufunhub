import { SimplePagination, type Paginated } from '@/components/admin/admin-kit';
import { timeAgo, UserAvatar } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    formatDateTime,
    formatNumber,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Info,
    MessageCircle,
    MessagesSquare,
    ShieldAlert,
    UsersRound,
} from 'lucide-react';
import { type ReactNode } from 'react';

type ChatType = 'direct' | 'group';

interface ChatUser {
    id: number;
    name: string;
    nickname: string | null;
    display_name: string;
    avatar_url: string | null;
}

interface Participant {
    id: number;
    user: ChatUser | null;
    role: string;
    left_at: string | null;
    joined_at: string | null;
}

interface Message {
    id: number;
    type: 'text' | 'system';
    body: string;
    sender: ChatUser | null;
    recipient: string | null;
    created_at: string | null;
}

interface Props {
    conversation: {
        id: number;
        type: ChatType;
        name: string | null;
        creator: ChatUser | null;
        messages_count: number;
        created_at: string | null;
        last_message_at: string | null;
        participants: Participant[];
    };
    messages: Paginated<Message>;
}

const BASE_URL = '/admin/chat-logs';

function dayLabel(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(adminLocale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function timeLabel(value: string | null): string {
    if (!value) return '';
    return new Date(value).toLocaleTimeString(adminLocale(), {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function ParticipantItem({ participant }: { participant: Participant }) {
    const user = participant.user;

    return (
        <li
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-muted/30 p-2.5"
            data-testid="chat-log-participant"
        >
            <UserAvatar
                name={user?.display_name ?? tr('Deleted user')}
                src={user?.avatar_url}
                userId={user?.id}
            />
            <span className="flex min-w-0 flex-1 flex-col">
                {user ? (
                    <Link
                        href={`/admin/users/${user.id}`}
                        className={cn(
                            'truncate text-sm font-medium text-foreground hover:underline',
                            participant.left_at &&
                                'text-muted-foreground line-through',
                        )}
                    >
                        {user.display_name}
                    </Link>
                ) : (
                    <span className="text-sm text-muted-foreground">
                        {tr('Deleted user')}
                    </span>
                )}
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {user && user.display_name !== user.name && (
                        <span className="truncate">{user.name}</span>
                    )}
                    {participant.role === 'owner' && (
                        <span className="font-medium text-violet-600 dark:text-violet-400">
                            {tr('Owner')}
                        </span>
                    )}
                    {participant.left_at && (
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                            {tr('Left {0}', [timeAgo(participant.left_at)])}
                        </span>
                    )}
                </span>
                {user && (
                    <Link
                        href={`${BASE_URL}?user_id=${user.id}`}
                        className="w-fit text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                    >
                        {tr('Chat log')}
                    </Link>
                )}
            </span>
        </li>
    );
}

function SystemLine({ message }: { message: Message }) {
    return (
        <li
            className="flex justify-center px-2"
            data-testid="chat-log-message"
            data-type="system"
        >
            <span className="inline-flex max-w-full items-start gap-1.5 rounded-full bg-muted px-3 py-1 text-center text-xs text-muted-foreground italic">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                <span className="break-words whitespace-pre-wrap">
                    {message.body}
                </span>
                <time
                    dateTime={message.created_at ?? undefined}
                    className="shrink-0 not-italic tabular-nums"
                >
                    {timeLabel(message.created_at)}
                </time>
            </span>
        </li>
    );
}

function Bubble({
    message,
    right,
    showArrow,
}: {
    message: Message;
    right: boolean;
    showArrow: boolean;
}) {
    const sender = message.sender;

    return (
        <li
            className={cn(
                'flex items-end gap-2',
                right ? 'flex-row-reverse' : 'flex-row',
            )}
            data-testid="chat-log-message"
            data-type="text"
        >
            <UserAvatar
                name={sender?.display_name ?? tr('Deleted user')}
                src={sender?.avatar_url}
                className="size-8"
            />
            <div
                className={cn(
                    'flex max-w-[80%] min-w-0 flex-col gap-1 sm:max-w-[70%]',
                    right ? 'items-end' : 'items-start',
                )}
            >
                <span
                    className={cn(
                        'flex max-w-full flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground',
                        right && 'justify-end',
                    )}
                >
                    {sender ? (
                        <Link
                            href={`/admin/users/${sender.id}`}
                            className="font-semibold text-foreground hover:underline"
                        >
                            {sender.display_name}
                        </Link>
                    ) : (
                        <span className="font-semibold">
                            {tr('Deleted user')}
                        </span>
                    )}
                    {showArrow && message.recipient && (
                        <span>→ {message.recipient}</span>
                    )}
                </span>
                <div
                    className={cn(
                        'max-w-full rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap shadow-sm',
                        right
                            ? 'rounded-br-md bg-primary text-primary-foreground'
                            : 'rounded-bl-md border border-border bg-card text-foreground',
                    )}
                >
                    {message.body}
                </div>
                <time
                    dateTime={message.created_at ?? undefined}
                    title={formatDateTime(message.created_at)}
                    className="text-[11px] text-muted-foreground tabular-nums"
                >
                    {timeLabel(message.created_at)}
                </time>
            </div>
        </li>
    );
}

export default function ChatLogShow({ conversation, messages }: Props) {
    const isGroup = conversation.type === 'group';
    const names = conversation.participants.map(
        (participant) => participant.user?.display_name ?? tr('Deleted user'),
    );
    const title = isGroup
        ? conversation.name || tr('Unnamed group')
        : names.join(' → ');
    const rightUserId = conversation.participants[0]?.user?.id ?? null;

    const rows: ReactNode[] = [];
    let lastDay = '';
    messages.data.forEach((message) => {
        const day = dayLabel(message.created_at);
        if (day !== lastDay) {
            lastDay = day;
            rows.push(
                <li
                    key={`day-${message.id}`}
                    className="flex items-center gap-3 py-1 text-xs font-medium text-muted-foreground"
                    role="separator"
                >
                    <span className="h-px flex-1 bg-border" />
                    {day}
                    <span className="h-px flex-1 bg-border" />
                </li>,
            );
        }
        rows.push(
            message.type === 'system' ? (
                <SystemLine key={message.id} message={message} />
            ) : (
                <Bubble
                    key={message.id}
                    message={message}
                    right={
                        rightUserId !== null &&
                        message.sender?.id === rightUserId
                    }
                    showArrow={!isGroup}
                />
            ),
        );
    });

    return (
        <>
            <Head title={`${tr('Chat logs')} · ${title}`} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <Link
                        href={BASE_URL}
                        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        {tr('Back to chat logs')}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2
                            className="font-display text-2xl font-bold break-words text-foreground"
                            data-testid="chat-log-title"
                        >
                            {title}
                        </h2>
                        <span
                            className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                isGroup
                                    ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                                    : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
                            )}
                        >
                            {isGroup ? (
                                <UsersRound
                                    className="size-3"
                                    aria-hidden="true"
                                />
                            ) : (
                                <MessageCircle
                                    className="size-3"
                                    aria-hidden="true"
                                />
                            )}
                            {isGroup ? tr('Group') : tr('Direct')}
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {tr('{0} messages · started {1} · last activity {2}', [
                            formatNumber(conversation.messages_count),
                            formatDateTime(conversation.created_at),
                            timeAgo(
                                conversation.last_message_at ??
                                    conversation.created_at,
                            ),
                        ])}
                    </p>
                    <p className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        <ShieldAlert
                            className="size-3.5 shrink-0"
                            aria-hidden="true"
                        />
                        {tr(
                            'Private conversation. Your visit is recorded in the activity log.',
                        )}
                    </p>
                </div>

                <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-foreground">
                        {tr('Participants ({0})', [
                            conversation.participants.length,
                        ])}
                    </h3>
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {conversation.participants.map((participant) => (
                            <ParticipantItem
                                key={participant.id}
                                participant={participant}
                            />
                        ))}
                    </ul>
                </section>

                <section className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/20 p-3 shadow-sm sm:p-4">
                    {messages.data.length === 0 ? (
                        <EmptyState
                            icon={MessagesSquare}
                            title={tr('No messages yet')}
                        />
                    ) : (
                        <ol
                            className="flex flex-col gap-3"
                            data-testid="chat-log-messages"
                            aria-label={tr('Messages')}
                        >
                            {rows}
                        </ol>
                    )}
                </section>

                <SimplePagination
                    links={messages.links}
                    from={messages.from}
                    to={messages.to}
                    total={messages.total}
                />
            </div>
        </>
    );
}

ChatLogShow.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Chat logs')}>{page}</AdminLayout>
);
