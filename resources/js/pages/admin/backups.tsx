import { ConfirmDialog, FlashMessages } from '@/components/admin/admin-kit';
import { KpiCard } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    Panel,
    fieldClass,
    formatDateTime,
    formatDuration,
} from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import { ResponsiveTable } from '@/components/responsive-table';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, router, useForm } from '@inertiajs/react';
import {
    CalendarClock,
    CircleCheck,
    DatabaseBackup,
    Download,
    HardDrive,
    Layers,
    Loader2,
    PlugZap,
    Save,
    Server,
    Trash2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

type Destination = 'local' | 'ftp' | 'both';
type BackupStatus = 'running' | 'success' | 'failed';

interface Backup {
    id: number;
    filename: string;
    size_bytes: number | null;
    checksum: string | null;
    destination: Destination;
    status: BackupStatus;
    local_kept: boolean;
    remote_uploaded: boolean;
    remote_path: string | null;
    error: string | null;
    trigger: 'manual' | 'scheduled';
    created_by: { id: number; name: string } | null;
    started_at: string | null;
    finished_at: string | null;
    duration_seconds: number | null;
}

interface Settings {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    time: string;
    weekday: number;
    destination: Destination;
    keep: number;
    ftp_host: string;
    ftp_port: number;
    ftp_username: string;
    ftp_directory: string;
    ftp_tls: boolean;
    ftp_passive: boolean;
    has_ftp_password: boolean;
}

interface Props {
    settings: Settings;
    backups: Backup[];
    stats: {
        count: number;
        local_bytes: number;
        last_success_at: string | null;
        next_run_at: string | null;
        running: boolean;
    };
    timezone: string;
    errors?: Record<string, string>;
}

const DESTINATIONS: { value: Destination; label: string }[] = [
    { value: 'local', label: 'Local server' },
    { value: 'ftp', label: 'FTP server' },
    { value: 'both', label: 'Local + FTP' },
];

const WEEKDAYS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];

const STATUS_TONE: Record<BackupStatus, string> = {
    running: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    success:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_LABEL: Record<BackupStatus, string> = {
    running: 'Running',
    success: 'Success',
    failed: 'Failed',
};

function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function destinationLabel(destination: Destination): string {
    return tr(
        DESTINATIONS.find((d) => d.value === destination)?.label ?? destination,
    );
}

function BackupStatusPill({ status }: { status: BackupStatus }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                STATUS_TONE[status],
            )}
        >
            {status === 'running' && (
                <Loader2 className="size-3 animate-spin" />
            )}
            {tr(STATUS_LABEL[status])}
        </span>
    );
}

function Field({
    label,
    hint,
    error,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
                {tr(label)}
            </span>
            {children}
            {hint && (
                <span className="text-xs text-muted-foreground">
                    {tr(hint)}
                </span>
            )}
            <InputError message={error} />
        </label>
    );
}

function Toggle({
    checked,
    onChange,
    label,
    testId,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
    testId?: string;
}) {
    return (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="size-4 rounded border-input accent-primary"
                data-testid={testId}
            />
            {tr(label)}
        </label>
    );
}

export default function Backups({
    settings,
    backups,
    stats,
    timezone,
    errors: pageErrors,
}: Props) {
    const [destination, setDestination] = useState<Destination>(
        settings.destination,
    );
    const [starting, setStarting] = useState(false);
    const [testing, setTesting] = useState(false);
    const [toDelete, setToDelete] = useState<Backup | null>(null);
    const [deleteRemote, setDeleteRemote] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const form = useForm({
        enabled: settings.enabled,
        frequency: settings.frequency,
        time: settings.time,
        weekday: settings.weekday,
        destination: settings.destination,
        keep: settings.keep,
        ftp_host: settings.ftp_host,
        ftp_port: settings.ftp_port,
        ftp_username: settings.ftp_username,
        ftp_password: '',
        ftp_directory: settings.ftp_directory,
        ftp_tls: settings.ftp_tls,
        ftp_passive: settings.ftp_passive,
    });

    useVisibleInterval(
        () => {
            router.reload({ only: ['backups', 'stats'] });
        },
        3000,
        stats.running,
    );

    const startBackup = () => {
        router.post(
            '/admin/backups',
            { destination },
            {
                preserveScroll: true,
                onStart: () => setStarting(true),
                onFinish: () => setStarting(false),
            },
        );
    };

    const saveSettings = (event: FormEvent) => {
        event.preventDefault();
        form.put('/admin/backups/settings', {
            preserveScroll: true,
            onSuccess: () => form.setData('ftp_password', ''),
        });
    };

    const testFtp = () => {
        router.post(
            '/admin/backups/test-ftp',
            {},
            {
                preserveScroll: true,
                onStart: () => setTesting(true),
                onFinish: () => setTesting(false),
            },
        );
    };

    const confirmDelete = () => {
        if (!toDelete) return;
        router.delete(`/admin/backups/${toDelete.id}`, {
            data: { remote: deleteRemote },
            preserveScroll: true,
            onStart: () => setDeleting(true),
            onFinish: () => {
                setDeleting(false);
                setToDelete(null);
                setDeleteRemote(false);
            },
        });
    };

    const ftpNeeded = form.data.destination !== 'local';

    return (
        <AdminLayout>
            <Head title={tr('Database Backups')} />
            <div className="flex w-full min-w-0 flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                            <DatabaseBackup className="size-6 text-sky-500" />
                            {tr('Database Backups')}
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            {tr(
                                'Full backup of every table (structure + data) as a gzip SQL file, kept on this server and/or sent to an FTP server.',
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={destination}
                            onChange={(event) =>
                                setDestination(
                                    event.target.value as Destination,
                                )
                            }
                            className={fieldClass}
                            aria-label={tr('Backup destination')}
                            data-testid="backup-destination"
                        >
                            {DESTINATIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {tr(option.label)}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={startBackup}
                            disabled={starting || stats.running}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            data-testid="backup-now"
                        >
                            {starting || stats.running ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <DatabaseBackup className="size-4" />
                            )}
                            {stats.running
                                ? tr('Backup running…')
                                : tr('Backup now')}
                        </button>
                    </div>
                </div>

                <FlashMessages errors={pageErrors} />

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        label="Last successful backup"
                        value={
                            <span className="text-lg">
                                {formatDateTime(stats.last_success_at)}
                            </span>
                        }
                        icon={CircleCheck}
                        accent="#10b981"
                    />
                    <KpiCard
                        label="Stored on this server"
                        value={formatBytes(stats.local_bytes)}
                        icon={HardDrive}
                        accent="#0ea5e9"
                    />
                    <KpiCard
                        label="Next scheduled backup"
                        value={
                            <span className="text-lg">
                                {stats.next_run_at
                                    ? formatDateTime(stats.next_run_at)
                                    : tr('Schedule off')}
                            </span>
                        }
                        icon={CalendarClock}
                        accent="#8b5cf6"
                    />
                    <KpiCard
                        label="Successful backups"
                        value={stats.count}
                        icon={Layers}
                        accent="#f59e0b"
                    />
                </div>

                <Panel
                    title="Backup history"
                    description="Newest first. Download needs a copy on this server; older copies are removed by the retention setting."
                    icon={DatabaseBackup}
                >
                    <ResponsiveTable
                        testId="backup-table"
                        rows={backups}
                        rowKey={(backup) => backup.id}
                        empty={
                            <EmptyState
                                icon={DatabaseBackup}
                                title="No backups yet"
                                description="Press “Backup now” or turn on the schedule below."
                            />
                        }
                        columns={[
                            {
                                key: 'file',
                                header: tr('File'),
                                primary: true,
                                cellClassName: 'max-w-72',
                                cell: (backup) => (
                                    <span
                                        className="flex min-w-0 flex-col"
                                        data-testid="backup-row"
                                        data-id={backup.id}
                                    >
                                        <span className="truncate font-mono text-xs text-foreground">
                                            {backup.filename}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDateTime(backup.started_at)}
                                        </span>
                                    </span>
                                ),
                            },
                            {
                                key: 'status',
                                header: tr('Status'),
                                summary: true,
                                cell: (backup) => (
                                    <BackupStatusPill status={backup.status} />
                                ),
                            },
                            {
                                key: 'size',
                                header: tr('Size'),
                                summary: true,
                                align: 'right',
                                cellClassName: 'tabular-nums whitespace-nowrap',
                                cell: (backup) =>
                                    formatBytes(backup.size_bytes),
                            },
                            {
                                key: 'destination',
                                header: tr('Destination'),
                                cell: (backup) => (
                                    <span className="flex flex-col text-xs">
                                        <span className="text-foreground">
                                            {destinationLabel(
                                                backup.destination,
                                            )}
                                        </span>
                                        <span className="text-muted-foreground">
                                            {[
                                                backup.local_kept &&
                                                    tr('Local copy'),
                                                backup.remote_uploaded &&
                                                    tr('On FTP'),
                                            ]
                                                .filter(Boolean)
                                                .join(' · ') || '—'}
                                        </span>
                                    </span>
                                ),
                            },
                            {
                                key: 'trigger',
                                header: tr('Trigger'),
                                cell: (backup) => (
                                    <span className="text-xs text-muted-foreground">
                                        {backup.trigger === 'scheduled'
                                            ? tr('Scheduled')
                                            : backup.created_by
                                              ? tr('Manual · {0}', [
                                                    backup.created_by.name,
                                                ])
                                              : tr('Manual')}
                                    </span>
                                ),
                            },
                            {
                                key: 'duration',
                                header: tr('Duration'),
                                cellClassName: 'tabular-nums whitespace-nowrap',
                                cell: (backup) =>
                                    formatDuration(backup.duration_seconds),
                            },
                            {
                                key: 'error',
                                header: tr('Note'),
                                cellClassName: 'max-w-64',
                                cell: (backup) =>
                                    backup.error ? (
                                        <span className="text-xs break-words text-red-700 dark:text-red-300">
                                            {backup.error}
                                        </span>
                                    ) : backup.checksum ? (
                                        <span
                                            className="font-mono text-[11px] break-all text-muted-foreground"
                                            title={backup.checksum}
                                        >
                                            SHA-256{' '}
                                            {backup.checksum.slice(0, 12)}…
                                        </span>
                                    ) : (
                                        '—'
                                    ),
                            },
                            {
                                key: 'actions',
                                header: (
                                    <span className="sr-only">
                                        {tr('Actions')}
                                    </span>
                                ),
                                hideInAccordion: true,
                                align: 'right',
                                cell: (backup) => (
                                    <BackupActions
                                        backup={backup}
                                        onDelete={setToDelete}
                                    />
                                ),
                            },
                        ]}
                        actions={(backup) => (
                            <BackupActions
                                backup={backup}
                                onDelete={setToDelete}
                            />
                        )}
                    />
                </Panel>

                <form
                    onSubmit={saveSettings}
                    className="grid min-w-0 gap-6 xl:grid-cols-2"
                    data-testid="backup-settings-form"
                >
                    <Panel
                        title="Automatic backup"
                        description="The scheduler checks every minute and runs one backup per slot."
                        icon={CalendarClock}
                    >
                        <div className="flex flex-col gap-5">
                            <Toggle
                                checked={form.data.enabled}
                                onChange={(value) =>
                                    form.setData('enabled', value)
                                }
                                label="Run backups automatically"
                                testId="backup-enabled"
                            />
                            <div className="grid gap-5 sm:grid-cols-2">
                                <Field
                                    label="Frequency"
                                    error={form.errors.frequency}
                                >
                                    <select
                                        value={form.data.frequency}
                                        onChange={(event) =>
                                            form.setData(
                                                'frequency',
                                                event.target
                                                    .value as Settings['frequency'],
                                            )
                                        }
                                        className={fieldClass}
                                    >
                                        <option value="daily">
                                            {tr('Daily')}
                                        </option>
                                        <option value="weekly">
                                            {tr('Weekly')}
                                        </option>
                                    </select>
                                </Field>
                                <Field
                                    label="Time"
                                    hint={tr('Server time zone: {0}', [
                                        timezone,
                                    ])}
                                    error={form.errors.time}
                                >
                                    <input
                                        type="time"
                                        value={form.data.time}
                                        onChange={(event) =>
                                            form.setData(
                                                'time',
                                                event.target.value,
                                            )
                                        }
                                        className={fieldClass}
                                        required
                                    />
                                </Field>
                                {form.data.frequency === 'weekly' && (
                                    <Field
                                        label="Day of the week"
                                        error={form.errors.weekday}
                                    >
                                        <select
                                            value={form.data.weekday}
                                            onChange={(event) =>
                                                form.setData(
                                                    'weekday',
                                                    Number(event.target.value),
                                                )
                                            }
                                            className={fieldClass}
                                        >
                                            {WEEKDAYS.map((day, index) => (
                                                <option key={day} value={index}>
                                                    {tr(day)}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                )}
                                <Field
                                    label="Destination"
                                    error={form.errors.destination}
                                >
                                    <select
                                        value={form.data.destination}
                                        onChange={(event) =>
                                            form.setData(
                                                'destination',
                                                event.target
                                                    .value as Destination,
                                            )
                                        }
                                        className={fieldClass}
                                    >
                                        {DESTINATIONS.map((option) => (
                                            <option
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {tr(option.label)}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="Backups to keep"
                                    hint="Applies on this server and in the FTP folder."
                                    error={form.errors.keep}
                                >
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={form.data.keep}
                                        onChange={(event) =>
                                            form.setData(
                                                'keep',
                                                Number(event.target.value),
                                            )
                                        }
                                        className={fieldClass}
                                        required
                                    />
                                </Field>
                            </div>
                        </div>
                    </Panel>

                    <Panel
                        title="FTP server"
                        description="The password is stored encrypted and never shown again."
                        icon={Server}
                        actions={
                            <button
                                type="button"
                                onClick={testFtp}
                                disabled={testing}
                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                                data-testid="backup-test-ftp"
                            >
                                {testing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <PlugZap className="size-4" />
                                )}
                                {tr('Test connection')}
                            </button>
                        }
                    >
                        <div className="flex flex-col gap-5">
                            {ftpNeeded && (
                                <p className="text-xs text-muted-foreground">
                                    {tr(
                                        'Required because the destination includes FTP.',
                                    )}
                                </p>
                            )}
                            <div className="grid gap-5 sm:grid-cols-[1fr_7rem]">
                                <Field
                                    label="Host"
                                    error={form.errors.ftp_host}
                                >
                                    <input
                                        type="text"
                                        value={form.data.ftp_host}
                                        onChange={(event) =>
                                            form.setData(
                                                'ftp_host',
                                                event.target.value,
                                            )
                                        }
                                        placeholder="ftp.example.com"
                                        className={`${fieldClass} font-mono`}
                                        autoComplete="off"
                                    />
                                </Field>
                                <Field
                                    label="Port"
                                    error={form.errors.ftp_port}
                                >
                                    <input
                                        type="number"
                                        min={1}
                                        max={65535}
                                        value={form.data.ftp_port}
                                        onChange={(event) =>
                                            form.setData(
                                                'ftp_port',
                                                Number(event.target.value),
                                            )
                                        }
                                        className={fieldClass}
                                    />
                                </Field>
                            </div>
                            <div className="grid gap-5 sm:grid-cols-2">
                                <Field
                                    label="Username"
                                    error={form.errors.ftp_username}
                                >
                                    <input
                                        type="text"
                                        value={form.data.ftp_username}
                                        onChange={(event) =>
                                            form.setData(
                                                'ftp_username',
                                                event.target.value,
                                            )
                                        }
                                        className={fieldClass}
                                        autoComplete="off"
                                    />
                                </Field>
                                <Field
                                    label="Password"
                                    error={form.errors.ftp_password}
                                >
                                    <input
                                        type="password"
                                        value={form.data.ftp_password}
                                        onChange={(event) =>
                                            form.setData(
                                                'ftp_password',
                                                event.target.value,
                                            )
                                        }
                                        placeholder={
                                            settings.has_ftp_password
                                                ? tr(
                                                      'Saved. Leave empty to keep it.',
                                                  )
                                                : ''
                                        }
                                        className={fieldClass}
                                        autoComplete="new-password"
                                        data-testid="backup-ftp-password"
                                    />
                                </Field>
                            </div>
                            <Field
                                label="Remote folder"
                                hint="Created when missing. Leave empty for the login folder."
                                error={form.errors.ftp_directory}
                            >
                                <input
                                    type="text"
                                    value={form.data.ftp_directory}
                                    onChange={(event) =>
                                        form.setData(
                                            'ftp_directory',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="backups/edufunhub"
                                    className={`${fieldClass} font-mono`}
                                />
                            </Field>
                            <div className="flex flex-wrap gap-x-6 gap-y-3">
                                <Toggle
                                    checked={form.data.ftp_tls}
                                    onChange={(value) =>
                                        form.setData('ftp_tls', value)
                                    }
                                    label="Use TLS (explicit FTPS)"
                                />
                                <Toggle
                                    checked={form.data.ftp_passive}
                                    onChange={(value) =>
                                        form.setData('ftp_passive', value)
                                    }
                                    label="Passive mode"
                                />
                            </div>
                            {settings.has_ftp_password && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.delete(
                                            '/admin/backups/ftp-password',
                                            { preserveScroll: true },
                                        )
                                    }
                                    className="self-start text-xs font-medium text-red-700 hover:underline dark:text-red-300"
                                >
                                    {tr('Remove saved password')}
                                </button>
                            )}
                        </div>
                    </Panel>

                    <div className="flex justify-end xl:col-span-2">
                        <button
                            type="submit"
                            disabled={form.processing}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            data-testid="backup-save-settings"
                        >
                            {form.processing ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Save className="size-4" />
                            )}
                            {tr('Save settings')}
                        </button>
                    </div>
                </form>
            </div>

            <ConfirmDialog
                open={toDelete !== null}
                title="Delete backup?"
                message={
                    <div className="flex flex-col gap-3">
                        <p>
                            {tr(
                                'The file {0} is removed from this server. This cannot be undone.',
                                [toDelete?.filename ?? ''],
                            )}
                        </p>
                        {toDelete?.remote_uploaded && (
                            <Toggle
                                checked={deleteRemote}
                                onChange={setDeleteRemote}
                                label="Also delete the copy on the FTP server"
                            />
                        )}
                    </div>
                }
                confirmLabel={tr('Delete')}
                tone="danger"
                processing={deleting}
                onClose={() => {
                    setToDelete(null);
                    setDeleteRemote(false);
                }}
                onConfirm={confirmDelete}
            />
        </AdminLayout>
    );
}

function BackupActions({
    backup,
    onDelete,
}: {
    backup: Backup;
    onDelete: (backup: Backup) => void;
}) {
    return (
        <div className="flex items-center justify-end gap-1">
            {backup.local_kept && backup.status === 'success' && (
                <a
                    href={`/admin/backups/${backup.id}/download`}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={tr('Download')}
                    title={tr('Download')}
                    data-testid="backup-download"
                >
                    <Download className="size-4" />
                </a>
            )}
            {backup.status !== 'running' && (
                <button
                    type="button"
                    onClick={() => onDelete(backup)}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                    aria-label={tr('Delete')}
                    title={tr('Delete')}
                    data-testid="backup-delete"
                >
                    <Trash2 className="size-4" />
                </button>
            )}
        </div>
    );
}
