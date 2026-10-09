import { ConfirmDialog } from '@/components/admin/admin-kit';
import { AssistantAnswer } from '@/components/admin/assistant-answer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/hooks/use-translations';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import english from '@/locales/en-ai-assistant.json';
import indonesian from '@/locales/id-ai-assistant.json';
import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import {
    ArrowUp,
    BookOpen,
    Bot,
    CircleAlert,
    History,
    Loader2,
    MessageSquare,
    Plus,
    ShieldCheck,
    Trash2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
} from 'react';

interface Source {
    label: string;
    url: string;
}
interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: Source[];
    queriedAt?: string | null;
}
interface Conversation {
    id: string;
    title: string;
    updated_at: string | null;
}
interface Reply {
    answer: string;
    sources: Source[];
    queried_at: string;
    conversation: Conversation | null;
}
interface ConversationReply {
    conversation: { id: string; title: string };
    messages: {
        role: 'user' | 'assistant';
        content: string;
        sources: Source[];
        queried_at: string | null;
    }[];
}

export default function AiAssistant({
    configured,
    model,
    conversations: initialConversations = [],
}: {
    configured: boolean;
    model: string | null;
    conversations?: Conversation[];
}) {
    const { i18n } = useTranslations();
    const copy = i18n.language.startsWith('id') ? indonesian : english;
    const [conversations, setConversations] =
        useState<Conversation[]>(initialConversations);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState('');
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [historyOpen, setHistoryOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
    const [deleting, setDeleting] = useState(false);
    const request = useRef<AbortController | null>(null);
    const bottom = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const pending = pendingMessage !== null;
    const busy = pending || loadingId !== null;

    useEffect(() => () => request.current?.abort(), []);
    useEffect(() => {
        bottom.current?.scrollIntoView({ block: 'nearest' });
    }, [messages, pendingMessage]);

    function startNewChat() {
        if (busy) return;
        setActiveId(null);
        setMessages([]);
        setDraft('');
        setError('');
        setHistoryOpen(false);
        input.current?.focus();
    }

    async function openConversation(conversation: Conversation) {
        if (busy || conversation.id === activeId) {
            setHistoryOpen(false);
            return;
        }
        setLoadingId(conversation.id);
        setError('');
        try {
            const { data } = await axios.get<ConversationReply>(
                `/admin/ai-assistant/conversations/${conversation.id}`,
                { headers: { Accept: 'application/json' } },
            );
            setActiveId(data.conversation.id);
            setMessages(
                data.messages.map((message) => ({
                    role: message.role,
                    content: message.content,
                    sources: message.sources,
                    queriedAt: message.queried_at,
                })),
            );
            setHistoryOpen(false);
        } catch {
            setError(copy.historyError);
        } finally {
            setLoadingId(null);
        }
    }

    async function deleteConversation() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await axios.delete(
                `/admin/ai-assistant/conversations/${deleteTarget.id}`,
                { headers: { Accept: 'application/json' } },
            );
            setConversations((current) =>
                current.filter((item) => item.id !== deleteTarget.id),
            );
            if (deleteTarget.id === activeId) {
                setActiveId(null);
                setMessages([]);
            }
            setDeleteTarget(null);
        } catch {
            setError(copy.deleteError);
            setDeleteTarget(null);
        } finally {
            setDeleting(false);
        }
    }

    async function submit(event?: FormEvent) {
        event?.preventDefault();
        const message = draft.trim();
        if (!message || busy || !configured || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setPendingMessage(message);
        setDraft('');
        setError('');
        try {
            const { data } = await axios.post<Reply>(
                '/admin/ai-assistant/messages',
                {
                    message,
                    ...(activeId ? { conversation_id: activeId } : {}),
                },
                {
                    signal: controller.signal,
                    timeout: 150000,
                    headers: { Accept: 'application/json' },
                },
            );
            if (typeof data.answer !== 'string' || !Array.isArray(data.sources))
                throw new Error('Invalid assistant response');
            setMessages((current) => [
                ...current,
                { role: 'user', content: message },
                {
                    role: 'assistant',
                    content: data.answer,
                    sources: data.sources,
                    queriedAt: data.queried_at,
                },
            ]);
            if (data.conversation) {
                const saved = data.conversation;
                setActiveId(saved.id);
                setConversations((current) => [
                    saved,
                    ...current.filter((item) => item.id !== saved.id),
                ]);
            }
        } catch (exception) {
            if (axios.isCancel(exception)) return;
            setDraft(message);
            const status = axios.isAxiosError(exception)
                ? exception.response?.status
                : undefined;
            setError(
                status === 429
                    ? copy.rateLimited
                    : status === 419 || status === 401
                      ? copy.sessionExpired
                      : status === 403
                        ? copy.forbidden
                        : copy.error,
            );
        } finally {
            request.current = null;
            setPendingMessage(null);
            input.current?.focus();
        }
    }

    function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            void submit();
        }
    }

    const historyList = (
        <nav aria-label={copy.history} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
                    <History className="size-4" aria-hidden="true" />
                    {copy.history}
                </h2>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 lg:hidden"
                    onClick={() => setHistoryOpen(false)}
                    aria-label={copy.closeHistory}
                >
                    <X className="size-4" />
                </Button>
            </div>
            <div className="p-3">
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={busy}
                    onClick={startNewChat}
                >
                    <Plus className="size-4" />
                    {copy.newChat}
                </Button>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
                {conversations.length === 0 && (
                    <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                        {copy.noHistory}
                    </li>
                )}
                {conversations.map((conversation) => (
                    <li key={conversation.id} className="group relative">
                        <button
                            type="button"
                            disabled={busy && loadingId !== conversation.id}
                            onClick={() => openConversation(conversation)}
                            aria-current={
                                conversation.id === activeId
                                    ? 'true'
                                    : undefined
                            }
                            className={cn(
                                'flex w-full min-w-0 items-start gap-2 rounded-lg py-2 pr-9 pl-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60',
                                conversation.id === activeId &&
                                    'bg-accent font-medium',
                            )}
                        >
                            {loadingId === conversation.id ? (
                                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                            ) : (
                                <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 [overflow-wrap:anywhere]">
                                    {conversation.title || copy.untitled}
                                </span>
                                {conversation.updated_at && (
                                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                        {new Date(
                                            conversation.updated_at,
                                        ).toLocaleString(i18n.language, {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                        })}
                                    </span>
                                )}
                            </span>
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setDeleteTarget(conversation)}
                            aria-label={`${copy.deleteConversation}: ${conversation.title}`}
                            className="absolute top-1.5 right-1.5 rounded-md p-1.5 text-muted-foreground opacity-100 transition-opacity hover:bg-background hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100"
                        >
                            <Trash2 className="size-3.5" />
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );

    return (
        <AdminLayout title={copy.title}>
            <Head title={copy.title} />
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-xl border border-border bg-card p-3">
                            <Bot
                                className="size-5 text-primary"
                                aria-hidden="true"
                            />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl font-semibold tracking-tight">
                                {copy.title}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {copy.subtitle}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="lg:hidden"
                            onClick={() => setHistoryOpen(true)}
                            aria-expanded={historyOpen}
                            aria-label={copy.openHistory}
                        >
                            <History className="size-4" />
                            {copy.history}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || (!messages.length && !activeId)}
                            onClick={startNewChat}
                        >
                            <Plus className="size-4" />
                            {copy.newChat}
                        </Button>
                    </div>
                </header>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="size-3.5" />
                        {copy.readOnly}
                    </span>
                    {model && (
                        <span className="min-w-0 break-all">
                            {copy.model}: {model}
                        </span>
                    )}
                    <span>{copy.savedHistory}</span>
                </div>
                {!configured && (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm"
                    >
                        <CircleAlert className="size-5 shrink-0" />
                        <p className="flex-1">{copy.notConfigured}</p>
                        <Link
                            href="/admin/ai-settings"
                            className="font-medium text-primary underline underline-offset-4"
                        >
                            {copy.settings}
                        </Link>
                    </div>
                )}
                <div className="flex min-w-0 gap-4">
                    <aside className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:flex lg:h-[min(72dvh,46rem)]">
                        {historyList}
                    </aside>
                    {historyOpen && (
                        <div
                            className="fixed inset-0 z-40 lg:hidden"
                            role="dialog"
                            aria-modal="true"
                            aria-label={copy.history}
                            onKeyDown={(event) =>
                                event.key === 'Escape' && setHistoryOpen(false)
                            }
                        >
                            <div
                                className="absolute inset-0 bg-black/50"
                                onClick={() => setHistoryOpen(false)}
                            />
                            <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-border bg-card shadow-xl dark:border-white/15">
                                {historyList}
                            </aside>
                        </div>
                    )}
                    <section
                        aria-label={copy.conversation}
                        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:h-[min(72dvh,46rem)]"
                    >
                        <div
                            className="max-h-[62dvh] min-h-80 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 lg:max-h-none"
                            role="log"
                            aria-live="polite"
                            aria-relevant="additions"
                            aria-busy={busy}
                        >
                            {!messages.length && !pending && (
                                <div className="mx-auto flex max-w-2xl flex-col gap-5 py-6">
                                    <div>
                                        <h2 className="text-lg font-semibold">
                                            {copy.welcome}
                                        </h2>
                                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                            {copy.description}
                                        </p>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {copy.suggestions.map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                type="button"
                                                disabled={!configured || busy}
                                                onClick={() => {
                                                    setDraft(suggestion);
                                                    input.current?.focus();
                                                }}
                                                className="rounded-2xl border border-border px-4 py-3 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col gap-4">
                                {messages.map((message, index) => (
                                    <ChatBubble
                                        key={index}
                                        message={message}
                                        copy={copy}
                                        locale={i18n.language}
                                    />
                                ))}
                                {pendingMessage && (
                                    <>
                                        <ChatBubble
                                            message={{
                                                role: 'user',
                                                content: pendingMessage,
                                            }}
                                            copy={copy}
                                            locale={i18n.language}
                                        />
                                        <div
                                            role="status"
                                            className="flex justify-start"
                                        >
                                            <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground dark:border-white/15">
                                                <Loader2 className="size-4 animate-spin" />
                                                {copy.thinking}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div ref={bottom} />
                        </div>
                        <form
                            onSubmit={submit}
                            className="flex flex-col gap-2 border-t border-border p-3 sm:p-4"
                        >
                            {error && (
                                <p
                                    role="alert"
                                    className="flex items-center gap-2 text-sm text-destructive"
                                >
                                    <CircleAlert className="size-4 shrink-0" />
                                    {error}
                                </p>
                            )}
                            <label
                                htmlFor="assistant-message"
                                className="sr-only"
                            >
                                {copy.inputLabel}
                            </label>
                            <div className="flex items-end gap-2">
                                <Textarea
                                    ref={input}
                                    id="assistant-message"
                                    value={draft}
                                    onChange={(event) =>
                                        setDraft(event.target.value)
                                    }
                                    onKeyDown={onKeyDown}
                                    maxLength={4000}
                                    disabled={!configured || busy}
                                    placeholder={copy.placeholder}
                                    rows={1}
                                    className="max-h-40 min-h-11 resize-none rounded-2xl shadow-none"
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={
                                        !configured || busy || !draft.trim()
                                    }
                                    className="size-11 shrink-0 rounded-full"
                                    aria-label={copy.send}
                                >
                                    {pending ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <ArrowUp className="size-4" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {copy.disclaimer}
                            </p>
                        </form>
                    </section>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                    {copy.privacy}
                </p>
            </div>
            <ConfirmDialog
                open={deleteTarget !== null}
                title={copy.deleteConversation}
                message={copy.deleteConfirm}
                confirmLabel={copy.deleteConversation}
                processing={deleting}
                onClose={() => !deleting && setDeleteTarget(null)}
                onConfirm={deleteConversation}
            />
        </AdminLayout>
    );
}

function ChatBubble({
    message,
    copy,
    locale,
}: {
    message: Message;
    copy: typeof indonesian;
    locale: string;
}) {
    const assistant = message.role === 'assistant';
    const sources = (message.sources ?? []).filter(
        (source) =>
            source.url.startsWith('/admin/') && !source.url.includes('\\'),
    );

    return (
        <article
            className={cn(
                'flex min-w-0 items-end gap-2',
                assistant ? 'justify-start' : 'justify-end',
            )}
        >
            {assistant && (
                <div
                    className="mb-1 hidden size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary sm:flex"
                    aria-hidden="true"
                >
                    <Bot className="size-4" />
                </div>
            )}
            <div
                data-message-role={message.role}
                className={cn(
                    'flex max-w-[88%] min-w-0 flex-col gap-2 rounded-2xl px-4 py-2.5 shadow-xs sm:max-w-[78%]',
                    assistant
                        ? 'rounded-bl-md border border-border bg-muted/60 text-foreground dark:border-white/15'
                        : 'rounded-br-md bg-primary text-primary-foreground',
                )}
            >
                <h2 className="sr-only">{assistant ? copy.title : copy.you}</h2>
                {assistant ? (
                    <AssistantAnswer content={message.content} />
                ) : (
                    <p className="text-sm leading-6 [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {message.content}
                    </p>
                )}
                {assistant && sources.length > 0 && (
                    <div
                        className="flex flex-wrap gap-1.5 border-t border-border/70 pt-2"
                        aria-label={copy.sources}
                    >
                        {sources.map((source) => (
                            <Link
                                key={source.url}
                                href={source.url}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                                <BookOpen className="size-3 shrink-0" />
                                <span className="truncate">{source.label}</span>
                            </Link>
                        ))}
                    </div>
                )}
                {assistant && message.queriedAt && (
                    <p className="text-[11px] text-muted-foreground">
                        {copy.checkedAt}:{' '}
                        {new Date(message.queriedAt).toLocaleString(locale)}
                    </p>
                )}
            </div>
        </article>
    );
}
