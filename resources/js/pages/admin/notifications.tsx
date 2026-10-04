import { FlashMessages } from '@/components/admin/admin-kit';
import { Panel, fieldClass } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { Head, useForm } from '@inertiajs/react';
import { BellRing, History, Loader2, Send, Users } from 'lucide-react';
import { type FormEvent } from 'react';

type Audience = 'all' | 'players' | 'teachers' | 'grade';

interface SentNotification {
    id: number;
    title: string;
    body: string;
    url: string | null;
    audience: string;
    recipients: number;
    sender: string | null;
    sent_at: string | null;
}

interface Props {
    audiences: Audience[];
    counts: Record<'all' | 'players' | 'teachers', number>;
    sent: SentNotification[];
}

const AUDIENCE_LABEL: Record<Audience, string> = {
    all: 'Everyone',
    players: 'All players',
    teachers: 'Teachers',
    grade: 'One grade',
};

const GRADES = Array.from({ length: 13 }, (_, grade) => grade);

function gradeName(grade: number): string {
    return grade === 0 ? 'Kindergarten (TK)' : `Grade ${grade}`;
}

function audienceName(segment: string): string {
    const [, audience, grade] = segment.split(':');
    if (audience === 'grade' && grade !== undefined) {
        return gradeName(Number(grade));
    }
    return AUDIENCE_LABEL[audience as Audience] ?? segment;
}

export default function Notifications({ audiences, counts, sent }: Props) {
    const form = useForm<{
        title: string;
        body: string;
        url: string;
        audience: Audience;
        grade: string;
    }>({
        title: '',
        body: '',
        url: '',
        audience: 'players',
        grade: '',
    });
    const { data, setData, errors, processing } = form;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.transform((values) => ({
            ...values,
            grade: values.audience === 'grade' ? values.grade : null,
        }));
        form.post('/admin/notifications', {
            preserveScroll: true,
            onSuccess: () => form.reset('title', 'body', 'url'),
        });
    };

    return (
        <AdminLayout>
            <Head title="Notifications" />
            <div className="flex max-w-4xl flex-col gap-6">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                        <BellRing className="size-6 text-amber-500" />
                        Notifications
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Send a message to the bell in the player app. Players
                        also get automatic notifications for points, level ups,
                        shop items and the teacher role.
                    </p>
                </div>

                <FlashMessages />

                <Panel title="New notification" icon={Send}>
                    <form
                        onSubmit={submit}
                        className="flex flex-col gap-4"
                        data-testid="notification-form"
                    >
                        <label className="flex flex-col gap-1.5">
                            <span className="text-sm font-medium text-foreground">
                                Title
                            </span>
                            <input
                                name="title"
                                value={data.title}
                                maxLength={120}
                                onChange={(event) =>
                                    setData('title', event.target.value)
                                }
                                className={fieldClass}
                                data-testid="notification-title"
                                required
                            />
                            <InputError message={errors.title} />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="flex items-center justify-between text-sm font-medium text-foreground">
                                Message
                                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                                    {data.body.length}/500
                                </span>
                            </span>
                            <textarea
                                name="body"
                                value={data.body}
                                maxLength={500}
                                rows={4}
                                onChange={(event) =>
                                    setData('body', event.target.value)
                                }
                                className={`${fieldClass} h-auto py-2`}
                                data-testid="notification-body"
                                required
                            />
                            <InputError message={errors.body} />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-sm font-medium text-foreground">
                                Link (optional)
                            </span>
                            <input
                                name="url"
                                value={data.url}
                                maxLength={255}
                                placeholder="/games/crossword or https://…"
                                onChange={(event) =>
                                    setData('url', event.target.value)
                                }
                                className={fieldClass}
                                data-testid="notification-url"
                            />
                            <span className="text-xs text-muted-foreground">
                                An app page starting with / or an https:// link.
                            </span>
                            <InputError message={errors.url} />
                        </label>
                        <fieldset className="flex flex-col gap-2">
                            <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                                <Users className="size-4 text-muted-foreground" />
                                Send to
                            </legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {audiences.map((audience) => (
                                    <label
                                        key={audience}
                                        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-500/10"
                                    >
                                        <input
                                            type="radio"
                                            name="audience"
                                            value={audience}
                                            checked={data.audience === audience}
                                            onChange={() =>
                                                setData('audience', audience)
                                            }
                                            data-testid={`audience-${audience}`}
                                        />
                                        <span className="font-medium text-foreground">
                                            {AUDIENCE_LABEL[audience]}
                                        </span>
                                        {audience !== 'grade' && (
                                            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                                                {counts[audience]} users
                                            </span>
                                        )}
                                    </label>
                                ))}
                            </div>
                            {data.audience === 'grade' && (
                                <select
                                    name="grade"
                                    value={data.grade}
                                    onChange={(event) =>
                                        setData('grade', event.target.value)
                                    }
                                    className={`${fieldClass} sm:w-64`}
                                    data-testid="notification-grade"
                                    required
                                >
                                    <option value="">Choose a grade…</option>
                                    {GRADES.map((grade) => (
                                        <option key={grade} value={grade}>
                                            {gradeName(grade)}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <InputError
                                message={errors.audience ?? errors.grade}
                            />
                        </fieldset>
                        <div className="flex justify-end border-t border-border pt-4">
                            <button
                                type="submit"
                                disabled={processing}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                                data-testid="notification-send"
                            >
                                {processing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Send className="size-4" />
                                )}
                                Send notification
                            </button>
                        </div>
                    </form>
                </Panel>

                <Panel
                    title="Sent"
                    icon={History}
                    description="Latest 20 manual notifications"
                >
                    {sent.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Nothing sent yet.
                        </p>
                    ) : (
                        <ul
                            className="flex flex-col divide-y divide-border"
                            data-testid="notification-sent"
                        >
                            {sent.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex flex-col gap-1 py-3"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="font-semibold break-words text-foreground">
                                            {item.title}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {item.sent_at
                                                ? new Date(
                                                      item.sent_at,
                                                  ).toLocaleString()
                                                : ''}
                                        </span>
                                    </div>
                                    <p className="text-sm break-words text-muted-foreground">
                                        {item.body}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {audienceName(item.audience)} ·{' '}
                                        {item.recipients} recipients
                                        {item.sender
                                            ? ` · by ${item.sender}`
                                            : ''}
                                        {item.url ? ` · ${item.url}` : ''}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}
