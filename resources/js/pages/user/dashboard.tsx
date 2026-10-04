import InputError from '@/components/input-error';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { NavButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { type SharedData } from '@/types';
import { useForm, usePage } from '@inertiajs/react';
import {
    Coins,
    Gamepad2,
    GraduationCap,
    History,
    IdCard,
    Play,
    Trophy,
    UserRound,
} from 'lucide-react';

interface DashboardProps {
    points: number;
    grade: number | null;
    playerDetails: PlayerDetails;
    character: CharacterData;
    categories: {
        key: string;
        titleKey: string;
        games: { key: string; titleKey: string; url: string }[];
    }[];
    history: {
        id: number;
        game_name: string;
        points: number;
        played_at: string;
    }[];
}

interface PlayerDetails {
    birth_date: string | null;
    school_name: string | null;
}

export default function Dashboard({
    points,
    grade,
    playerDetails,
    character,
    categories,
    history,
}: DashboardProps) {
    const { t, i18n } = useTranslations();
    const { auth } = usePage<SharedData>().props;
    return (
        <PlayerLayout title={t('player.dashboard')}>
            <div className="flex flex-col items-start gap-3">
                <span className="auth-badge">{t('player.badge')}</span>
                <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                    {t('player.welcome', { name: auth.user.name })}
                </h1>
                <p className="text-muted-foreground">{t('player.intro')}</p>
                <div className="flex flex-wrap gap-2">
                    <NavButton
                        href="/portal"
                        icon={Trophy}
                        label={t('player.openPortal')}
                        variant="primary"
                    />
                    <NavButton
                        href="/gamelist"
                        icon={Gamepad2}
                        label={t('nav.games')}
                    />
                </div>
            </div>
            <div className="grid gap-7 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="flex min-w-0 flex-col gap-7">
                    <section className="auth-card flex flex-col gap-3 text-center">
                        <h2 className="text-xl font-bold">
                            {t('player.character')}
                        </h2>
                        <PlayerCharacter character={character} />
                        <p className="font-bold break-words">
                            {character.nickname || auth.user.name}
                        </p>
                        <NavButton
                            href="/character"
                            icon={UserRound}
                            label={t('player.customize')}
                            block
                        />
                    </section>
                    <PlayerDetailsCard details={playerDetails} />
                    <GradeCard grade={grade} />
                    <section className="auth-card flex flex-col gap-3 !bg-[#ffd93d]">
                        <div className="flex items-center gap-2 font-bold">
                            <Coins className="size-5" />
                            {t('player.points')}
                        </div>
                        <p className="text-5xl font-bold tabular-nums">
                            {new Intl.NumberFormat(i18n.language).format(
                                points,
                            )}
                        </p>
                        <p className="text-sm">{t('player.pointsNote')}</p>
                    </section>
                </aside>
                <div className="flex min-w-0 flex-col gap-8">
                    <section className="flex flex-col gap-4">
                        <h2 className="flex items-center gap-2 text-2xl font-bold">
                            <Gamepad2 />
                            {t('player.categories')}
                        </h2>
                        <div className="grid gap-5 sm:grid-cols-2">
                            {categories.map((category, index) => (
                                <article
                                    key={category.key}
                                    className="auth-card flex flex-col gap-4"
                                >
                                    <span className="text-sm font-bold text-muted-foreground">
                                        {String(index + 1).padStart(2, '0')}
                                    </span>
                                    <h3 className="text-xl font-bold">
                                        {t(category.titleKey)}
                                    </h3>
                                    {category.games.map((game) => (
                                        <NavButton
                                            key={game.key}
                                            href={game.url}
                                            icon={Play}
                                            label={t(game.titleKey)}
                                            block
                                            className="!justify-start text-left !whitespace-normal"
                                        />
                                    ))}
                                </article>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('player.demoNote')}
                        </p>
                    </section>
                    <section className="auth-card flex flex-col gap-5">
                        <h2 className="flex items-center gap-2 text-2xl font-bold">
                            <History />
                            {t('player.history')}
                        </h2>
                        {history.length === 0 ? (
                            <div className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-5 py-9 text-center">
                                <p className="font-bold">
                                    {t('player.emptyHistory')}
                                </p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {t('player.historyNote')}
                                </p>
                            </div>
                        ) : (
                            <ul className="flex flex-col divide-y divide-[#151b2e]/15">
                                {history.map((item) => (
                                    <li
                                        key={item.id}
                                        className="flex flex-wrap items-center justify-between gap-3 py-4"
                                    >
                                        <div>
                                            <p className="font-semibold">
                                                {item.game_name}
                                            </p>
                                            <time
                                                className="text-xs text-muted-foreground"
                                                dateTime={item.played_at}
                                            >
                                                {new Intl.DateTimeFormat(
                                                    i18n.language,
                                                    {
                                                        dateStyle: 'medium',
                                                        timeStyle: 'short',
                                                    },
                                                ).format(
                                                    new Date(item.played_at),
                                                )}
                                            </time>
                                        </div>
                                        <span className="font-bold tabular-nums">
                                            {t('player.pointsValue', {
                                                count: item.points,
                                            })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </PlayerLayout>
    );
}

function ageFromBirthDate(birthDate: string): number {
    const [year, month, day] = birthDate.split('-').map(Number);
    const now = new Date();
    const hadBirthday =
        now.getMonth() + 1 > month ||
        (now.getMonth() + 1 === month && now.getDate() >= day);

    return now.getFullYear() - year - (hadBirthday ? 0 : 1);
}

function PlayerDetailsCard({ details }: { details: PlayerDetails }) {
    const { t } = useTranslations();
    const form = useForm<{ birth_date: string; school_name: string }>({
        birth_date: details.birth_date ?? '',
        school_name: details.school_name ?? '',
    });
    const today = new Date().toISOString().slice(0, 10);
    const complete = Boolean(details.birth_date && details.school_name);

    return (
        <section
            id="player-details"
            className="auth-card flex scroll-mt-6 flex-col gap-3"
        >
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <IdCard className="size-5" />
                {t('player.details')}
            </h2>
            {complete && details.birth_date ? (
                <p className="text-sm font-semibold">
                    {t('player.age', {
                        count: ageFromBirthDate(details.birth_date),
                    })}{' '}
                    · {details.school_name}
                </p>
            ) : (
                <p className="text-sm text-muted-foreground">
                    {t('player.detailsNote')}
                </p>
            )}
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.patch('/player-details', { preserveScroll: true });
                }}
            >
                <label
                    htmlFor="birth-date-input"
                    className="text-sm font-semibold"
                >
                    {t('player.birthDate')}
                </label>
                <input
                    id="birth-date-input"
                    type="date"
                    name="birth_date"
                    value={form.data.birth_date}
                    max={today}
                    onChange={(event) =>
                        form.setData('birth_date', event.target.value)
                    }
                    className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold"
                />
                <InputError message={form.errors.birth_date} />
                <label htmlFor="school-input" className="text-sm font-semibold">
                    {t('player.schoolName')}
                </label>
                <input
                    id="school-input"
                    type="text"
                    name="school_name"
                    value={form.data.school_name}
                    maxLength={120}
                    placeholder={t('player.schoolNamePlaceholder')}
                    onChange={(event) =>
                        form.setData('school_name', event.target.value)
                    }
                    className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold"
                />
                <InputError message={form.errors.school_name} />
                {form.recentlySuccessful && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-[#116a56]"
                    >
                        {t('player.detailsSaved')}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={
                        form.processing ||
                        form.data.birth_date === '' ||
                        form.data.school_name.trim() === ''
                    }
                    className="px-5 py-2.5 font-bold disabled:opacity-50"
                >
                    {t('player.detailsSave')}
                </button>
            </form>
        </section>
    );
}

const GRADE_BANDS: { key: string; grades: number[] }[] = [
    { key: 'sd', grades: [1, 2, 3, 4, 5, 6] },
    { key: 'smp', grades: [7, 8, 9] },
    { key: 'sma', grades: [10, 11, 12] },
];

function GradeCard({ grade }: { grade: number | null }) {
    const { t } = useTranslations();
    const form = useForm<{ grade: string }>({
        grade: grade ? String(grade) : '',
    });
    return (
        <section
            id="grade"
            className="auth-card flex scroll-mt-6 flex-col gap-3"
        >
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <GraduationCap className="size-5" />
                {t('player.grade')}
            </h2>
            <p className="text-sm text-muted-foreground">
                {t('player.gradeNote')}
            </p>
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.patch('/grade', { preserveScroll: true });
                }}
            >
                <label htmlFor="grade-select" className="sr-only">
                    {t('player.grade')}
                </label>
                <select
                    id="grade-select"
                    name="grade"
                    value={form.data.grade}
                    onChange={(event) =>
                        form.setData('grade', event.target.value)
                    }
                    className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold"
                >
                    <option value="" disabled>
                        {t('player.gradePlaceholder')}
                    </option>
                    {GRADE_BANDS.map((band) => (
                        <optgroup
                            key={band.key}
                            label={t(`player.gradeBands.${band.key}`)}
                        >
                            {band.grades.map((value) => (
                                <option key={value} value={value}>
                                    {t('player.gradeOption', { grade: value })}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <InputError message={form.errors.grade} />
                {form.recentlySuccessful && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-[#116a56]"
                    >
                        {t('player.gradeSaved')}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={form.processing || form.data.grade === ''}
                    className="px-5 py-2.5 font-bold disabled:opacity-50"
                >
                    {t('player.gradeSave')}
                </button>
            </form>
        </section>
    );
}
