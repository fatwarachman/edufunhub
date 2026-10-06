import InputError from '@/components/input-error';
import { SearchableSelect } from '@/components/searchable-select';
import { BackButton } from '@/components/site-nav';
import { teacherFieldClass } from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { useForm } from '@inertiajs/react';
import {
    Bug,
    CircleCheck,
    CircleHelp,
    Gamepad2,
    Inbox,
    Lightbulb,
    Loader2,
    type LucideIcon,
    MessageSquarePlus,
    Send,
    UserRoundCog,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';

type FeedbackType =
    'bug' | 'feature' | 'question' | 'content' | 'account' | 'other';

interface HistoryItem {
    id: number;
    type: string;
    status: string;
    message: string;
    game: string | null;
    created_at: string | null;
    updated_at: string | null;
}

interface FeedbackPageProps {
    types: FeedbackType[];
    games: { key: string; titleKey: string }[];
    referrer: string | null;
    history: HistoryItem[];
}

const MAX_LENGTH = 2000;
const MIN_LENGTH = 10;

const TYPE_ICONS: Record<FeedbackType, LucideIcon> = {
    bug: Bug,
    feature: Lightbulb,
    question: CircleHelp,
    content: Gamepad2,
    account: UserRoundCog,
    other: MessageSquarePlus,
};

const TYPE_ACCENTS: Record<FeedbackType, string> = {
    bug: '#ffd1d9',
    feature: '#fff1b8',
    question: '#d9d2ff',
    content: '#c8f1e4',
    account: '#cfe6ff',
    other: '#f1e7d2',
};

const STATUS_STYLES: Record<string, string> = {
    new: 'bg-[#cfe6ff]',
    in_progress: 'bg-[#fff1b8]',
    resolved: 'bg-[#c8f1e4]',
    dismissed: 'bg-[#ece7dc]',
};

const KNOWN_TYPES = new Set<string>([
    'bug',
    'feature',
    'question',
    'content',
    'account',
    'other',
]);

export default function FeedbackPage({
    types,
    games,
    referrer,
    history,
}: FeedbackPageProps) {
    const { t, i18n } = useTranslations();
    const [sent, setSent] = useState(false);
    const form = useForm({
        type: '' as FeedbackType | '',
        game: '',
        message: '',
        page_url: referrer ?? '',
        may_contact: false,
    });
    const { data, setData, errors, processing } = form;
    const length = data.message.trim().length;

    const dateFormat = useMemo(
        () =>
            new Intl.DateTimeFormat(
                i18n.language === 'en' ? 'en-GB' : 'id-ID',
                {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                },
            ),
        [i18n.language],
    );

    const gameTitle = (key: string | null) => {
        const game = games.find((item) => item.key === key);
        return game ? t(game.titleKey) : key;
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/feedback', {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                setData((current) => ({ ...current, page_url: '' }));
                setSent(true);
            },
        });
    };

    return (
        <PlayerLayout title={t('feedback.title')}>
            <div className="flex flex-col items-start gap-3">
                <BackButton href="/portal" label={t('nav.backToPortal')} />
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                        {t('feedback.title')}
                    </h1>
                    <p className="max-w-2xl text-sm text-[#4b5268] md:text-base">
                        {t('feedback.intro')}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
                {sent ? (
                    <section
                        className="auth-card flex min-w-0 flex-col items-start gap-4 !bg-[#eafaf3] !p-6"
                        role="status"
                        data-testid="feedback-success"
                    >
                        <span className="grid size-12 place-items-center rounded-xl border-2 border-[#151b2e] bg-[#1aab8a] text-white">
                            <CircleCheck
                                className="size-6"
                                aria-hidden="true"
                            />
                        </span>
                        <div className="flex flex-col gap-1">
                            <h2 className="text-xl font-bold">
                                {t('feedback.success.title')}
                            </h2>
                            <p className="text-sm text-[#4b5268]">
                                {t('feedback.success.body')}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="edu-nav-btn"
                            onClick={() => setSent(false)}
                            data-testid="feedback-again"
                        >
                            <MessageSquarePlus aria-hidden="true" />
                            <span>{t('feedback.success.again')}</span>
                        </button>
                    </section>
                ) : (
                    <form
                        onSubmit={submit}
                        className="auth-card flex min-w-0 flex-col gap-6 !p-5 md:!p-6"
                        noValidate
                        data-testid="feedback-form"
                    >
                        <fieldset className="flex min-w-0 flex-col gap-3">
                            <legend className="mb-3 text-base font-bold">
                                {t('feedback.form.type')}
                            </legend>
                            <div
                                className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 xl:grid-cols-3"
                                role="radiogroup"
                                aria-label={t('feedback.form.type')}
                            >
                                {types.map((type) => {
                                    const Icon = TYPE_ICONS[type];
                                    const selected = data.type === type;
                                    return (
                                        <button
                                            key={type}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() =>
                                                setData('type', type)
                                            }
                                            className={`flex min-h-16 min-w-0 items-center gap-3 rounded-xl border-2 border-[#151b2e] p-3 text-left transition-[background-color,box-shadow,transform] ${
                                                selected
                                                    ? 'bg-[#fff4d6] shadow-[3px_3px_0_#151b2e]'
                                                    : 'bg-white hover:bg-[#faf7ef]'
                                            }`}
                                            data-testid={`feedback-type-${type}`}
                                        >
                                            <span
                                                className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-[#151b2e] text-[#151b2e]"
                                                style={{
                                                    background:
                                                        TYPE_ACCENTS[type],
                                                }}
                                            >
                                                <Icon
                                                    className="size-5"
                                                    aria-hidden="true"
                                                />
                                            </span>
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="text-sm font-bold">
                                                    {t(
                                                        `feedback.types.${type}.label`,
                                                    )}
                                                </span>
                                                <span className="line-clamp-2 text-xs text-[#4b5268]">
                                                    {t(
                                                        `feedback.types.${type}.hint`,
                                                    )}
                                                </span>
                                            </span>
                                            <CircleCheck
                                                aria-hidden="true"
                                                className={`size-5 shrink-0 ${
                                                    selected
                                                        ? 'text-[#1aab8a]'
                                                        : 'text-transparent'
                                                }`}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                            <InputError message={errors.type} />
                        </fieldset>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <label
                                    htmlFor="feedback-game"
                                    className="text-sm font-bold"
                                >
                                    {t('feedback.form.game')}{' '}
                                    <span className="font-medium text-[#4b5268]">
                                        {t('feedback.form.optional')}
                                    </span>
                                </label>
                                <SearchableSelect
                                    id="feedback-game"
                                    value={data.game}
                                    onChange={(value) => setData('game', value)}
                                    options={[
                                        {
                                            value: '',
                                            label: t('feedback.form.noGame'),
                                        },
                                        ...games
                                            .map((game) => ({
                                                value: game.key,
                                                label: t(game.titleKey),
                                            }))
                                            .sort((a, b) =>
                                                a.label.localeCompare(
                                                    b.label,
                                                    i18n.language,
                                                ),
                                            ),
                                    ]}
                                    placeholder={t('feedback.form.noGame')}
                                    searchPlaceholder={t(
                                        'feedback.form.gameSearch',
                                    )}
                                    emptyText={t('feedback.form.gameEmpty')}
                                    clearLabel={t('feedback.form.gameClear')}
                                    className={teacherFieldClass}
                                    testId="feedback-game"
                                />
                                <InputError message={errors.game} />
                            </div>
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <label
                                    htmlFor="feedback-page"
                                    className="text-sm font-bold"
                                >
                                    {t('feedback.form.page')}{' '}
                                    <span className="font-medium text-[#4b5268]">
                                        {t('feedback.form.optional')}
                                    </span>
                                </label>
                                <input
                                    id="feedback-page"
                                    type="text"
                                    value={data.page_url}
                                    maxLength={255}
                                    onChange={(event) =>
                                        setData('page_url', event.target.value)
                                    }
                                    placeholder={t(
                                        'feedback.form.pagePlaceholder',
                                    )}
                                    className={`${teacherFieldClass} !min-h-11 !bg-white font-medium`}
                                    data-testid="feedback-page"
                                />
                                <InputError message={errors.page_url} />
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label
                                htmlFor="feedback-message"
                                className="text-sm font-bold"
                            >
                                {t('feedback.form.message')}
                            </label>
                            <textarea
                                id="feedback-message"
                                value={data.message}
                                maxLength={MAX_LENGTH}
                                rows={6}
                                onChange={(event) =>
                                    setData('message', event.target.value)
                                }
                                placeholder={t(
                                    'feedback.form.messagePlaceholder',
                                )}
                                aria-describedby="feedback-message-count"
                                className={`${teacherFieldClass} resize-y py-3 font-medium`}
                                data-testid="feedback-message"
                            />
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <InputError message={errors.message} />
                                <p
                                    id="feedback-message-count"
                                    className={`ml-auto text-xs font-semibold tabular-nums ${
                                        length > 0 && length < MIN_LENGTH
                                            ? 'text-[#b23a52]'
                                            : 'text-[#4b5268]'
                                    }`}
                                    data-testid="feedback-counter"
                                >
                                    {t('feedback.form.counter', {
                                        count: data.message.length,
                                        max: MAX_LENGTH,
                                    })}
                                </p>
                            </div>
                        </div>

                        <label className="inline-flex min-h-11 items-start gap-3 text-sm font-semibold">
                            <input
                                type="checkbox"
                                className="mt-0.5 size-5 shrink-0 accent-[#6c5ce7]"
                                checked={data.may_contact}
                                onChange={(event) =>
                                    setData('may_contact', event.target.checked)
                                }
                                data-testid="feedback-contact"
                            />
                            <span className="flex flex-col">
                                {t('feedback.form.mayContact')}
                                <span className="text-xs font-medium text-[#4b5268]">
                                    {t('feedback.form.mayContactHint')}
                                </span>
                            </span>
                        </label>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={processing}
                                className="inline-flex w-full items-center justify-center gap-2 px-6 font-bold disabled:cursor-wait disabled:opacity-70 sm:w-auto"
                                data-testid="feedback-submit"
                            >
                                {processing ? (
                                    <Loader2
                                        className="size-4 animate-spin"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Send
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                )}
                                {processing
                                    ? t('feedback.form.sending')
                                    : t('feedback.form.submit')}
                            </button>
                        </div>
                    </form>
                )}

                <section
                    className="auth-card flex min-w-0 flex-col gap-4 !p-5"
                    aria-labelledby="feedback-history-title"
                    data-testid="feedback-history"
                >
                    <div className="flex items-center justify-between gap-2">
                        <h2
                            id="feedback-history-title"
                            className="text-lg font-bold"
                        >
                            {t('feedback.history.title')}
                        </h2>
                        {history.length > 0 && (
                            <span className="rounded-full border-2 border-[#151b2e] bg-white px-2.5 py-0.5 text-xs font-bold tabular-nums">
                                {history.length}
                            </span>
                        )}
                    </div>
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#151b2e]/40 px-4 py-8 text-center">
                            <Inbox
                                className="size-7 text-[#4b5268]"
                                aria-hidden="true"
                            />
                            <p className="text-sm font-semibold text-[#4b5268]">
                                {t('feedback.history.empty')}
                            </p>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {history.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex min-w-0 flex-col gap-2 rounded-xl border-2 border-[#151b2e] bg-[#faf7ef] p-3"
                                    data-testid="feedback-history-item"
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-bold">
                                            {KNOWN_TYPES.has(item.type)
                                                ? t(
                                                      `feedback.types.${item.type}.label`,
                                                  )
                                                : t(
                                                      'feedback.types.other.label',
                                                  )}
                                        </span>
                                        <span
                                            className={`ml-auto rounded-full border-2 border-[#151b2e] px-2 py-0.5 text-[11px] font-bold ${
                                                STATUS_STYLES[item.status] ??
                                                'bg-white'
                                            }`}
                                            data-testid="feedback-history-status"
                                        >
                                            {t(
                                                `feedback.status.${item.status in STATUS_STYLES ? item.status : 'new'}`,
                                            )}
                                        </span>
                                    </div>
                                    <p className="line-clamp-3 text-sm break-words text-[#151b2e]">
                                        {item.message}
                                    </p>
                                    <p className="text-xs text-[#4b5268]">
                                        {item.created_at
                                            ? dateFormat.format(
                                                  new Date(item.created_at),
                                              )
                                            : ''}
                                        {item.game
                                            ? ` · ${gameTitle(item.game)}`
                                            : ''}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </PlayerLayout>
    );
}
