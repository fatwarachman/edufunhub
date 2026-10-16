import { SimplePagination, type Paginated } from '@/components/admin/admin-kit';
import { KpiCard, timeAgo, UserAvatar } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    fieldClass,
    formatDateTime,
    formatNumber,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowRight,
    ChevronDown,
    ChevronsUpDown,
    MessageCircle,
    MessagesSquare,
    RotateCcw,
    Search,
    UserRound,
    UsersRound,
    X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

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

interface ConversationRow {
    id: number;
    type: ChatType;
    name: string | null;
    participants: Participant[];
    messages_count: number;
    last_message: {
        body: string;
        type: 'text' | 'system';
        sender: string | null;
        created_at: string | null;
    } | null;
    last_message_at: string | null;
    created_at: string | null;
}

interface Partner extends ChatUser {
    conversations: number;
    messages_sent: number;
    messages_received: number;
}

interface UserLog extends ChatUser {
    email: string;
    grade: number | null;
    school_name: string | null;
    conversations: number;
    messages_sent: number;
    partners: Partner[];
}

interface Filters {
    search: string | null;
    user_id: number | null;
    type: ChatType | null;
    date_from: string | null;
    date_to: string | null;
}

interface Props {
    filters: Filters;
    summary: {
        conversations: number;
        direct: number;
        groups: number;
        messages: number;
    };
    user: UserLog | null;
    conversations: Paginated<ConversationRow>;
}

const TYPE_FILTERS = [
    { value: '', label: 'All chats' },
    { value: 'direct', label: 'Direct chats' },
    { value: 'group', label: 'Group chats' },
];

const BASE_URL = '/admin/chat-logs';

function userLogUrl(userId: number): string {
    return `${BASE_URL}?user_id=${userId}`;
}

/** Group name, or "A → B" for a direct chat. */
function conversationTitle(conversation: ConversationRow): string {
    if (conversation.type === 'group') {
        return conversation.name || tr('Unnamed group');
    }
    const names = conversation.participants.map(
        (participant) => participant.user?.display_name ?? tr('Deleted user'),
    );
    return names.join(' → ');
}

function TypePill({ type }: { type: ChatType }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                type === 'group'
                    ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                    : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
            )}
            data-testid="chat-log-type"
        >
            {type === 'group' ? (
                <UsersRound className="size-3" aria-hidden="true" />
            ) : (
                <MessageCircle className="size-3" aria-hidden="true" />
            )}
            {type === 'group' ? tr('Group') : tr('Direct')}
        </span>
    );
}

function AvatarStack({ participants }: { participants: Participant[] }) {
    const shown = participants.slice(0, 4);
    const extra = participants.length - shown.length;

    return (
        <span className="flex shrink-0 -space-x-2">
            {shown.map((participant) => (
                <UserAvatar
                    key={participant.id}
                    name={participant.user?.display_name}
                    src={participant.user?.avatar_url}
                    className="ring-2 ring-card"
                />
            ))}
            {extra > 0 && (
                <span className="relative inline-flex size-9 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
                    +{extra}
                </span>
            )}
        </span>
    );
}

function ParticipantLinks({ participants }: { participants: Participant[] }) {
    return (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {participants.map((participant) =>
                participant.user ? (
                    <Link
                        key={participant.id}
                        href={userLogUrl(participant.user.id)}
                        className={cn(
                            'rounded font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground',
                            participant.left_at &&
                                'text-muted-foreground line-through',
                        )}
                        title={tr('Show chat log of {0}', [
                            participant.user.display_name,
                        ])}
                    >
                        {participant.user.display_name}
                    </Link>
                ) : (
                    <span
                        key={participant.id}
                        className="text-muted-foreground"
                    >
                        {tr('Deleted user')}
                    </span>
                ),
            )}
        </span>
    );
}

function LastMessage({ conversation }: { conversation: ConversationRow }) {
    const message = conversation.last_message;
    if (!message) {
        return (
            <span className="text-xs text-muted-foreground italic">
                {tr('No messages yet')}
            </span>
        );
    }

    return (
        <span
            className={cn(
                'line-clamp-2 text-xs break-words',
                message.type === 'system'
                    ? 'text-muted-foreground italic'
                    : 'text-foreground',
            )}
        >
            {message.type === 'text' && message.sender && (
                <span className="font-semibold">{message.sender}: </span>
            )}
            {message.body}
        </span>
    );
}

function UserLogCard({ user }: { user: UserLog }) {
    const meta = [
        user.grade === null
            ? null
            : user.grade === 0
              ? tr('Kindergarten')
              : tr('Grade {0}', [user.grade]),
        user.school_name,
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <section
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
            data-testid="chat-log-user"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                        name={user.display_name}
                        src={user.avatar_url}
                        userId={user.id}
                        className="size-12"
                    />
                    <div className="flex min-w-0 flex-col">
                        <span className="font-display text-lg font-bold break-words text-foreground">
                            {user.display_name}
                        </span>
                        <span className="text-xs break-words text-muted-foreground">
                            {[user.name, user.email, meta]
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href={`/admin/users/${user.id}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent"
                    >
                        <UserRound className="size-4" aria-hidden="true" />
                        {tr('Open profile')}
                    </Link>
                    <Link
                        href={BASE_URL}
                        preserveScroll
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-4" aria-hidden="true" />
                        {tr('Clear user')}
                    </Link>
                </div>
            </div>
            <dl className="grid grid-cols-3 gap-2">
                <Tile
                    label={tr('Conversations')}
                    value={formatNumber(user.conversations)}
                />
                <Tile
                    label={tr('Messages sent')}
                    value={formatNumber(user.messages_sent)}
                />
                <Tile
                    label={tr('Chat partners')}
                    value={formatNumber(user.partners.length)}
                />
            </dl>
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                    {tr('Chatted with')}
                </h3>
                {user.partners.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        {tr('This user has not chatted with anyone yet.')}
                    </p>
                ) : (
                    <ul
                        className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3"
                        data-testid="chat-log-partners"
                    >
                        {user.partners.map((partner) => (
                            <li
                                key={partner.id}
                                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-muted/30 p-2.5"
                            >
                                <UserAvatar
                                    name={partner.display_name}
                                    src={partner.avatar_url}
                                    userId={partner.id}
                                />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <Link
                                        href={userLogUrl(partner.id)}
                                        className="truncate text-sm font-medium text-foreground hover:underline"
                                    >
                                        {partner.display_name}
                                    </Link>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {tr(
                                            '{0} chats · {1} sent · {2} received',
                                            [
                                                partner.conversations,
                                                formatNumber(
                                                    partner.messages_sent,
                                                ),
                                                formatNumber(
                                                    partner.messages_received,
                                                ),
                                            ],
                                        )}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

export default function ChatLogs({
    filters,
    summary,
    user,
    conversations,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [open, setOpen] = useState<Set<number>>(new Set());
    const firstRender = useRef(true);
    const baseId = useId();

    const apply = (changes: Partial<Filters>) => {
        const next = { ...filters, ...changes };
        router.get(
            BASE_URL,
            Object.fromEntries(
                Object.entries(next).filter(
                    ([, value]) => value !== null && value !== '',
                ),
            ),
            { preserveScroll: true, preserveState: true },
        );
    };

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timer = setTimeout(
            () => apply({ search: search.trim() || null }),
            400,
        );
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const toggle = (id: number) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });

    const filtered = Boolean(
        filters.search ||
        filters.user_id ||
        filters.type ||
        filters.date_from ||
        filters.date_to,
    );
    const allOpen =
        conversations.data.length > 0 &&
        conversations.data.every((conversation) => open.has(conversation.id));

    return (
        <>
            <Head title={tr('Chat logs')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Chat logs')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Every player chat: direct, group and 3D classroom chats. Opening a chat is recorded in the activity log.',
                        )}
                    </p>
                </div>

                <div
                    className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
                    data-testid="chat-log-summary"
                >
                    <KpiCard
                        label={tr('Conversations')}
                        value={formatNumber(summary.conversations)}
                        icon={MessagesSquare}
                        accent="#6366f1"
                    />
                    <KpiCard
                        label={tr('Direct chats')}
                        value={formatNumber(summary.direct)}
                        icon={MessageCircle}
                        accent="#0ea5e9"
                    />
                    <KpiCard
                        label={tr('Group chats')}
                        value={formatNumber(summary.groups)}
                        icon={UsersRound}
                        accent="#8b5cf6"
                    />
                    <KpiCard
                        label={tr('Messages')}
                        value={formatNumber(summary.messages)}
                        icon={MessageCircle}
                        accent="#10b981"
                    />
                </div>

                {user && <UserLogCard user={user} />}

                <div
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm"
                    data-testid="chat-log-filters"
                >
                    <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 lg:max-w-sm">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tr('Search name, nickname or message')}
                            aria-label={tr('Search chats')}
                            className={`${fieldClass} w-full pl-9`}
                            data-testid="chat-log-search"
                        />
                    </div>
                    <select
                        aria-label={tr('Chat type')}
                        value={filters.type ?? ''}
                        onChange={(event) =>
                            apply({
                                type: (event.target.value ||
                                    null) as ChatType | null,
                            })
                        }
                        className={cn(
                            fieldClass,
                            'min-w-0 flex-1 sm:flex-none',
                        )}
                        data-testid="chat-log-type-filter"
                    >
                        {TYPE_FILTERS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {tr(option.label)}
                            </option>
                        ))}
                    </select>
                    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground sm:flex-none">
                        <span className="shrink-0">{tr('From')}</span>
                        <input
                            type="date"
                            value={filters.date_from ?? ''}
                            max={filters.date_to ?? undefined}
                            onChange={(event) =>
                                apply({ date_from: event.target.value || null })
                            }
                            className={cn(fieldClass, 'min-w-0 flex-1')}
                            data-testid="chat-log-date-from"
                        />
                    </label>
                    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground sm:flex-none">
                        <span className="shrink-0">{tr('To')}</span>
                        <input
                            type="date"
                            value={filters.date_to ?? ''}
                            min={filters.date_from ?? undefined}
                            onChange={(event) =>
                                apply({ date_to: event.target.value || null })
                            }
                            className={cn(fieldClass, 'min-w-0 flex-1')}
                            data-testid="chat-log-date-to"
                        />
                    </label>
                    {filtered && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                router.get(
                                    BASE_URL,
                                    {},
                                    { preserveScroll: true },
                                );
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RotateCcw className="size-4" />
                            {tr('Reset')}
                        </button>
                    )}
                </div>

                {conversations.data.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <EmptyState
                            icon={MessagesSquare}
                            title={tr('No chats found')}
                            description={tr('Change the search or filters.')}
                        />
                    </div>
                ) : (
                    <>
                        <div
                            className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block"
                            data-testid="chat-log-table"
                        >
                            <table className="w-full text-sm">
                                <caption className="sr-only">
                                    {tr('Chat logs')}
                                </caption>
                                <thead>
                                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                                        <th
                                            scope="col"
                                            className="py-2.5 pr-3 pl-4 text-left font-medium"
                                        >
                                            {tr('Conversation')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 text-left font-medium"
                                        >
                                            {tr('Participants')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 text-right font-medium"
                                        >
                                            {tr('Messages')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-3 py-2.5 text-left font-medium"
                                        >
                                            {tr('Last message')}
                                        </th>
                                        <th
                                            scope="col"
                                            className="py-2.5 pr-4 pl-3 text-right font-medium"
                                        >
                                            {tr('Last activity')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {conversations.data.map((conversation) => (
                                        <tr
                                            key={conversation.id}
                                            className="hover:bg-muted/30"
                                            data-testid="chat-log-row"
                                        >
                                            <td className="py-2.5 pr-3 pl-4 align-middle">
                                                <Link
                                                    href={`${BASE_URL}/${conversation.id}`}
                                                    className="flex min-w-0 items-center gap-2.5 rounded-lg hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                >
                                                    <AvatarStack
                                                        participants={
                                                            conversation.participants
                                                        }
                                                    />
                                                    <span className="flex min-w-0 flex-col items-start gap-1">
                                                        <span className="font-medium break-words text-foreground">
                                                            {conversationTitle(
                                                                conversation,
                                                            )}
                                                        </span>
                                                        <TypePill
                                                            type={
                                                                conversation.type
                                                            }
                                                        />
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="max-w-56 px-3 py-2.5 align-middle">
                                                <ParticipantLinks
                                                    participants={
                                                        conversation.participants
                                                    }
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle font-semibold text-foreground tabular-nums">
                                                {formatNumber(
                                                    conversation.messages_count,
                                                )}
                                            </td>
                                            <td className="max-w-80 px-3 py-2.5 align-middle">
                                                <LastMessage
                                                    conversation={conversation}
                                                />
                                            </td>
                                            <td
                                                className="py-2.5 pr-4 pl-3 text-right align-middle text-xs whitespace-nowrap text-muted-foreground"
                                                title={formatDateTime(
                                                    conversation.last_message_at,
                                                )}
                                            >
                                                {timeAgo(
                                                    conversation.last_message_at ??
                                                        conversation.created_at,
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-col gap-2 lg:hidden">
                            {conversations.data.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setOpen(
                                            allOpen
                                                ? new Set()
                                                : new Set(
                                                      conversations.data.map(
                                                          (conversation) =>
                                                              conversation.id,
                                                      ),
                                                  ),
                                        )
                                    }
                                    className="inline-flex h-8 w-fit items-center gap-1.5 self-end rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
                                    data-testid="chat-log-toggle-all"
                                >
                                    <ChevronsUpDown className="size-3.5" />
                                    {allOpen
                                        ? tr('Collapse all')
                                        : tr('Expand all')}
                                </button>
                            )}
                            <ul
                                className="flex flex-col gap-2"
                                data-testid="chat-log-cards"
                            >
                                {conversations.data.map((conversation) => {
                                    const expanded = open.has(conversation.id);
                                    const panelId = `${baseId}-chat-${conversation.id}`;
                                    return (
                                        <li
                                            key={conversation.id}
                                            className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                                            data-testid="chat-log-card"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggle(conversation.id)
                                                }
                                                aria-expanded={expanded}
                                                aria-controls={panelId}
                                                className="flex w-full min-w-0 items-start gap-2 p-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                            >
                                                <AvatarStack
                                                    participants={
                                                        conversation.participants
                                                    }
                                                />
                                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                    <span className="font-medium break-words text-foreground">
                                                        {conversationTitle(
                                                            conversation,
                                                        )}
                                                    </span>
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <TypePill
                                                            type={
                                                                conversation.type
                                                            }
                                                        />
                                                        <span className="text-xs text-muted-foreground tabular-nums">
                                                            {tr(
                                                                '{0} messages',
                                                                [
                                                                    formatNumber(
                                                                        conversation.messages_count,
                                                                    ),
                                                                ],
                                                            )}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {timeAgo(
                                                                conversation.last_message_at ??
                                                                    conversation.created_at,
                                                            )}
                                                        </span>
                                                    </span>
                                                </span>
                                                <ChevronDown
                                                    className={cn(
                                                        'mt-2 size-4 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
                                                        expanded &&
                                                            'rotate-180',
                                                    )}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                            <div className="px-3 pb-3">
                                                <LastMessage
                                                    conversation={conversation}
                                                />
                                            </div>
                                            <div
                                                id={panelId}
                                                className={cn(
                                                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                                                    expanded
                                                        ? 'grid-rows-[1fr] opacity-100'
                                                        : 'grid-rows-[0fr] opacity-0',
                                                )}
                                                aria-hidden={!expanded}
                                                inert={!expanded}
                                                data-testid={`chat-log-panel-${conversation.id}`}
                                            >
                                                <div className="min-h-0 overflow-hidden">
                                                    <div className="flex flex-col gap-3 border-t border-dashed border-border bg-muted/20 p-3">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-xs font-semibold text-foreground">
                                                                {tr(
                                                                    'Participants',
                                                                )}
                                                            </span>
                                                            <ParticipantLinks
                                                                participants={
                                                                    conversation.participants
                                                                }
                                                            />
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            {tr('Started')}{' '}
                                                            {formatDateTime(
                                                                conversation.created_at,
                                                            )}
                                                        </p>
                                                        <Link
                                                            href={`${BASE_URL}/${conversation.id}`}
                                                            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
                                                        >
                                                            {tr(
                                                                'Open conversation',
                                                            )}
                                                            <ArrowRight
                                                                className="size-4"
                                                                aria-hidden="true"
                                                            />
                                                        </Link>
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </>
                )}

                <SimplePagination
                    links={conversations.links}
                    from={conversations.from}
                    to={conversations.to}
                    total={conversations.total}
                />
            </div>
        </>
    );
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col-reverse items-center rounded-xl bg-muted/50 px-1 py-2 text-center">
            <dt className="w-full truncate text-[10px] text-muted-foreground min-[360px]:text-xs">
                {label}
            </dt>
            <dd className="text-base font-bold text-foreground tabular-nums">
                {value}
            </dd>
        </div>
    );
}

ChatLogs.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Chat logs')}>{page}</AdminLayout>
);
