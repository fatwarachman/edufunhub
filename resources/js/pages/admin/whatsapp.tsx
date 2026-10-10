import { ConfirmDialog, FlashMessages } from '@/components/admin/admin-kit';
import { Delta, KpiCard, timeAgo } from '@/components/admin/dashboard-kit';
import { Panel, fieldClass, formatNumber } from '@/components/admin/game-stats';
import {
    WhatsAppEventChip,
    WhatsAppLogDialog,
    type WhatsAppLogEntry,
    WhatsAppRecipient,
    WhatsAppStatusBadge,
} from '@/components/admin/whatsapp-log';
import InputError from '@/components/input-error';
import { WhatsAppIcon } from '@/components/whatsapp-share-button';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import http from '@/lib/http';
import { cn } from '@/lib/utils';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowRight,
    BellRing,
    CircleAlert,
    CircleCheck,
    Clock,
    Gauge,
    Inbox,
    KeyRound,
    Link2,
    Loader2,
    LogOut,
    QrCode,
    RefreshCw,
    RotateCcw,
    Save,
    Send,
    Smartphone,
    Users,
} from 'lucide-react';
import { type FormEvent, useCallback, useState } from 'react';

interface Connection {
    reachable: boolean;
    connected: boolean;
    logged_in: boolean;
    number: string | null;
    error: string | null;
}

interface EventSetting {
    label: string;
    description: string;
    enabled: boolean;
}

interface Stats {
    recipients: number;
    opted_out: number;
    queued: number;
    oldest_queued_at: string | null;
    sent: number;
    failed: number;
    sent_delta: number | null;
    failed_delta: number | null;
    success_rate: number | null;
    skipped: number;
    daily: { date: string; sent: number; failed: number }[];
}

interface Props {
    connection: Connection;
    settings: { enabled: boolean; events: Record<string, EventSetting> };
    deviceId: string;
    stats: Stats;
    messages: WhatsAppLogEntry[];
    errors?: Record<string, string>;
}

/** Card accents (dashboard palette), readable on light and dark cards. */
const ACCENT = {
    players: 'var(--color-bubble-blue)',
    sent: 'var(--color-bubble-green)',
    queued: 'var(--color-bubble-orange)',
    failed: 'var(--color-bubble-pink)',
    rate: '#25d366',
};

const buttonClass =
    'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50';
const primaryClass =
    'inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';

export default function WhatsAppSettings({
    connection: initialConnection,
    settings,
    deviceId,
    stats,
    messages,
    errors: pageErrors,
}: Props) {
    const [connection, setConnection] = useState(initialConnection);
    const [openId, setOpenId] = useState<number | null>(null);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const form = useForm({
        enabled: settings.enabled,
        events: Object.fromEntries(
            Object.entries(settings.events).map(([key, event]) => [
                key,
                event.enabled,
            ]),
        ) as Record<string, boolean>,
    });
    const test = useForm({ phone: '' });

    const [seenConnection, setSeenConnection] = useState(initialConnection);
    if (seenConnection !== initialConnection) {
        setSeenConnection(initialConnection);
        setConnection(initialConnection);
    }

    const save = (event: FormEvent) => {
        event.preventDefault();
        form.put('/admin/whatsapp', { preserveScroll: true });
    };

    const sendTest = (event: FormEvent) => {
        event.preventDefault();
        test.post('/admin/whatsapp/test', {
            preserveScroll: true,
            onSuccess: () => test.reset(),
        });
    };

    const linked = connection.reachable && connection.logged_in;

    return (
        <AdminLayout>
            <Head title={tr('WhatsApp Notifications')} />
            <div className="flex w-full flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                            <WhatsAppIcon className="size-6 text-[#25d366]" />
                            {tr('WhatsApp Notifications')}
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            {tr(
                                'Link a WhatsApp number through the GOWA container, then choose which automatic messages players receive.',
                            )}
                        </p>
                    </div>
                    <ConnectionBadge connection={connection} />
                </div>

                <FlashMessages errors={pageErrors} />

                {!settings.enabled && (
                    <div
                        role="alert"
                        className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-100"
                        data-testid="wa-master-off"
                    >
                        <div className="flex min-w-0 items-start gap-3">
                            <CircleAlert className="mt-0.5 size-5 shrink-0" />
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <p className="font-semibold">
                                    {tr(
                                        'WhatsApp notifications are switched off',
                                    )}
                                </p>
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    {stats.skipped > 0
                                        ? tr(
                                              'No message goes out to players. {0} message(s) were skipped in the last 7 days.',
                                              [formatNumber(stats.skipped)],
                                          )
                                        : tr(
                                              'No message goes out to players until "Send WhatsApp notifications" is turned on and saved.',
                                          )}
                                </p>
                            </div>
                        </div>
                        {stats.skipped > 0 && (
                            <Link
                                href="/admin/whatsapp/log?status=skipped"
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-amber-400 bg-white/70 px-3 text-sm font-medium text-amber-900 hover:bg-white sm:self-auto dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/70"
                                data-testid="wa-master-off-log"
                            >
                                {tr('See skipped messages')}
                                <ArrowRight className="size-4" />
                            </Link>
                        )}
                    </div>
                )}

                <div
                    className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                    data-testid="wa-stats"
                >
                    <KpiCard
                        label="Players with WhatsApp"
                        value={formatNumber(stats.recipients)}
                        icon={Users}
                        accent={ACCENT.players}
                        visual={
                            <AudienceBar
                                active={stats.recipients}
                                optedOut={stats.opted_out}
                            />
                        }
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {tr('{0} turned notifications off', [
                                    formatNumber(stats.opted_out),
                                ])}
                            </span>
                        }
                    />
                    <KpiCard
                        label="Sent · 7 days"
                        value={formatNumber(stats.sent)}
                        icon={CircleCheck}
                        accent={ACCENT.sent}
                        spark={{ data: stats.daily, dataKey: 'sent' }}
                        footer={<Delta value={stats.sent_delta} />}
                        href="/admin/whatsapp/log?status=sent"
                    />
                    <KpiCard
                        label="Failed · 7 days"
                        value={formatNumber(stats.failed)}
                        icon={CircleAlert}
                        accent={ACCENT.failed}
                        spark={{ data: stats.daily, dataKey: 'failed' }}
                        footer={
                            <Delta value={stats.failed_delta} lowerIsBetter />
                        }
                        href="/admin/whatsapp/log?status=failed"
                    />
                    <KpiCard
                        label="Delivery rate · 7 days"
                        value={
                            stats.success_rate === null
                                ? '—'
                                : `${stats.success_rate}%`
                        }
                        icon={Gauge}
                        accent={ACCENT.rate}
                        visual={<RateBar rate={stats.success_rate} />}
                        footer={
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1 text-xs',
                                    stats.queued > 0
                                        ? 'text-amber-700 dark:text-amber-300'
                                        : 'text-muted-foreground',
                                )}
                                data-testid="wa-stat-queued"
                            >
                                <Clock className="size-3.5" aria-hidden />
                                {stats.queued > 0
                                    ? tr('{0} queued, oldest {1}', [
                                          formatNumber(stats.queued),
                                          timeAgo(stats.oldest_queued_at),
                                      ])
                                    : tr('Queue is empty')}
                            </span>
                        }
                        href={
                            stats.queued > 0
                                ? '/admin/whatsapp/log?status=queued'
                                : undefined
                        }
                    />
                </div>

                <div className="grid min-w-0 gap-6 xl:grid-cols-2 xl:items-start">
                    <Panel
                        title="Sender number"
                        icon={Smartphone}
                        description="The WhatsApp account that sends every notification."
                        actions={
                            connection.reachable && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.post(
                                            '/admin/whatsapp/reconnect',
                                            {},
                                            { preserveScroll: true },
                                        )
                                    }
                                    className={buttonClass}
                                    data-testid="wa-reconnect"
                                >
                                    <RefreshCw className="size-4" />
                                    {tr('Reconnect')}
                                </button>
                            )
                        }
                    >
                        {!connection.reachable ? (
                            <div
                                role="alert"
                                className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                                data-testid="wa-unreachable"
                            >
                                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                                <div className="flex min-w-0 flex-col gap-1">
                                    <p className="font-medium">
                                        {tr('The WhatsApp service is offline')}
                                    </p>
                                    <p className="break-words text-destructive/80">
                                        {connection.error}
                                    </p>
                                </div>
                            </div>
                        ) : linked ? (
                            <div
                                className="flex flex-wrap items-center justify-between gap-4"
                                data-testid="wa-linked"
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#25d366]/15 text-[#128c4a] dark:text-[#25d366]">
                                        <WhatsAppIcon className="size-6" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-mono text-base font-semibold text-foreground">
                                            {connection.number
                                                ? `+${connection.number}`
                                                : tr('Linked')}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {connection.connected
                                                ? tr(
                                                      'Connected and ready to send',
                                                  )
                                                : tr(
                                                      'Linked, waiting for the connection',
                                                  )}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setConfirmLogout(true)}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/5"
                                    data-testid="wa-logout"
                                >
                                    <LogOut className="size-4" />
                                    {tr('Unlink number')}
                                </button>
                            </div>
                        ) : (
                            <LinkDevice
                                deviceId={deviceId}
                                onLinked={setConnection}
                            />
                        )}
                    </Panel>

                    <Panel
                        title="Automatic messages"
                        icon={BellRing}
                        description="Players receive them only when they saved a number and allow WhatsApp messages."
                    >
                        <form
                            onSubmit={save}
                            className="flex flex-col gap-4"
                            data-testid="wa-settings-form"
                        >
                            <Switch
                                checked={form.data.enabled}
                                onChange={(value) =>
                                    form.setData('enabled', value)
                                }
                                label={tr('Send WhatsApp notifications')}
                                description={
                                    linked
                                        ? tr(
                                              'Master switch for every message below.',
                                          )
                                        : tr(
                                              'No number is linked yet: messages fail until the QR code is scanned.',
                                          )
                                }
                                testId="wa-enabled"
                                strong
                            />
                            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                                {Object.entries(settings.events).map(
                                    ([key, event]) => (
                                        <li key={key} className="p-3.5">
                                            <Switch
                                                checked={form.data.events[key]}
                                                disabled={!form.data.enabled}
                                                onChange={(value) =>
                                                    form.setData('events', {
                                                        ...form.data.events,
                                                        [key]: value,
                                                    })
                                                }
                                                label={tr(event.label)}
                                                description={tr(
                                                    event.description,
                                                )}
                                                testId={`wa-event-${key}`}
                                            />
                                        </li>
                                    ),
                                )}
                            </ul>
                            <InputError message={form.errors.enabled} />
                            <div className="flex justify-end border-t border-border pt-4">
                                <button
                                    type="submit"
                                    disabled={form.processing || !form.isDirty}
                                    className={primaryClass}
                                    data-testid="wa-save"
                                >
                                    {form.processing ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Save className="size-4" />
                                    )}
                                    {tr('Save Changes')}
                                </button>
                            </div>
                        </form>
                    </Panel>
                </div>

                <Panel
                    title="Test message"
                    icon={Send}
                    description="Send a short test message to check the connection."
                >
                    <form
                        onSubmit={sendTest}
                        className="flex flex-col gap-2 sm:flex-row sm:items-start"
                        data-testid="wa-test-form"
                    >
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <input
                                type="tel"
                                inputMode="tel"
                                value={test.data.phone}
                                onChange={(event) =>
                                    test.setData('phone', event.target.value)
                                }
                                placeholder="081234567890"
                                aria-label={tr('WhatsApp number')}
                                className={`${fieldClass} w-full font-mono`}
                                data-testid="wa-test-phone"
                                required
                            />
                            <InputError message={test.errors.phone} />
                        </div>
                        <button
                            type="submit"
                            disabled={test.processing || !linked}
                            className={primaryClass}
                            data-testid="wa-test-send"
                        >
                            {test.processing ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Send className="size-4" />
                            )}
                            {tr('Send test')}
                        </button>
                    </form>
                </Panel>

                <Panel
                    title="Recent messages"
                    icon={Clock}
                    description="The latest 5 messages. Click one for the details."
                    actions={
                        <Link
                            href="/admin/whatsapp/log"
                            className={buttonClass}
                            data-testid="wa-log-link"
                        >
                            {tr('View full log')}
                            <ArrowRight className="size-4" />
                        </Link>
                    }
                >
                    {messages.length === 0 ? (
                        <div
                            className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground"
                            data-testid="wa-log-empty"
                        >
                            <Inbox className="size-8 text-muted-foreground/40" />
                            {tr('No WhatsApp messages yet.')}
                        </div>
                    ) : (
                        <ul
                            className="-mx-2 flex flex-col"
                            data-testid="wa-log"
                        >
                            {messages.map((message) => (
                                <li key={message.id}>
                                    <button
                                        type="button"
                                        onClick={() => setOpenId(message.id)}
                                        className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-nowrap"
                                        aria-label={tr('Show details: {0}', [
                                            `#${message.id}`,
                                        ])}
                                        data-testid={`wa-recent-${message.id}`}
                                    >
                                        <span className="min-w-0 flex-1 basis-40">
                                            <WhatsAppRecipient
                                                entry={message}
                                            />
                                        </span>
                                        <span className="hidden max-w-40 min-w-0 md:inline-flex">
                                            <WhatsAppEventChip
                                                entry={message}
                                            />
                                        </span>
                                        <WhatsAppStatusBadge
                                            status={message.status}
                                        />
                                        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                                            {timeAgo(
                                                message.sent_at ??
                                                    message.created_at,
                                            )}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>

            <WhatsAppLogDialog
                messageId={openId}
                onClose={() => setOpenId(null)}
            />

            <ConfirmDialog
                open={confirmLogout}
                title={tr('Unlink the WhatsApp number?')}
                message={tr(
                    'Notifications stop until a number is linked again by scanning a new QR code.',
                )}
                confirmLabel={tr('Unlink number')}
                processing={loggingOut}
                onClose={() => setConfirmLogout(false)}
                onConfirm={() =>
                    router.post(
                        '/admin/whatsapp/logout',
                        {},
                        {
                            preserveScroll: true,
                            onStart: () => setLoggingOut(true),
                            onFinish: () => {
                                setLoggingOut(false);
                                setConfirmLogout(false);
                            },
                        },
                    )
                }
            />
        </AdminLayout>
    );
}

function ConnectionBadge({ connection }: { connection: Connection }) {
    const [tone, label] = !connection.reachable
        ? [
              'border-destructive/30 bg-destructive/5 text-destructive',
              tr('Service offline'),
          ]
        : connection.logged_in
          ? [
                'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
                tr('Linked'),
            ]
          : ['border-border bg-muted text-muted-foreground', tr('Not linked')];

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                tone,
            )}
            data-testid="wa-status"
        >
            <span
                className={cn(
                    'size-2 rounded-full',
                    connection.logged_in && connection.reachable
                        ? 'bg-emerald-500'
                        : connection.reachable
                          ? 'bg-muted-foreground/50'
                          : 'bg-destructive',
                )}
                aria-hidden
            />
            {label}
        </span>
    );
}

/**
 * QR (default) or pairing-code login. While a QR is on screen the status is
 * polled so the page flips to "linked" as soon as the phone scans it.
 */
function LinkDevice({
    deviceId,
    onLinked,
}: {
    deviceId: string;
    onLinked: (connection: Connection) => void;
}) {
    const [mode, setMode] = useState<'qr' | 'code'>('qr');
    const [qr, setQr] = useState<{ image: string; expiresAt: number } | null>(
        null,
    );
    const [now, setNow] = useState(() => Date.now());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState<string | null>(null);

    const requestQr = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { data, response } = await http.post<{
            qr?: string;
            duration?: number;
            message?: string;
        }>('/admin/whatsapp/qr');
        setLoading(false);
        if (!response.ok || !data?.qr) {
            setError(data?.message ?? tr('Could not load the QR code.'));
            return;
        }
        setQr({
            image: data.qr,
            expiresAt: Date.now() + (data.duration ?? 30) * 1000,
        });
    }, []);

    const requestCode = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        const { data, response } = await http.post<{
            code?: string;
            message?: string;
            errors?: Record<string, string[]>;
        }>('/admin/whatsapp/code', { body: { phone } });
        setLoading(false);
        if (!response.ok || !data?.code) {
            setError(
                data?.errors?.phone?.[0] ??
                    data?.message ??
                    tr('Could not get a pairing code.'),
            );
            return;
        }
        setCode(data.code);
    };

    const waiting = qr !== null || code !== null;
    const expired = qr !== null && now >= qr.expiresAt;

    useVisibleInterval(
        async () => {
            setNow(Date.now());
            const { data, response } = await http.get<Connection>(
                '/admin/whatsapp/status',
            );
            if (response.ok && data?.logged_in) {
                onLinked(data);
                router.reload({ only: ['connection'] });
                return false;
            }
        },
        3000,
        waiting,
    );

    return (
        <div className="flex flex-col gap-4" data-testid="wa-link">
            <div
                role="tablist"
                aria-label={tr('Link method')}
                className="inline-flex self-start rounded-lg border border-border p-0.5"
            >
                {(
                    [
                        ['qr', QrCode, tr('Scan QR code')],
                        ['code', KeyRound, tr('Pairing code')],
                    ] as const
                ).map(([key, Icon, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={mode === key}
                        onClick={() => {
                            setMode(key);
                            setError(null);
                        }}
                        className={cn(
                            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                            mode === key
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                        data-testid={`wa-mode-${key}`}
                    >
                        <Icon className="size-4" />
                        {label}
                    </button>
                ))}
            </div>

            {mode === 'qr' ? (
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                    <div className="relative grid size-56 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-white">
                        {qr ? (
                            <img
                                src={qr.image}
                                alt={tr('WhatsApp QR code')}
                                className={cn(
                                    'size-full object-contain p-2',
                                    expired && 'opacity-15 blur-[2px]',
                                )}
                                data-testid="wa-qr"
                            />
                        ) : (
                            <QrCode className="size-16 text-muted-foreground/30" />
                        )}
                        {(expired || !qr) && (
                            <button
                                type="button"
                                onClick={requestQr}
                                disabled={loading}
                                className={cn(
                                    primaryClass,
                                    'absolute shadow-md',
                                )}
                                data-testid="wa-qr-load"
                            >
                                {loading ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="size-4" />
                                )}
                                {qr ? tr('New QR code') : tr('Show QR code')}
                            </button>
                        )}
                    </div>
                    <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                        <li>{tr('Open WhatsApp on the sender phone.')}</li>
                        <li>
                            {tr(
                                'Tap Settings or the ⋮ menu, then Linked devices.',
                            )}
                        </li>
                        <li>{tr('Tap Link a device and scan this code.')}</li>
                    </ol>
                </div>
            ) : (
                <form
                    onSubmit={requestCode}
                    className="flex flex-col gap-3"
                    data-testid="wa-code-form"
                >
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-foreground">
                            {tr('Sender WhatsApp number')}
                        </span>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                type="tel"
                                inputMode="tel"
                                value={phone}
                                onChange={(event) =>
                                    setPhone(event.target.value)
                                }
                                placeholder="081234567890"
                                className={`${fieldClass} min-w-0 flex-1 font-mono`}
                                required
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className={primaryClass}
                            >
                                {loading ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Link2 className="size-4" />
                                )}
                                {tr('Get code')}
                            </button>
                        </div>
                    </label>
                    {code && (
                        <p
                            className="self-start rounded-xl border border-border bg-muted px-4 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-foreground"
                            data-testid="wa-pair-code"
                        >
                            {code}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        {tr(
                            'On the phone: Linked devices, Link a device, Link with phone number instead, then type this code.',
                        )}
                    </p>
                </form>
            )}

            {mode === 'qr' && qr && !expired && (
                <p className="text-xs text-muted-foreground tabular-nums">
                    {tr('Code expires in {0} s', [
                        Math.max(0, Math.ceil((qr.expiresAt - now) / 1000)),
                    ])}
                </p>
            )}
            {error && (
                <p
                    role="alert"
                    className="text-sm text-destructive"
                    data-testid="wa-link-error"
                >
                    {error}
                </p>
            )}
            {waiting && !error && (
                <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {tr('Waiting for the phone…')}
                </p>
            )}
            <p className="text-xs text-muted-foreground">
                {tr('Device slot: {0}', [deviceId])}
            </p>
        </div>
    );
}

function Switch({
    checked,
    onChange,
    label,
    description,
    disabled = false,
    strong = false,
    testId,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    description?: string;
    disabled?: boolean;
    strong?: boolean;
    testId?: string;
}) {
    return (
        <label
            className={cn(
                'flex cursor-pointer items-start justify-between gap-4',
                disabled && 'cursor-not-allowed opacity-60',
            )}
        >
            <span className="flex min-w-0 flex-col gap-0.5">
                <span
                    className={cn(
                        'text-sm text-foreground',
                        strong ? 'font-semibold' : 'font-medium',
                    )}
                >
                    {label}
                </span>
                {description && (
                    <span className="text-xs text-muted-foreground">
                        {description}
                    </span>
                )}
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={cn(
                    'relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed',
                    checked && !disabled
                        ? 'bg-primary'
                        : checked
                          ? 'bg-primary/40'
                          : 'bg-input',
                )}
                data-testid={testId}
            >
                <span
                    className={cn(
                        'pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform',
                        checked ? 'translate-x-4' : 'translate-x-0',
                    )}
                />
            </button>
        </label>
    );
}

/** Share of numbers that receive messages vs. turned off. */
function AudienceBar({
    active,
    optedOut,
}: {
    active: number;
    optedOut: number;
}) {
    const total = active + optedOut;
    const share = total === 0 ? 0 : (active / total) * 100;

    return (
        <div className="flex h-full flex-col justify-center gap-1.5">
            <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <span
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                        width: `${share}%`,
                        background: ACCENT.players,
                    }}
                />
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
                {total === 0
                    ? tr('No numbers saved yet')
                    : tr('{0}% receive messages', [Math.round(share)])}
            </span>
        </div>
    );
}

/** Delivery rate as a bar that turns amber/red when it drops. */
function RateBar({ rate }: { rate: number | null }) {
    const color =
        rate === null
            ? 'var(--muted-foreground)'
            : rate >= 90
              ? ACCENT.rate
              : rate >= 70
                ? 'var(--color-bubble-orange)'
                : 'var(--color-bubble-pink)';

    return (
        <div className="flex h-full flex-col justify-center gap-1.5">
            <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <span
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${rate ?? 0}%`, background: color }}
                />
            </span>
            <span className="text-xs text-muted-foreground">
                {rate === null
                    ? tr('No messages in the last 7 days')
                    : tr('Sent out of sent + failed')}
            </span>
        </div>
    );
}
