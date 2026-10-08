import { Google } from '@/components/brand-icons';
import InputError from '@/components/input-error';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import {
    PlayerDetailsCard,
    type PlayerDetails,
} from '@/components/player-details-card';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { gradeLabel, hasGrade } from '@/lib/grade';
import { questionLevelKey } from '@/lib/question-levels';
import { Link, useForm } from '@inertiajs/react';
import {
    CalendarDays,
    Coins,
    Eye,
    EyeOff,
    Gamepad2,
    KeyRound,
    Mail,
    ShieldCheck,
    Star,
    Trophy,
    UserRound,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

interface ProfileProps {
    account: {
        name: string;
        email: string;
        email_verified: boolean;
        joined_at: string | null;
        last_seen_at: string | null;
        password_updated_at: string | null;
        roles: { name: string; slug: string }[];
        connected: {
            provider: string;
            email: string | null;
            linked_at: string | null;
        }[];
    };
    player: PlayerDetails & {
        nickname: string | null;
        grade: number | null;
        question_level: number;
        age: number | null;
        character: CharacterData | null;
    };
    stats: {
        points: number;
        level: number;
        rank: number | null;
        games: number;
    };
    needsCurrentPassword: boolean;
}

const CARD = 'auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5';
const FIELD =
    'min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold disabled:opacity-60';

/** The player's own profile: account, player details and password. */
export default function Profile({
    account,
    player,
    stats,
    needsCurrentPassword,
}: ProfileProps) {
    const { t, i18n } = useTranslations();
    const number = new Intl.NumberFormat(i18n.language);
    const date = (value: string | null) =>
        value
            ? new Intl.DateTimeFormat(i18n.language, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
              }).format(new Date(value))
            : '—';
    const displayName = player.nickname || account.name;

    return (
        <PlayerLayout title={t('profile.title')}>
            <section
                className="auth-card grid min-w-0 items-center gap-5 !bg-[#fff4d6] !p-4 sm:!p-6 md:grid-cols-[160px_minmax(0,1fr)]"
                aria-labelledby="profile-title"
                data-testid="profile-hero"
            >
                <div className="mx-auto w-32 md:w-full">
                    {player.character ? (
                        <PlayerCharacter character={player.character} />
                    ) : (
                        <span className="grid aspect-square place-items-center rounded-2xl border-2 border-[#151b2e] bg-white">
                            <UserRound className="size-12" aria-hidden />
                        </span>
                    )}
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="min-w-0">
                        <h1
                            id="profile-title"
                            className="text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl"
                        >
                            {displayName}
                        </h1>
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[#151b2e]/75">
                            <Mail className="size-4 shrink-0" aria-hidden />
                            <span className="truncate">{account.email}</span>
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat
                            icon={<Coins className="size-4" aria-hidden />}
                            label={t('profile.stats.points')}
                            value={number.format(stats.points)}
                            testId="profile-points"
                        />
                        <Stat
                            icon={<Star className="size-4" aria-hidden />}
                            label={t('profile.stats.level')}
                            value={number.format(stats.level)}
                        />
                        <Stat
                            icon={<Trophy className="size-4" aria-hidden />}
                            label={t('profile.stats.rank')}
                            value={
                                stats.rank
                                    ? `#${number.format(stats.rank)}`
                                    : '—'
                            }
                        />
                        <Stat
                            icon={<Gamepad2 className="size-4" aria-hidden />}
                            label={t('profile.stats.games')}
                            value={number.format(stats.games)}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Link
                            href="/character"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#151b2e] bg-white px-4 text-sm font-bold shadow-[2px_2px_0_#151b2e] hover:bg-[#fff9e6]"
                        >
                            <UserRound className="size-4" aria-hidden />
                            {t('profile.editCharacter')}
                        </Link>
                        <Link
                            href="/dashboard"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#151b2e] bg-white px-4 text-sm font-bold shadow-[2px_2px_0_#151b2e] hover:bg-[#fff9e6]"
                        >
                            <Trophy className="size-4" aria-hidden />
                            {t('profile.openDashboard')}
                        </Link>
                    </div>
                </div>
            </section>

            <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
                <div className="flex min-w-0 flex-col gap-6">
                    <AccountCard account={account} />
                    <PasswordCard
                        needsCurrent={needsCurrentPassword}
                        changedAt={account.password_updated_at}
                        dateLabel={date(account.password_updated_at)}
                    />
                </div>
                <div className="flex min-w-0 flex-col gap-6">
                    <PlayerDetailsCard details={player} />
                    <section className={CARD} data-testid="profile-info">
                        <h2 className="flex items-center gap-2 text-xl font-bold">
                            <CalendarDays className="size-5" aria-hidden />
                            {t('profile.info.title')}
                        </h2>
                        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                            <InfoRow label={t('profile.info.grade')}>
                                {hasGrade(player.grade)
                                    ? gradeLabel(t, player.grade as number)
                                    : '—'}
                            </InfoRow>
                            <InfoRow label={t('questionLevel.label')}>
                                <Link
                                    href="/dashboard#grade"
                                    className="link"
                                    data-testid="profile-level"
                                >
                                    {t(
                                        `questionLevel.levels.${questionLevelKey(player.question_level)}`,
                                    )}
                                </Link>
                            </InfoRow>
                            <InfoRow label={t('profile.info.age')}>
                                {player.age !== null
                                    ? t('player.age', { count: player.age })
                                    : '—'}
                            </InfoRow>
                            <InfoRow label={t('profile.info.joined')}>
                                {date(account.joined_at)}
                            </InfoRow>
                            <InfoRow label={t('profile.info.lastSeen')}>
                                {date(account.last_seen_at)}
                            </InfoRow>
                            {account.roles.length > 0 && (
                                <InfoRow label={t('profile.info.roles')}>
                                    {account.roles
                                        .map((role) => role.name)
                                        .join(', ')}
                                </InfoRow>
                            )}
                            <InfoRow label={t('profile.info.signIn')}>
                                <span className="flex flex-col gap-1">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Mail
                                            className="size-3.5 shrink-0"
                                            aria-hidden
                                        />
                                        {t('profile.info.emailPassword')}
                                    </span>
                                    {account.connected.map((link) => (
                                        <span
                                            key={link.provider}
                                            className="inline-flex items-center gap-1.5"
                                            data-testid={`profile-linked-${link.provider}`}
                                        >
                                            {link.provider === 'google' ? (
                                                <Google
                                                    className="size-3.5 shrink-0"
                                                    aria-hidden
                                                />
                                            ) : (
                                                <ShieldCheck
                                                    className="size-3.5 shrink-0"
                                                    aria-hidden
                                                />
                                            )}
                                            {t('profile.info.linked', {
                                                provider:
                                                    link.provider === 'google'
                                                        ? 'Google'
                                                        : link.provider,
                                            })}
                                        </span>
                                    ))}
                                </span>
                            </InfoRow>
                        </dl>
                    </section>
                </div>
            </div>
        </PlayerLayout>
    );
}

function Stat({
    icon,
    label,
    value,
    testId,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    testId?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#151b2e]/85">
                {icon}
                <span className="truncate">{label}</span>
            </span>
            <span
                className="truncate text-lg font-bold tabular-nums"
                data-testid={testId}
            >
                {value}
            </span>
        </div>
    );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <>
            <dt className="font-semibold text-[#151b2e]/80">{label}</dt>
            <dd className="min-w-0 font-semibold break-words">{children}</dd>
        </>
    );
}

function AccountCard({ account }: { account: ProfileProps['account'] }) {
    const { t } = useTranslations();
    const form = useForm({ name: account.name });

    return (
        <section className={CARD} data-testid="profile-account">
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <UserRound className="size-5" aria-hidden />
                {t('profile.account.title')}
            </h2>
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.patch('/profile', { preserveScroll: true });
                }}
            >
                <label htmlFor="profile-name" className="text-sm font-semibold">
                    {t('profile.account.name')}
                </label>
                <input
                    id="profile-name"
                    name="name"
                    value={form.data.name}
                    onChange={(event) =>
                        form.setData('name', event.target.value)
                    }
                    autoComplete="name"
                    maxLength={80}
                    className={FIELD}
                />
                <InputError message={form.errors.name} />
                <label
                    htmlFor="profile-email"
                    className="text-sm font-semibold"
                >
                    {t('profile.account.email')}
                </label>
                <input
                    id="profile-email"
                    value={account.email}
                    disabled
                    className={FIELD}
                    aria-describedby="profile-email-hint"
                />
                <p
                    id="profile-email-hint"
                    className="text-xs text-muted-foreground"
                >
                    {account.email_verified
                        ? t('profile.account.emailVerified')
                        : t('profile.account.emailLocked')}
                </p>
                {form.recentlySuccessful && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-[#116a56]"
                    >
                        {t('profile.account.saved')}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={
                        form.processing ||
                        form.data.name.trim() === '' ||
                        form.data.name.trim() === account.name
                    }
                    className="px-5 py-2.5 font-bold disabled:opacity-50"
                    data-testid="profile-save"
                >
                    {t('profile.account.save')}
                </button>
            </form>
        </section>
    );
}

function PasswordCard({
    needsCurrent,
    changedAt,
    dateLabel,
}: {
    needsCurrent: boolean;
    changedAt: string | null;
    dateLabel: string;
}) {
    const { t } = useTranslations();
    const [show, setShow] = useState(false);
    const form = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });
    const type = show ? 'text' : 'password';

    return (
        <section className={CARD} data-testid="profile-password">
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <KeyRound className="size-5" aria-hidden />
                {needsCurrent
                    ? t('profile.password.title')
                    : t('profile.password.setTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
                {needsCurrent
                    ? changedAt
                        ? t('profile.password.changedAt', { date: dateLabel })
                        : t('profile.password.intro')
                    : t('profile.password.setIntro')}
            </p>
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.put('/profile/password', {
                        preserveScroll: true,
                        onSuccess: () => form.reset(),
                        onError: () =>
                            form.reset('password', 'password_confirmation'),
                    });
                }}
            >
                {needsCurrent && (
                    <>
                        <label
                            htmlFor="profile-current-password"
                            className="text-sm font-semibold"
                        >
                            {t('profile.password.current')}
                        </label>
                        <input
                            id="profile-current-password"
                            type={type}
                            value={form.data.current_password}
                            onChange={(event) =>
                                form.setData(
                                    'current_password',
                                    event.target.value,
                                )
                            }
                            autoComplete="current-password"
                            className={FIELD}
                        />
                        <InputError message={form.errors.current_password} />
                    </>
                )}
                <label
                    htmlFor="profile-new-password"
                    className="text-sm font-semibold"
                >
                    {t('profile.password.new')}
                </label>
                <div className="relative">
                    <input
                        id="profile-new-password"
                        type={type}
                        value={form.data.password}
                        onChange={(event) =>
                            form.setData('password', event.target.value)
                        }
                        autoComplete="new-password"
                        className={`${FIELD} pr-12`}
                        aria-describedby="profile-password-rule"
                    />
                    <button
                        type="button"
                        onClick={() => setShow((value) => !value)}
                        className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 items-center justify-center !border-0 !bg-transparent !p-0 !shadow-none"
                        aria-label={
                            show
                                ? t('profile.password.hide')
                                : t('profile.password.show')
                        }
                    >
                        {show ? (
                            <EyeOff className="size-4" aria-hidden />
                        ) : (
                            <Eye className="size-4" aria-hidden />
                        )}
                    </button>
                </div>
                <p
                    id="profile-password-rule"
                    className="text-xs text-muted-foreground"
                >
                    {t('profile.password.rule')}
                </p>
                <InputError message={form.errors.password} />
                <label
                    htmlFor="profile-confirm-password"
                    className="text-sm font-semibold"
                >
                    {t('profile.password.confirm')}
                </label>
                <input
                    id="profile-confirm-password"
                    type={type}
                    value={form.data.password_confirmation}
                    onChange={(event) =>
                        form.setData(
                            'password_confirmation',
                            event.target.value,
                        )
                    }
                    autoComplete="new-password"
                    className={FIELD}
                />
                {form.recentlySuccessful && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-[#116a56]"
                        data-testid="profile-password-saved"
                    >
                        {t('profile.password.saved')}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={
                        form.processing ||
                        form.data.password === '' ||
                        form.data.password_confirmation === '' ||
                        (needsCurrent && form.data.current_password === '')
                    }
                    className="px-5 py-2.5 font-bold disabled:opacity-50"
                    data-testid="profile-password-submit"
                >
                    {t('profile.password.submit')}
                </button>
            </form>
        </section>
    );
}
