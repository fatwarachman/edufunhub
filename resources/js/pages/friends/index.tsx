import { PlayerAvatar } from '@/components/player-avatar';
import { BackButton } from '@/components/site-nav';
import { useChatEvents, useUserOnline } from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { type CharacterLook } from '@/lib/character/draw-character';
import { gradeShortLabel, hasGrade } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { router, usePage } from '@inertiajs/react';
import {
    Check,
    Clock3,
    Inbox,
    Loader2,
    MessageCircle,
    Search,
    UserMinus,
    UserPlus,
    Users,
    X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

type Tab = 'friends' | 'requests' | 'add';
type Relation = 'none' | 'friends' | 'sent' | 'received';

interface Person {
    id: number;
    name: string;
    grade: number | null;
    school: string | null;
    character: CharacterLook | null;
    last_seen_at: string | null;
}

interface FriendRow {
    id: number;
    user: Person;
    since: string | null;
}

interface SearchResult extends Person {
    friendship_id: number | null;
    relation: Relation;
}

interface FriendsPageProps {
    friends: FriendRow[];
    incoming: FriendRow[];
    outgoing: FriendRow[];
    tab: Tab;
    limits: { friends: number };
}

const TABS: { key: Tab; icon: typeof Users }[] = [
    { key: 'friends', icon: Users },
    { key: 'requests', icon: Inbox },
    { key: 'add', icon: UserPlus },
];

const ink = 'border-[2.5px] border-[#151b2e]';

function csrf(): string {
    return decodeURIComponent(
        document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '',
    );
}

/** Act on a request and refresh the lists (flash message shows the result). */
function act(method: 'post' | 'delete', url: string, onFinish?: () => void) {
    router.visit(url, {
        method,
        preserveScroll: true,
        only: ['friends', 'incoming', 'outgoing', 'pendingFriends', 'flash'],
        onFinish,
    });
}

export default function FriendsPage({
    friends,
    incoming,
    outgoing,
    tab: initialTab,
    limits,
}: FriendsPageProps) {
    const { t } = useTranslations();
    const [tab, setTab] = useState<Tab>(initialTab);
    const { flash, errors } = usePage<{
        flash?: { success?: string };
        errors: Record<string, string>;
    }>().props;
    const error = errors.user_id ?? errors.friendship;

    /* Another player answered or sent a request: refresh the lists. */
    useChatEvents((event) => {
        if (event.t === 'friend') {
            router.reload({
                only: ['friends', 'incoming', 'outgoing', 'pendingFriends'],
            });
        }
    });

    const changeTab = (next: Tab) => {
        setTab(next);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', next);
        window.history.replaceState(window.history.state, '', url);
    };

    const counts: Record<Tab, number> = {
        friends: friends.length,
        requests: incoming.length,
        add: 0,
    };

    return (
        <PlayerLayout title={t('friends.title')}>
            <div className="flex flex-col items-start gap-3">
                <BackButton href="/portal" label={t('nav.backToPortal')} />
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                        {t('friends.title')}
                    </h1>
                    <p className="text-sm text-[#3d4460]">
                        {t('friends.intro')}
                    </p>
                </div>
            </div>

            <div
                role="tablist"
                aria-label={t('friends.title')}
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-2"
            >
                {TABS.map(({ key, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => changeTab(key)}
                        data-testid={`friends-tab-${key}`}
                        className={cn(
                            ink,
                            'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-colors',
                            tab === key
                                ? 'bg-[#151b2e] text-white'
                                : 'bg-white hover:bg-[#fff3c4]',
                        )}
                    >
                        <Icon className="size-4" aria-hidden="true" />
                        {t(`friends.tabs.${key}`)}
                        {counts[key] > 0 && (
                            <span
                                className={cn(
                                    'rounded-full px-1.5 text-xs tabular-nums',
                                    key === 'requests'
                                        ? 'bg-[#e11d48] text-white'
                                        : 'bg-[#ffd93d] text-[#151b2e]',
                                )}
                            >
                                {counts[key]}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {flash?.success && (
                <p
                    role="status"
                    className="rounded-2xl border-2 border-[#151b2e] bg-[#dff7ea] px-4 py-2 text-sm font-bold"
                    data-testid="friends-flash"
                >
                    {flash.success}
                </p>
            )}
            {error && (
                <p
                    role="alert"
                    className="rounded-2xl border-2 border-[#151b2e] bg-[#ffe1e6] px-4 py-2 text-sm font-bold"
                    data-testid="friends-error"
                >
                    {error}
                </p>
            )}

            {tab === 'friends' && (
                <FriendList
                    friends={friends}
                    max={limits.friends}
                    onAdd={() => changeTab('add')}
                />
            )}
            {tab === 'requests' && (
                <Requests incoming={incoming} outgoing={outgoing} />
            )}
            {tab === 'add' && <AddFriend />}
        </PlayerLayout>
    );
}

/** Friends sorted online first, then by name; status updates live. */
function FriendList({
    friends,
    max,
    onAdd,
}: {
    friends: FriendRow[];
    max: number;
    onAdd: () => void;
}) {
    const { t } = useTranslations();
    const [online, setOnline] = useState<Record<number, boolean>>({});
    const [filter, setFilter] = useState<'all' | 'online'>('all');

    const sorted = useMemo(
        () =>
            [...friends].sort((a, b) => {
                const diff =
                    Number(online[b.user.id] ?? false) -
                    Number(online[a.user.id] ?? false);
                return diff !== 0
                    ? diff
                    : a.user.name.localeCompare(b.user.name);
            }),
        [friends, online],
    );
    const onlineCount = friends.filter((f) => online[f.user.id]).length;
    const shown =
        filter === 'online' ? sorted.filter((f) => online[f.user.id]) : sorted;

    if (friends.length === 0) {
        return (
            <section
                className="auth-card flex flex-col items-center gap-3 py-10 text-center"
                data-testid="friends-empty"
            >
                <Users className="size-10 text-[#3d4460]" aria-hidden="true" />
                <h2 className="text-xl font-bold">
                    {t('friends.empty.title')}
                </h2>
                <p className="max-w-md text-sm text-[#3d4460]">
                    {t('friends.empty.body')}
                </p>
                <button
                    type="button"
                    onClick={onAdd}
                    className="mt-1 inline-flex min-h-11 items-center gap-2 px-4 font-bold"
                >
                    <UserPlus className="size-4" aria-hidden="true" />
                    {t('friends.empty.cta')}
                </button>
            </section>
        );
    }

    return (
        <section
            className="auth-card flex flex-col gap-4"
            data-testid="friends-list"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p
                    className="text-sm font-bold"
                    data-testid="friends-online-count"
                >
                    {t('friends.onlineSummary', {
                        online: onlineCount,
                        total: friends.length,
                        max,
                    })}
                </p>
                <div
                    className="flex gap-1.5"
                    role="group"
                    aria-label={t('friends.filter')}
                >
                    {(['all', 'online'] as const).map((key) => (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={filter === key}
                            onClick={() => setFilter(key)}
                            data-testid={`friends-filter-${key}`}
                            className={cn(
                                'min-h-9 rounded-xl border-2 border-[#151b2e] px-3 text-xs font-bold',
                                filter === key
                                    ? 'bg-[#151b2e] text-white'
                                    : 'bg-white hover:bg-[#fff3c4]',
                            )}
                        >
                            {t(`friends.filters.${key}`)}
                        </button>
                    ))}
                </div>
            </div>
            {shown.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-[#151b2e]/40 px-4 py-6 text-center text-sm font-semibold">
                    {t('friends.noneOnline')}
                </p>
            ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {shown.map((row) => (
                        <FriendCard
                            key={row.id}
                            row={row}
                            onStatus={(id, value) =>
                                setOnline((current) =>
                                    current[id] === value
                                        ? current
                                        : { ...current, [id]: value },
                                )
                            }
                        />
                    ))}
                </ul>
            )}
            {/* Hidden watchers keep statuses of filtered-out friends live. */}
            {filter === 'online' &&
                sorted
                    .filter((f) => !online[f.user.id])
                    .map((row) => (
                        <StatusWatcher
                            key={row.id}
                            userId={row.user.id}
                            onStatus={(id, value) =>
                                setOnline((current) =>
                                    current[id] === value
                                        ? current
                                        : { ...current, [id]: value },
                                )
                            }
                        />
                    ))}
        </section>
    );
}

function StatusWatcher({
    userId,
    onStatus,
}: {
    userId: number;
    onStatus: (id: number, online: boolean) => void;
}) {
    const online = useUserOnline(userId);
    const report = useRef(onStatus);
    useEffect(() => {
        report.current = onStatus;
    });
    useEffect(() => {
        report.current(userId, online);
    }, [userId, online]);
    return null;
}

function lastSeenText(
    t: ReturnType<typeof useTranslations>['t'],
    iso: string | null,
): string {
    if (!iso) {
        return t('friends.status.offline');
    }
    const minutes = Math.max(
        0,
        Math.round((Date.now() - new Date(iso).getTime()) / 60000),
    );
    if (minutes < 60) {
        return t('friends.status.minutesAgo', { count: Math.max(1, minutes) });
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return t('friends.status.hoursAgo', { count: hours });
    }
    return t('friends.status.daysAgo', { count: Math.round(hours / 24) });
}

function FriendCard({
    row,
    onStatus,
}: {
    row: FriendRow;
    onStatus: (id: number, online: boolean) => void;
}) {
    const { t } = useTranslations();
    const online = useUserOnline(row.user.id);
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const report = useRef(onStatus);
    useEffect(() => {
        report.current = onStatus;
    });
    useEffect(() => {
        report.current(row.user.id, online);
    }, [row.user.id, online]);

    const chat = async () => {
        setBusy(true);
        try {
            const response = await fetch('/chat/direct', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN': csrf(),
                },
                body: JSON.stringify({ user_id: row.user.id }),
            });
            const data = (await response.json()) as {
                conversation?: { id: number };
            };
            router.visit(
                data.conversation ? `/chat?c=${data.conversation.id}` : '/chat',
            );
        } catch {
            router.visit('/chat');
        } finally {
            setBusy(false);
        }
    };

    return (
        <li
            className={cn(
                ink,
                'flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-3 shadow-[2px_2px_0_#151b2e]',
            )}
            data-testid={`friend-${row.user.id}`}
            data-online={online}
        >
            <div className="flex min-w-0 items-center gap-3">
                <span className="relative size-14 shrink-0 rounded-xl bg-[#d8c7a4]/50">
                    <PlayerAvatar
                        character={row.user.character}
                        userId={row.user.id}
                    />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-bold" title={row.user.name}>
                        {row.user.name}
                    </span>
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 text-xs font-bold',
                            online ? 'text-[#0f7a4f]' : 'text-[#5b6178]',
                        )}
                        data-testid="friend-status"
                    >
                        <span
                            className={cn(
                                'size-2.5 shrink-0 rounded-full',
                                online
                                    ? 'bg-[#22c55e] shadow-[0_0_0_3px_rgba(34,197,94,0.25)]'
                                    : 'bg-[#a3a9bd]',
                            )}
                            aria-hidden="true"
                        />
                        {online
                            ? t('friends.status.online')
                            : lastSeenText(t, row.user.last_seen_at)}
                    </span>
                    <PersonMeta person={row.user} />
                </div>
            </div>
            {confirm ? (
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => setConfirm(false)}
                        className={cn(
                            ink,
                            'min-h-10 rounded-xl bg-white text-sm font-bold',
                        )}
                    >
                        {t('friends.actions.keep')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            setBusy(true);
                            act('delete', `/friends/${row.id}`, () =>
                                setBusy(false),
                            );
                        }}
                        className={cn(
                            ink,
                            'min-h-10 rounded-xl bg-[#ffe1e6] text-sm font-bold',
                        )}
                        data-testid="friend-remove-confirm"
                    >
                        {t('friends.actions.removeConfirm')}
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                        type="button"
                        onClick={chat}
                        disabled={busy}
                        className={cn(
                            ink,
                            'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ffd93d] px-3 text-sm font-bold shadow-[2px_2px_0_#151b2e]',
                        )}
                        data-testid="friend-chat"
                    >
                        {busy ? (
                            <Loader2
                                className="size-4 animate-spin"
                                aria-hidden="true"
                            />
                        ) : (
                            <MessageCircle
                                className="size-4"
                                aria-hidden="true"
                            />
                        )}
                        {t('friends.actions.chat')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirm(true)}
                        aria-label={t('friends.actions.remove')}
                        title={t('friends.actions.remove')}
                        className={cn(
                            ink,
                            'grid size-10 place-items-center rounded-xl bg-white hover:bg-[#ffe1e6]',
                        )}
                        data-testid="friend-remove"
                    >
                        <UserMinus className="size-4" aria-hidden="true" />
                    </button>
                </div>
            )}
        </li>
    );
}

function PersonMeta({ person }: { person: Person }) {
    const { t } = useTranslations();
    const parts = [
        hasGrade(person.grade) ? gradeShortLabel(t, person.grade) : null,
        person.school,
    ].filter(Boolean);
    if (parts.length === 0) {
        return null;
    }
    return (
        <span
            className="truncate text-xs text-[#3d4460]"
            title={parts.join(' · ')}
        >
            {parts.join(' · ')}
        </span>
    );
}

function Requests({
    incoming,
    outgoing,
}: {
    incoming: FriendRow[];
    outgoing: FriendRow[];
}) {
    const { t } = useTranslations();
    const [busy, setBusy] = useState<number | null>(null);
    const run = (id: number, method: 'post' | 'delete', url: string) => {
        setBusy(id);
        act(method, url, () => setBusy(null));
    };

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section
                className="auth-card flex flex-col gap-3"
                data-testid="friends-incoming"
            >
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Inbox className="size-5" aria-hidden="true" />
                    {t('friends.incoming')}
                </h2>
                {incoming.length === 0 ? (
                    <p className="rounded-2xl border-2 border-dashed border-[#151b2e]/40 px-4 py-6 text-center text-sm font-semibold">
                        {t('friends.noIncoming')}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {incoming.map((row) => (
                            <PersonRow
                                key={row.id}
                                person={row.user}
                                testId={`incoming-${row.user.id}`}
                            >
                                <button
                                    type="button"
                                    disabled={busy === row.id}
                                    onClick={() =>
                                        run(
                                            row.id,
                                            'post',
                                            `/friends/${row.id}/accept`,
                                        )
                                    }
                                    className={cn(
                                        ink,
                                        'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#ffd93d] px-3 text-sm font-bold',
                                    )}
                                    data-testid="friend-accept"
                                >
                                    <Check
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    <span className="max-sm:sr-only">
                                        {t('friends.actions.accept')}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    disabled={busy === row.id}
                                    onClick={() =>
                                        run(
                                            row.id,
                                            'post',
                                            `/friends/${row.id}/decline`,
                                        )
                                    }
                                    aria-label={t('friends.actions.decline')}
                                    title={t('friends.actions.decline')}
                                    className={cn(
                                        ink,
                                        'grid size-10 place-items-center rounded-xl bg-white hover:bg-[#ffe1e6]',
                                    )}
                                    data-testid="friend-decline"
                                >
                                    <X className="size-4" aria-hidden="true" />
                                </button>
                            </PersonRow>
                        ))}
                    </ul>
                )}
            </section>
            <section
                className="auth-card flex flex-col gap-3"
                data-testid="friends-outgoing"
            >
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Clock3 className="size-5" aria-hidden="true" />
                    {t('friends.outgoing')}
                </h2>
                {outgoing.length === 0 ? (
                    <p className="rounded-2xl border-2 border-dashed border-[#151b2e]/40 px-4 py-6 text-center text-sm font-semibold">
                        {t('friends.noOutgoing')}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {outgoing.map((row) => (
                            <PersonRow
                                key={row.id}
                                person={row.user}
                                testId={`outgoing-${row.user.id}`}
                            >
                                <button
                                    type="button"
                                    disabled={busy === row.id}
                                    onClick={() =>
                                        run(
                                            row.id,
                                            'delete',
                                            `/friends/${row.id}`,
                                        )
                                    }
                                    className={cn(
                                        ink,
                                        'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold hover:bg-[#ffe1e6]',
                                    )}
                                    data-testid="friend-cancel"
                                >
                                    <X className="size-4" aria-hidden="true" />
                                    <span className="max-sm:sr-only">
                                        {t('friends.actions.cancel')}
                                    </span>
                                </button>
                            </PersonRow>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function PersonRow({
    person,
    testId,
    children,
}: {
    person: Person;
    testId?: string;
    children: ReactNode;
}) {
    return (
        <li
            className={cn(
                ink,
                'flex min-w-0 items-center gap-3 rounded-2xl bg-white p-2.5',
            )}
            data-testid={testId}
        >
            <span className="relative size-11 shrink-0 rounded-xl bg-[#d8c7a4]/50">
                <PlayerAvatar character={person.character} userId={person.id} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-bold" title={person.name}>
                    {person.name}
                </span>
                <PersonMeta person={person} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">{children}</div>
        </li>
    );
}

function AddFriend() {
    const { t } = useTranslations();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<number | null>(null);
    const request = useRef(0);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            return;
        }
        const id = ++request.current;
        const timer = window.setTimeout(async () => {
            setLoading(true);
            try {
                const response = await fetch(
                    `/friends/search?q=${encodeURIComponent(term)}`,
                    {
                        credentials: 'same-origin',
                        headers: {
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                    },
                );
                const data = (await response.json()) as {
                    people: SearchResult[];
                };
                if (id === request.current) {
                    setResults(data.people ?? []);
                }
            } catch {
                if (id === request.current) {
                    setResults([]);
                }
            } finally {
                if (id === request.current) {
                    setLoading(false);
                }
            }
        }, 300);
        return () => window.clearTimeout(timer);
    }, [query]);

    const send = (person: SearchResult) => {
        setBusy(person.id);
        router.post(
            '/friends',
            { user_id: person.id },
            {
                preserveScroll: true,
                preserveState: true,
                only: [
                    'friends',
                    'incoming',
                    'outgoing',
                    'pendingFriends',
                    'flash',
                    'errors',
                ],
                onSuccess: () =>
                    setResults(
                        (current) =>
                            current?.map((r) =>
                                r.id === person.id
                                    ? {
                                          ...r,
                                          relation:
                                              r.relation === 'received'
                                                  ? 'friends'
                                                  : 'sent',
                                      }
                                    : r,
                            ) ?? null,
                    ),
                onFinish: () => setBusy(null),
            },
        );
    };

    const shown = query.trim().length >= 2 ? results : null;

    return (
        <section
            className="auth-card flex flex-col gap-4"
            data-testid="friends-add"
        >
            <label htmlFor="friend-search" className="flex flex-col gap-2">
                <span className="font-bold">{t('friends.searchLabel')}</span>
                <span className="relative">
                    <Search
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#5b6178]"
                        aria-hidden="true"
                    />
                    <input
                        id="friend-search"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('friends.searchPlaceholder')}
                        autoComplete="off"
                        maxLength={60}
                        className="w-full pr-3 pl-9"
                        data-testid="friend-search"
                    />
                    {loading && (
                        <Loader2
                            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
                            aria-hidden="true"
                        />
                    )}
                </span>
                <span className="text-xs text-[#3d4460]">
                    {t('friends.searchHint')}
                </span>
            </label>
            {shown !== null && shown.length === 0 && !loading && (
                <p
                    className="rounded-2xl border-2 border-dashed border-[#151b2e]/40 px-4 py-6 text-center text-sm font-semibold"
                    data-testid="friend-search-empty"
                >
                    {t('friends.searchEmpty')}
                </p>
            )}
            {shown && shown.length > 0 && (
                <ul
                    className="flex flex-col gap-2"
                    data-testid="friend-search-results"
                >
                    {shown.map((person) => (
                        <PersonRow
                            key={person.id}
                            person={person}
                            testId={`result-${person.id}`}
                        >
                            {person.relation === 'friends' ? (
                                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#dff7ea] px-3 text-sm font-bold">
                                    <Check
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    <span className="max-sm:sr-only">
                                        {t('friends.relation.friends')}
                                    </span>
                                </span>
                            ) : person.relation === 'sent' ? (
                                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#fff3c4] px-3 text-sm font-bold">
                                    <Clock3
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    <span className="max-sm:sr-only">
                                        {t('friends.relation.sent')}
                                    </span>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    disabled={busy === person.id}
                                    onClick={() => send(person)}
                                    className={cn(
                                        ink,
                                        'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#ffd93d] px-3 text-sm font-bold shadow-[2px_2px_0_#151b2e]',
                                    )}
                                    data-testid="friend-add"
                                    data-relation={person.relation}
                                >
                                    {person.relation === 'received' ? (
                                        <Check
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <UserPlus
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span className="max-sm:sr-only">
                                        {person.relation === 'received'
                                            ? t('friends.actions.accept')
                                            : t('friends.actions.add')}
                                    </span>
                                </button>
                            )}
                        </PersonRow>
                    ))}
                </ul>
            )}
        </section>
    );
}
