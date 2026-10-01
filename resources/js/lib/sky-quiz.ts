export interface SkyQuestion {
    grade: number;
    subject: string;
    text: string;
    options: string[];
    answer: number;
}
export const SKY_QUESTIONS: SkyQuestion[] = [
    {
        grade: 1,
        subject: 'Matematika',
        text: '3 + 2 = ...',
        options: ['5', '4', '6'],
        answer: 0,
    },
    {
        grade: 1,
        subject: 'Bahasa Indonesia',
        text: 'Huruf pertama pada kata BUKU?',
        options: ['D', 'B', 'P'],
        answer: 1,
    },
    {
        grade: 1,
        subject: 'Sains',
        text: 'Bagian tubuh untuk melihat?',
        options: ['Telinga', 'Hidung', 'Mata'],
        answer: 2,
    },
    {
        grade: 1,
        subject: 'Pancasila',
        text: 'Saat teman jatuh, kita sebaiknya ...',
        options: ['Menolong', 'Mengejek', 'Meninggalkan'],
        answer: 0,
    },
    {
        grade: 1,
        subject: 'Bahasa Inggris',
        text: 'Bahasa Inggris warna merah?',
        options: ['Blue', 'Red', 'Green'],
        answer: 1,
    },
    {
        grade: 1,
        subject: 'Matematika',
        text: 'Angka setelah 9 adalah ...',
        options: ['8', '11', '10'],
        answer: 2,
    },
    {
        grade: 1,
        subject: 'Sains',
        text: 'Hewan yang mengeong adalah ...',
        options: ['Kucing', 'Ayam', 'Sapi'],
        answer: 0,
    },
    {
        grade: 1,
        subject: 'Bahasa Indonesia',
        text: 'Lawan kata BESAR?',
        options: ['Panjang', 'Kecil', 'Tinggi'],
        answer: 1,
    },
    {
        grade: 2,
        subject: 'Matematika',
        text: '4 × 3 = ...',
        options: ['7', '14', '12'],
        answer: 2,
    },
    {
        grade: 2,
        subject: 'Bahasa Indonesia',
        text: 'Lawan kata PANJANG?',
        options: ['Pendek', 'Lebar', 'Besar'],
        answer: 0,
    },
    {
        grade: 2,
        subject: 'Sains',
        text: 'Tumbuhan menyerap air melalui ...',
        options: ['Bunga', 'Akar', 'Buah'],
        answer: 1,
    },
    {
        grade: 2,
        subject: 'Pancasila',
        text: 'Lambang sila pertama adalah ...',
        options: ['Rantai', 'Padi', 'Bintang'],
        answer: 2,
    },
    {
        grade: 2,
        subject: 'Bahasa Inggris',
        text: 'Bahasa Inggris angka dua?',
        options: ['Two', 'One', 'Ten'],
        answer: 0,
    },
    {
        grade: 2,
        subject: 'Matematika',
        text: 'Satu minggu ada berapa hari?',
        options: ['6', '7', '8'],
        answer: 1,
    },
    {
        grade: 2,
        subject: 'Sains',
        text: 'Air yang dibekukan menjadi ...',
        options: ['Uap', 'Awan', 'Es'],
        answer: 2,
    },
    {
        grade: 2,
        subject: 'Bahasa Indonesia',
        text: 'Tanda di akhir kalimat tanya?',
        options: ['?', '!', '.'],
        answer: 0,
    },
    {
        grade: 3,
        subject: 'Matematika',
        text: '36 ÷ 4 = ...',
        options: ['6', '9', '8'],
        answer: 1,
    },
    {
        grade: 3,
        subject: 'Bahasa Indonesia',
        text: 'Persamaan kata GEMBIRA?',
        options: ['Sedih', 'Marah', 'Senang'],
        answer: 2,
    },
    {
        grade: 3,
        subject: 'IPAS',
        text: 'Sumber energi utama Bumi?',
        options: ['Matahari', 'Bulan', 'Batu'],
        answer: 0,
    },
    {
        grade: 3,
        subject: 'Pancasila',
        text: 'Keputusan bersama dicapai lewat ...',
        options: ['Pertengkaran', 'Musyawarah', 'Paksaan'],
        answer: 1,
    },
    {
        grade: 3,
        subject: 'Bahasa Inggris',
        text: 'Bahasa Indonesia BUTTERFLY?',
        options: ['Lebah', 'Semut', 'Kupu-kupu'],
        answer: 2,
    },
    {
        grade: 3,
        subject: 'Matematika',
        text: 'Setengah dari 20 adalah ...',
        options: ['10', '5', '15'],
        answer: 0,
    },
    {
        grade: 3,
        subject: 'IPAS',
        text: 'Alat untuk mengukur suhu?',
        options: ['Penggaris', 'Termometer', 'Timbangan'],
        answer: 1,
    },
    {
        grade: 3,
        subject: 'Bahasa Indonesia',
        text: 'Kata kerja dalam: Ibu membaca buku?',
        options: ['Ibu', 'Buku', 'Membaca'],
        answer: 2,
    },
    {
        grade: 4,
        subject: 'Matematika',
        text: 'Keliling persegi dengan sisi 5 cm?',
        options: ['20 cm', '25 cm', '10 cm'],
        answer: 0,
    },
    {
        grade: 4,
        subject: 'Bahasa Indonesia',
        text: 'Tokoh utama dalam cerita disebut ...',
        options: ['Latar', 'Tokoh sentral', 'Alur'],
        answer: 1,
    },
    {
        grade: 4,
        subject: 'IPAS',
        text: 'Perubahan air menjadi uap disebut ...',
        options: ['Membeku', 'Mencair', 'Menguap'],
        answer: 2,
    },
    {
        grade: 4,
        subject: 'Pancasila',
        text: 'Sikap terhadap perbedaan agama?',
        options: ['Menghormati', 'Memaksa', 'Mengejek'],
        answer: 0,
    },
    {
        grade: 4,
        subject: 'Bahasa Inggris',
        text: 'Lawan kata HOT dalam bahasa Inggris?',
        options: ['Warm', 'Cold', 'Big'],
        answer: 1,
    },
    {
        grade: 4,
        subject: 'Matematika',
        text: '3/4 dari 12 adalah ...',
        options: ['6', '8', '9'],
        answer: 2,
    },
    {
        grade: 4,
        subject: 'IPAS',
        text: 'Gaya yang menarik benda ke Bumi?',
        options: ['Gravitasi', 'Magnet', 'Gesek'],
        answer: 0,
    },
    {
        grade: 4,
        subject: 'Matematika',
        text: '1 meter sama dengan ...',
        options: ['10 cm', '100 cm', '1.000 cm'],
        answer: 1,
    },
];

export function shuffledQuestions(grade: number): SkyQuestion[] {
    const questions = SKY_QUESTIONS.filter((q) => q.grade === grade).map(
        (q) => {
            const choices = q.options.map((text, index) => ({
                text,
                correct: index === q.answer,
            }));
            for (let i = choices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [choices[i], choices[j]] = [choices[j], choices[i]];
            }
            return {
                ...q,
                options: choices.map((c) => c.text),
                answer: choices.findIndex((c) => c.correct),
            };
        },
    );
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    return questions;
}

export function hitBox(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    width: number,
    height: number,
): boolean {
    return Math.abs(ax - bx) < width / 2 && Math.abs(ay - by) < height / 2;
}
/** Rules shared with the Go referee (services/game/internal/sky). */
export const SKY_RULES = {
    rounds: 10,
    shields: 5,
    roundGapMs: 2200,
    scoreCorrect: 100,
    scoreRemoved: 20,
    scoreDrone: 10,
    maxDronesPerRound: 6,
    passPercent: 70,
} as const;

/** True when more than passPercent of all questions were answered correctly. */
export function hasPassed(correct: number, total: number): boolean {
    return total > 0 && correct * 100 > SKY_RULES.passPercent * total;
}

export type SkyFeedbackKind =
    'correct' | 'wrong_touch' | 'removed' | 'shot_correct' | 'missed' | 'crash';

export interface SkyRoundState {
    phase: 'ready' | 'question' | 'done';
    round: number;
    total: number;
    shields: number;
    max: number;
    score: number;
    correct: number;
    wrong: number;
    speed: number;
    history?: boolean[];
    question?: {
        id: string;
        subject: string;
        text: string;
        options: string[];
        removed: number[];
        delay: number;
    };
    feedback?: {
        kind: SkyFeedbackKind;
        score?: number;
        damage?: number;
        option?: number;
        answer?: string;
    };
    result?: {
        points: number;
        correct: number;
        wrong: number;
        seconds: number;
    };
}

/**
 * Offline referee for guests (demo). Mirrors the Go referee rules but awards
 * no account points; its result is shown locally only.
 */
export function createLocalReferee(grade: number) {
    let questions: SkyQuestion[] = [];
    let state: SkyRoundState = {
        phase: 'ready',
        round: 0,
        total: SKY_RULES.rounds,
        shields: SKY_RULES.shields,
        max: SKY_RULES.shields,
        score: 0,
        correct: 0,
        wrong: 0,
        speed: 32,
    };
    let removed: number[] = [];
    let history: boolean[] = [];
    let drones = 0;
    let started = 0;
    let flight = 0;

    const snapshot = (
        feedback?: SkyRoundState['feedback'],
        delay = 0,
    ): SkyRoundState => {
        const q = questions[state.round];
        return {
            ...state,
            history: [...history],
            question:
                state.phase === 'question' && q
                    ? {
                          id: `${flight}-${state.round}`,
                          subject: q.subject,
                          text: q.text,
                          options: q.options,
                          removed: [...removed],
                          delay,
                      }
                    : undefined,
            feedback,
        };
    };
    const finish = () => {
        state.phase = 'done';
        state.result = {
            points: 0,
            correct: state.correct,
            wrong: state.wrong,
            seconds: Math.round((performance.now() - started) / 1000),
            percent: Math.floor((state.correct * 100) / state.total),
            passed: hasPassed(state.correct, state.total),
            reason: state.shields === 0 ? 'shields' : 'finished',
        };
    };
    const resolve = (
        kind: SkyFeedbackKind,
        score: number,
        damage: number,
    ): SkyRoundState => {
        const q = questions[state.round];
        const feedback = { kind, score, damage, answer: q.options[q.answer] };
        state.shields = Math.max(0, state.shields - damage);
        history.push(kind === 'correct');
        state.round += 1;
        removed = [];
        drones = 0;
        if (state.shields === 0 || state.round >= state.total) {
            finish();
        }
        return snapshot(feedback, SKY_RULES.roundGapMs);
    };

    return {
        start(): SkyRoundState {
            flight += 1;
            questions = shuffledQuestions(grade);
            state = {
                phase: 'question',
                round: 0,
                total: Math.min(SKY_RULES.rounds, questions.length),
                shields: SKY_RULES.shields,
                max: SKY_RULES.shields,
                score: 0,
                correct: 0,
                wrong: 0,
                speed: 32,
            };
            removed = [];
            history = [];
            drones = 0;
            started = performance.now();
            return snapshot();
        },
        touch(option: number): SkyRoundState | null {
            const q = questions[state.round];
            if (state.phase !== 'question' || !q || removed.includes(option))
                return null;
            if (option === q.answer) {
                state.correct += 1;
                state.score += SKY_RULES.scoreCorrect;
                return resolve('correct', SKY_RULES.scoreCorrect, 0);
            }
            state.wrong += 1;
            return resolve('wrong_touch', 0, 1);
        },
        shoot(option: number): SkyRoundState | null {
            const q = questions[state.round];
            if (state.phase !== 'question' || !q || removed.includes(option))
                return null;
            if (option === q.answer) {
                state.wrong += 1;
                return resolve('shot_correct', 0, 1);
            }
            removed.push(option);
            state.score += SKY_RULES.scoreRemoved;
            return snapshot({
                kind: 'removed',
                option,
                score: SKY_RULES.scoreRemoved,
            });
        },
        miss(): SkyRoundState | null {
            if (state.phase !== 'question') return null;
            state.wrong += 1;
            return resolve('missed', 0, 1);
        },
        crash(): SkyRoundState | null {
            if (state.phase !== 'question') return null;
            state.shields = Math.max(0, state.shields - 1);
            if (state.shields === 0) finish();
            return snapshot({ kind: 'crash', damage: 1 });
        },
        drone(): number | null {
            if (
                state.phase !== 'question' ||
                drones >= SKY_RULES.maxDronesPerRound
            )
                return null;
            drones += 1;
            state.score += SKY_RULES.scoreDrone;
            return state.score;
        },
    };
}

export function answerOutcome(
    correct: boolean,
    shot: boolean,
): { points: number; damage: number; resolve: boolean } {
    if (shot)
        return correct
            ? { points: 0, damage: 1, resolve: true }
            : { points: 20, damage: 0, resolve: false };
    return correct
        ? { points: 100, damage: 0, resolve: true }
        : { points: 0, damage: 1, resolve: true };
}
