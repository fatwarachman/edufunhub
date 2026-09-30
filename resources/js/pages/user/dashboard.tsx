import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { ArrowUpRight, Coins, Gamepad2, History } from 'lucide-react';

interface DashboardProps {
    points: number;
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

export default function Dashboard({
    points,
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
                        <Link
                            href="/character"
                            className="auth-google inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 font-bold"
                        >
                            {t('player.customize')}
                            <ArrowUpRight className="size-4" />
                        </Link>
                    </section>
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
                                        <Link
                                            key={game.key}
                                            href={game.url}
                                            className="flex items-center justify-between gap-3 rounded-xl border-2 border-[#151b2e] bg-[#faf7ef] px-4 py-3 font-semibold hover:bg-[#ffd93d]"
                                        >
                                            {t(game.titleKey)}
                                            <ArrowUpRight className="size-5 shrink-0" />
                                        </Link>
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
