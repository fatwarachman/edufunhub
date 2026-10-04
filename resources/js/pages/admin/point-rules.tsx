import { FlashMessages } from '@/components/admin/admin-kit';
import { Panel, fieldClass } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { Head, Link, useForm } from '@inertiajs/react';
import {
    Award,
    BookOpenCheck,
    CircleCheck,
    CircleMinus,
    CircleX,
    Coins,
    Equal,
    Loader2,
    RotateCcw,
    Sparkles,
    Trophy,
} from 'lucide-react';
import { type FormEvent, type ReactNode } from 'react';

type RuleKey = 'per_correct' | 'win' | 'draw' | 'participation';
type Rules = Record<RuleKey, number>;

interface Props {
    rules: Rules;
    defaults: Rules;
    bounds: Record<RuleKey, [number, number]>;
    bonusQuestions: number;
    maxQuestionPoints: number;
}

const FIELDS: {
    key: RuleKey;
    label: string;
    help: string;
    icon: React.ElementType;
}[] = [
    {
        key: 'per_correct',
        label: 'Correct answer (normal question)',
        help: 'Every correct answer earns this. Bonus questions use their own value.',
        icon: CircleCheck,
    },
    {
        key: 'win',
        label: 'Win bonus',
        help: 'Extra points for the winner of a duel, room or race.',
        icon: Trophy,
    },
    {
        key: 'draw',
        label: 'Draw bonus',
        help: 'Extra points when a game ends in a draw. 0 = a draw earns nothing extra.',
        icon: Equal,
    },
    {
        key: 'participation',
        label: 'Finished game',
        help: 'Paid once for every finished game, win or lose.',
        icon: Award,
    },
];

export default function PointRules({
    rules,
    defaults,
    bounds,
    bonusQuestions,
    maxQuestionPoints,
}: Props) {
    const form = useForm<Rules>({ ...rules });
    const { data, setData, errors, processing, isDirty } = form;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.put('/admin/point-rules', { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title="Point Rules" />
            <div className="flex max-w-4xl flex-col gap-6">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Coins className="size-6 text-amber-500" />
                        Point Rules
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        The guide every game follows. Changes reach the game
                        server within a minute.
                    </p>
                </div>

                <FlashMessages />

                <Panel
                    title="Guide"
                    icon={BookOpenCheck}
                    description="How players earn points in every game"
                >
                    <ul
                        className="grid gap-3 sm:grid-cols-2"
                        data-testid="point-guide"
                    >
                        <Guide icon={CircleCheck} tone="green">
                            Correct answer: <b>+{data.per_correct}</b> points
                            (bonus questions can be worth up to{' '}
                            {maxQuestionPoints}).
                        </Guide>
                        <Guide icon={Sparkles} tone="amber">
                            Bonus questions: set their value on the question
                            form.{' '}
                            <Link
                                href="/admin/questions?source=bonus"
                                className="font-medium underline underline-offset-2"
                            >
                                {bonusQuestions} bonus questions
                            </Link>
                        </Guide>
                        <Guide icon={Equal} tone="slate">
                            Draw:{' '}
                            {data.draw > 0 ? (
                                <>
                                    <b>+{data.draw}</b> bonus
                                </>
                            ) : (
                                <b>0, no extra points</b>
                            )}
                            .
                        </Guide>
                        <Guide icon={CircleX} tone="red">
                            Wrong answer: <b>0</b>. Points are never taken away.
                        </Guide>
                        <Guide icon={Trophy} tone="amber">
                            Win: <b>+{data.win}</b> bonus on top of the answers.
                        </Guide>
                        <Guide icon={CircleMinus} tone="slate">
                            Leaving early pays only after 3 answers (stops point
                            farming).
                        </Guide>
                    </ul>
                </Panel>

                <Panel title="Values" icon={Coins}>
                    <form
                        onSubmit={submit}
                        className="flex flex-col gap-5"
                        data-testid="point-rules-form"
                    >
                        <div className="grid gap-5 sm:grid-cols-2">
                            {FIELDS.map(({ key, label, help, icon: Icon }) => (
                                <label
                                    key={key}
                                    className="flex flex-col gap-1.5"
                                >
                                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                        <Icon className="size-4 text-muted-foreground" />
                                        {label}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            name={key}
                                            min={bounds[key][0]}
                                            max={bounds[key][1]}
                                            value={data[key]}
                                            onChange={(event) =>
                                                setData(
                                                    key,
                                                    Number(event.target.value),
                                                )
                                            }
                                            className={`${fieldClass} w-28 tabular-nums`}
                                            data-testid={`rule-${key}`}
                                            required
                                        />
                                        <span className="text-xs text-muted-foreground">
                                            points · {bounds[key][0]}–
                                            {bounds[key][1]} · default{' '}
                                            {defaults[key]}
                                        </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {help}
                                    </span>
                                    <InputError message={errors[key]} />
                                </label>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                            <button
                                type="button"
                                onClick={() => setData({ ...defaults })}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent"
                            >
                                <RotateCcw className="size-4" />
                                Use defaults
                            </button>
                            <button
                                type="submit"
                                disabled={processing || !isDirty}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                data-testid="point-rules-save"
                            >
                                {processing && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                Save rules
                            </button>
                        </div>
                    </form>
                </Panel>
            </div>
        </AdminLayout>
    );
}

const TONES = {
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    slate: 'text-muted-foreground',
};

function Guide({
    icon: Icon,
    tone,
    children,
}: {
    icon: React.ElementType;
    tone: keyof typeof TONES;
    children: ReactNode;
}) {
    return (
        <li className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm text-foreground">
            <Icon className={`mt-0.5 size-4 shrink-0 ${TONES[tone]}`} />
            <span>{children}</span>
        </li>
    );
}
