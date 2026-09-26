import { IllustratedSnakesBoard } from '@/components/illustrated-snakes-board';
import { BLOCK_SKINS, MiniBlockAvatar } from '@/components/mini-block-avatar';
import { Button } from '@/components/ui/button';
import { useGameAudio } from '@/hooks/use-game-audio';
import {
    BOARD_LADDERS as LADDERS,
    BOARD_SNAKES as SNAKES,
} from '@/lib/snakes-board';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    CheckCircle2,
    Dice1,
    Dice2,
    Dice3,
    Dice4,
    Dice5,
    Dice6,
    Gamepad2,
    RotateCcw,
    Shuffle,
    Sparkles,
    Trophy,
    Users,
    XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// 30 Bank Soal Random Multi-Subject (TK, SD, SMP, SMA, Logika)
const ALL_QUESTIONS = [
    {
        id: 1,
        level: 'SD / SMP',
        subject: 'Matematika',
        question: 'Berapakah hasil dari 15 × 8 - 45?',
        options: ['65', '75', '85', '95'],
        answer: 1, // 75
        explanation: '15 × 8 = 120, lalu 120 - 45 = 75.',
    },
    {
        id: 2,
        level: 'SMP / SMA',
        subject: 'IPA (Fisika)',
        question:
            'Alat ukur yang digunakan untuk mengukur kuat arus listrik adalah...',
        options: ['Voltmeter', 'Amperemeter', 'Ohmmeter', 'Barometer'],
        answer: 1,
        explanation:
            'Kuat arus diukur dengan Amperemeter, sedangkan beda tegangan dengan Voltmeter.',
    },
    {
        id: 3,
        level: 'SD / SMP',
        subject: 'IPA (Biologi)',
        question:
            'Bagian sel tumbuhan yang berfungsi sebagai tempat fotosintesis adalah...',
        options: ['Mitokondria', 'Kloroplas', 'Ribosom', 'Vakuola'],
        answer: 1,
        explanation:
            'Kloroplas mengandung klorofil hijau daun untuk menangkap energi cahaya matahari.',
    },
    {
        id: 4,
        level: 'SD / SMP',
        subject: 'IPS (Sejarah)',
        question:
            'Teks Proklamasi Kemerdekaan Indonesia dibacakan pada tahun...',
        options: ['1942', '1945', '1948', '1950'],
        answer: 1,
        explanation:
            'Proklamasi Kemerdekaan dibacakan pada 17 Agustus 1945 oleh Ir. Soekarno.',
    },
    {
        id: 5,
        level: 'SD / SMP',
        subject: 'Bahasa Indonesia',
        question: 'Antonim (lawan kata) dari kata "OPTIMIS" adalah...',
        options: ['Pesimis', 'Realistis', 'Kritis', 'Apatis'],
        answer: 0,
        explanation:
            'Optimis berarti penuh keyakinan dan harapan baik, lawannya pesimis.',
    },
    {
        id: 6,
        level: 'SMP / SMA',
        subject: 'Informatika',
        question: 'Satuan unit memori komputer terkecil adalah...',
        options: ['Byte', 'Bit', 'Kilobyte', 'Nibble'],
        answer: 1,
        explanation:
            'Bit (binary digit) bernilai 0 atau 1 adalah satuan data terkecil komputer.',
    },
    {
        id: 7,
        level: 'SD / SMP',
        subject: 'Matematika',
        question: 'Akar kuadrat dari 144 (√144) adalah...',
        options: ['11', '12', '13', '14'],
        answer: 1,
        explanation: '12 × 12 = 144.',
    },
    {
        id: 8,
        level: 'SMP / SMA',
        subject: 'IPA (Kimia)',
        question: 'Lambang unsur kimia untuk Emas murni adalah...',
        options: ['Ag', 'Fe', 'Au', 'Cu'],
        answer: 2,
        explanation:
            'Au berasal dari nama Latin "Aurum" yang berarti emas berkilau.',
    },
    {
        id: 9,
        level: 'SD / SMP',
        subject: 'IPS (Geografi)',
        question:
            'Danau vulkanik terbesar di Asia Tenggara yang berada di Indonesia adalah...',
        options: [
            'Danau Singkarak',
            'Danau Toba',
            'Danau Matano',
            'Danau Sentani',
        ],
        answer: 1,
        explanation:
            'Danau Toba di Sumatera Utara terbentuk dari letusan supervulkan raksasa purba.',
    },
    {
        id: 10,
        level: 'SD / SMP',
        subject: 'Bahasa Inggris',
        question: 'What is the past tense (V2) of the verb "GO"?',
        options: ['Gone', 'Went', 'Goes', 'Going'],
        answer: 1,
        explanation: 'Go (V1) -> Went (V2) -> Gone (V3).',
    },
    {
        id: 11,
        level: 'Logika Cilik',
        subject: 'Logika & Koding',
        question:
            'Jika 3 kucing dapat menangkap 3 tikus dalam 3 menit, berapa menit yang dibutuhkan 100 kucing untuk menangkap 100 tikus?',
        options: ['100 menit', '3 menit', '30 menit', '1 menit'],
        answer: 1,
        explanation:
            'Setiap 1 kucing butuh 3 menit untuk menangkap 1 tikus secara serempak.',
    },
    {
        id: 12,
        level: 'SD / SMP',
        subject: 'Karakter & Umum',
        question: 'Simbol lambang sila kedua Pancasila adalah...',
        options: ['Bintang', 'Rantai Emas', 'Pohon Beringin', 'Padi dan Kapas'],
        answer: 1,
        explanation:
            'Rantai emas melambangkan kemanusiaan yang adil dan beradab.',
    },
    {
        id: 13,
        level: 'SD / SMP',
        subject: 'Matematika',
        question:
            'Berapakah keliling bangun persegi yang memiliki panjang sisi 14 cm?',
        options: ['28 cm', '42 cm', '56 cm', '196 cm'],
        answer: 2,
        explanation: 'Keliling persegi = 4 × sisi = 4 × 14 = 56 cm.',
    },
    {
        id: 14,
        level: 'SD / SMP',
        subject: 'IPA (Astronomi)',
        question: 'Planet terbesar dalam sistem tata surya kita adalah...',
        options: ['Saturnus', 'Jupiter', 'Neptunus', 'Bumi'],
        answer: 1,
        explanation:
            'Jupiter adalah raksasa gas dengan volume dan massa paling besar di tata surya.',
    },
    {
        id: 15,
        level: 'SD / SMP',
        subject: 'IPS (Ekonomi)',
        question:
            'Kegiatan menyalurkan barang dari pihak produsen ke konsumen disebut...',
        options: ['Produksi', 'Distribusi', 'Konsumsi', 'Investasi'],
        answer: 1,
        explanation:
            'Distribusi bertugas menjembatani perpindahan produk sampai ke tangan konsumen.',
    },
    {
        id: 16,
        level: 'SD / SMP',
        subject: 'Bahasa Indonesia',
        question:
            'Kalimat yang predikatnya wajib membutuhkan objek disebut kalimat...',
        options: ['Intransitif', 'Transitif', 'Majemuk', 'Pasif'],
        answer: 1,
        explanation:
            'Kalimat transitif membutuhkan objek untuk melengkapi arti utuhnya.',
    },
    {
        id: 17,
        level: 'SMP / SMA',
        subject: 'IPA (Fisika)',
        question:
            'Energi yang dimiliki suatu benda akibat kedudukan atau posisinya disebut...',
        options: [
            'Energi Kinetik',
            'Energi Potensial',
            'Energi Kalor',
            'Energi Pegas',
        ],
        answer: 1,
        explanation:
            'Energi potensial gravitasi dipengaruhi oleh massa, gravitasi, dan ketinggian (m × g × h).',
    },
    {
        id: 18,
        level: 'SD / SMP',
        subject: 'Matematika',
        question: 'Berapakah nilai dari 2 pangkat 6 (2⁶)?',
        options: ['32', '64', '128', '256'],
        answer: 1,
        explanation: '2 × 2 × 2 × 2 × 2 × 2 = 64.',
    },
    {
        id: 19,
        level: 'SMP / SMA',
        subject: 'Informatika',
        question:
            'Protokol transmisi data halaman web yang aman dan terenkripsi adalah...',
        options: ['HTTP', 'HTTPS', 'FTP', 'SMTP'],
        answer: 1,
        explanation:
            'HTTPS memakai lapisan SSL/TLS untuk mengenkripsi percakapan web secara aman.',
    },
    {
        id: 20,
        level: 'SD / SMP',
        subject: 'IPS (Sejarah)',
        question:
            'Kerajaan Hindu tertua di Indonesia dengan bukti peninggalan prasasti Yupa adalah...',
        options: ['Majapahit', 'Tarumanegara', 'Kutai', 'Sriwijaya'],
        answer: 2,
        explanation:
            'Kerajaan Kutai di tepi Sungai Mahakam, Kalimantan Timur berdiri sekitar abad ke-4.',
    },
    {
        id: 21,
        level: 'SD / SMP',
        subject: 'Bahasa Inggris',
        question: 'Choose the correct synonym of "RAPID":',
        options: ['Slow', 'Fast', 'Heavy', 'Quiet'],
        answer: 1,
        explanation: 'Rapid berarti sangat cepat (quick / fast).',
    },
    {
        id: 22,
        level: 'SD / SMP',
        subject: 'IPA (Biologi)',
        question:
            'Mamalia bersayap yang dapat terbang dan aktif di malam hari adalah...',
        options: ['Burung Hantu', 'Kelelawar', 'Tupai Terbang', 'Elang'],
        answer: 1,
        explanation:
            'Kelelawar tergolong mamalia (menyusui) sejati yang memiliki sayap dan terbang lincah.',
    },
    {
        id: 23,
        level: 'SMP / SMA',
        subject: 'Logika & Koding',
        question:
            'Jika A bernilai TRUE dan B bernilai FALSE, berapakah hasil ekspresi A AND B?',
        options: ['TRUE', 'FALSE', 'NULL', 'ERROR'],
        answer: 1,
        explanation:
            'Operasi logika AND hanya bernilai TRUE jika kedua operand bernilai TRUE.',
    },
    {
        id: 24,
        level: 'SD / SMP',
        subject: 'Matematika',
        question:
            'FPB (Faktor Persekutuan Terbesar) dari bilangan 24 dan 36 adalah...',
        options: ['6', '8', '12', '18'],
        answer: 2,
        explanation:
            'Faktor persekutuan: 1, 2, 3, 4, 6, 12. Nilai terbesar adalah 12.',
    },
    {
        id: 25,
        level: 'SMP / SMA',
        subject: 'IPA (Kimia)',
        question:
            'Larutan yang mempunyai tingkat pH kurang dari 7 (< 7) digolongkan sebagai...',
        options: ['Basa', 'Asam', 'Netral', 'Garam'],
        answer: 1,
        explanation:
            'Skala pH di bawah 7 bersifat asam, sedangkan di atas 7 bersifat basa.',
    },
    {
        id: 26,
        level: 'SD / SMP',
        subject: 'Karakter & Umum',
        question: 'Lagu kebangsaan agung "Indonesia Raya" diciptakan oleh...',
        options: ['Ismail Marzuki', 'W.R. Soepratman', 'Kusbini', 'Ibu Soed'],
        answer: 1,
        explanation:
            'Wage Rudolf Soepratman memperdengarkan Indonesia Raya pertama kali di Kongres Pemuda II.',
    },
    {
        id: 27,
        level: 'SD / SMP',
        subject: 'IPS (Geografi)',
        question:
            'Garis khayal yang membagi bumi secara horizontal menjadi belahan utara dan selatan adalah...',
        options: [
            'Garis Bujur 0°',
            'Garis Khatulistiwa (Ekuator)',
            'Garis Balik Utara',
            'Garis Meridian',
        ],
        answer: 1,
        explanation:
            'Garis Khatulistiwa (Ekuator) berada tepat pada lintang 0° bumi.',
    },
    {
        id: 28,
        level: 'SD / SMP',
        subject: 'Bahasa Indonesia',
        question:
            'Gaya bahasa yang melukiskan benda mati seolah bertingkah laku seperti manusia disebut...',
        options: ['Metafora', 'Personifikasi', 'Hiperbola', 'Litotes'],
        answer: 1,
        explanation:
            'Personifikasi memberikan watak insani pada benda mati atau gagasan abstrak.',
    },
    {
        id: 29,
        level: 'SMP / SMA',
        subject: 'Informatika',
        question:
            'Manakah di bawah ini yang BUKAN merupakan bahasa pemrograman?',
        options: ['Python', 'HTML', 'JavaScript', 'C++'],
        answer: 1,
        explanation:
            'HTML adalah bahasa markup untuk struktur konten halaman web, bukan bahasa pemrograman logis.',
    },
    {
        id: 30,
        level: 'SD / SMP',
        subject: 'Matematika',
        question:
            'Sebuah segitiga memiliki alas 10 cm dan tinggi 8 cm. Berapakah luasnya?',
        options: ['80 cm²', '40 cm²', '20 cm²', '18 cm²'],
        answer: 1,
        explanation: 'Luas segitiga = (10 × 8) ÷ 2 = 40 cm².',
    },
];

const CHARACTER_SKINS = BLOCK_SKINS.map((skin, id) => ({
    ...skin,
    id,
    border: '#1f2a44',
    avatarSvg: <MiniBlockAvatar skinIndex={id} />,
}));

interface Player {
    id: number;
    name: string;
    position: number;
    skinIndex: number;
    score: number;
    streak: number;
}

export default function SnakesAndLaddersGame() {
    const { play, muted, toggleMuted } = useGameAudio();
    const generation = useRef(0);
    const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    useEffect(
        () => () => {
            generation.current++;
            timers.current.forEach(clearTimeout);
            timers.current.clear();
        },
        [],
    );
    const later = (fn: () => void, delay: number) => {
        const epoch = generation.current;
        const timer = setTimeout(() => {
            timers.current.delete(timer);
            if (generation.current === epoch) fn();
        }, delay);
        timers.current.add(timer);
    };
    const [numPlayers, setNumPlayers] = useState<number>(2);
    const [players, setPlayers] = useState<Player[]>([
        {
            id: 0,
            name: 'Pemain 1',
            position: 1,
            skinIndex: 0,
            score: 0,
            streak: 0,
        },
        {
            id: 1,
            name: 'Pemain 2',
            position: 1,
            skinIndex: 1,
            score: 0,
            streak: 0,
        },
        {
            id: 2,
            name: 'Pemain 3',
            position: 1,
            skinIndex: 2,
            score: 0,
            streak: 0,
        },
        {
            id: 3,
            name: 'Pemain 4',
            position: 1,
            skinIndex: 3,
            score: 0,
            streak: 0,
        },
    ]);

    const [currentPlayerIndex, setCurrentPlayerIndex] = useState<number>(0);
    const [diceValue, setDiceValue] = useState<number>(1);
    const [isRolling, setIsRolling] = useState<boolean>(false);
    const [showCenterDiceModal, setShowCenterDiceModal] =
        useState<boolean>(false);
    const [isMoving, setIsMoving] = useState<boolean>(false);
    const [winner, setWinner] = useState<Player | null>(null);

    // Question State (Ditampilkan di Tengah Layar / Center Modal)
    const [currentQuestion, setCurrentQuestion] = useState<
        (typeof ALL_QUESTIONS)[0] | null
    >(null);
    const [pendingStepTarget, setPendingStepTarget] = useState<number | null>(
        null,
    );
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [answerFeedback, setAnswerFeedback] = useState<
        'correct' | 'wrong' | null
    >(null);
    const [gameLog, setGameLog] = useState<string[]>([
        'Selamat datang di Ular Tangga Edukasi EduFunHub!',
        'Kocok dadu di tengah layar, jawab soal, dan saksikan karaktermu melangkah mulus!',
    ]);

    const activePlayers = players.slice(0, numPlayers);
    const currentPlayer = activePlayers[currentPlayerIndex];
    const currentSkin =
        CHARACTER_SKINS[currentPlayer.skinIndex % CHARACTER_SKINS.length];

    const diceIcons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
    const CurrentDiceIcon = diceIcons[diceValue - 1] || Dice1;

    const addLog = (msg: string) => {
        setGameLog((prev) => [msg, ...prev.slice(0, 5)]);
    };

    const rollDice = () => {
        if (
            isRolling ||
            isMoving ||
            currentQuestion ||
            winner ||
            showCenterDiceModal
        )
            return;
        play('dice');
        setShowCenterDiceModal(true);
        setIsRolling(true);
        let count = 0;
        const tick = () => {
            const value = Math.floor(Math.random() * 6) + 1;
            setDiceValue(value);
            play('dice');
            if (++count < 12) {
                later(tick, 85);
                return;
            }
            setIsRolling(false);
            const raw = currentPlayer.position + value;
            setPendingStepTarget(raw > 100 ? 200 - raw : raw);
            later(() => {
                setShowCenterDiceModal(false);
                setCurrentQuestion(
                    ALL_QUESTIONS[
                        Math.floor(Math.random() * ALL_QUESTIONS.length)
                    ],
                );
                setSelectedOption(null);
                setAnswerFeedback(null);
                addLog(`${currentPlayer.name} mendapat dadu ${value}.`);
            }, 650);
        };
        later(tick, 85);
    };

    const nextTurn = () =>
        setCurrentPlayerIndex((previous) => (previous + 1) % numPlayers);
    const movePlayer = (position: number, bonus = 0) => {
        setPlayers((previous) =>
            previous.map((p, index) =>
                index === currentPlayerIndex
                    ? { ...p, position, score: p.score + bonus }
                    : p,
            ),
        );
        play('step');
    };
    const finishMovement = (position: number, bonus: number) => {
        setIsMoving(false);
        setPendingStepTarget(null);
        if (position === 100) {
            setWinner({
                ...currentPlayer,
                position,
                score: currentPlayer.score + 100 + bonus,
            });
            play('correct');
        } else if (diceValue !== 6) nextTurn();
        else
            addLog(
                `${currentPlayer.name} mendapat giliran ekstra karena dadu 6.`,
            );
    };
    const executeSmoothStepAnimation = () => {
        setIsMoving(true);
        let position = currentPlayer.position;
        let remaining = diceValue;
        let direction = 1;
        const step = () => {
            if (remaining > 0) {
                if (position === 100) direction = -1;
                position += direction;
                remaining--;
                movePlayer(position);
                later(step, 310);
                return;
            }
            const destination = LADDERS[position] ?? SNAKES[position];
            const bonus = LADDERS[position] ? 50 : 0;
            if (destination) {
                addLog(
                    `${currentPlayer.name}: ${LADDERS[position] ? 'naik tangga' : 'turun ular'} dari ${position} ke ${destination}.`,
                );
                later(() => {
                    movePlayer(destination, bonus);
                    later(() => finishMovement(destination, bonus), 600);
                }, 250);
            } else finishMovement(position, 0);
        };
        later(step, 150);
    };
    const handleAnswer = (option: number) => {
        if (!currentQuestion || answerFeedback) return;
        const correct = option === currentQuestion.answer;
        setSelectedOption(option);
        setAnswerFeedback(correct ? 'correct' : 'wrong');
        play(correct ? 'correct' : 'wrong');
        setPlayers((previous) =>
            previous.map((p, index) =>
                index === currentPlayerIndex
                    ? {
                          ...p,
                          score: p.score + (correct ? 100 : 0),
                          streak: correct ? p.streak + 1 : 0,
                      }
                    : p,
            ),
        );
        addLog(
            `${currentPlayer.name}: ${correct ? 'benar, +100 poin!' : 'belum tepat, giliran berikutnya.'}`,
        );
        later(() => {
            setCurrentQuestion(null);
            setAnswerFeedback(null);
            if (correct) executeSmoothStepAnimation();
            else {
                setPendingStepTarget(null);
                nextTurn();
            }
        }, 2400);
    };
    const resetGame = () => {
        generation.current++;
        timers.current.forEach(clearTimeout);
        timers.current.clear();
        setPlayers((previous) =>
            previous.map((p) => ({ ...p, position: 1, score: 0, streak: 0 })),
        );
        setCurrentPlayerIndex(0);
        setDiceValue(1);
        setWinner(null);
        setCurrentQuestion(null);
        setShowCenterDiceModal(false);
        setIsRolling(false);
        setIsMoving(false);
        setAnswerFeedback(null);
        setPendingStepTarget(null);
        setGameLog(['Permainan baru. Bergiliran pada perangkat yang sama.']);
    };

    return (
        <div className="relative min-h-screen bg-[#FFF9E6] text-[#1f2a44] selection:bg-[#FF6584] selection:text-white">
            <Head title="Ular Tangga Edukasi Karakter - EduFunHub">
                <meta
                    name="description"
                    content="Game board ular tangga karakter edukatif multiplayer online dengan animasi dadu dan kuis interaktif di tengah layar."
                />
            </Head>

            {/* Top Bar Header */}
            <header className="sticky top-0 z-30 border-b-4 border-[#1f2a44] bg-[#FFF9E6]/95 backdrop-blur-md">
                <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/"
                            className="flex h-11 w-11 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-white shadow-[3px_3px_0px_#1f2a44] transition-all hover:-translate-y-0.5"
                        >
                            <ArrowLeft className="h-5 w-5 text-[#1f2a44]" />
                        </Link>
                        <div className="flex flex-col">
                            <span className="font-display text-xl font-black text-[#1f2a44] sm:text-2xl">
                                Ular Tangga{' '}
                                <span className="text-[#FF9E44]">Karakter</span>
                            </span>
                            <span className="text-xs font-bold text-slate-600">
                                100% Gratis • 2–4 pemain bergiliran di satu
                                perangkat
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden rounded-xl border-2 border-[#1f2a44] bg-[#00C9A7] px-3 py-1 text-xs font-black text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] sm:block">
                            edufunhub.com/games/snakes-and-ladders
                        </div>
                        <Button
                            onClick={toggleMuted}
                            variant="outline"
                            aria-pressed={!muted}
                            className="border-[#1f2a44] bg-white text-[#1f2a44] dark:bg-white dark:hover:bg-slate-100"
                        >
                            {muted ? 'Suara mati' : 'Suara aktif'}
                        </Button>
                        <Button
                            onClick={resetGame}
                            variant="outline"
                            className="rounded-xl border-2 border-[#1f2a44] bg-white text-xs font-black text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] hover:bg-slate-100 dark:bg-white dark:hover:bg-slate-100"
                        >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Ulang Permainan
                        </Button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-3 py-3 sm:px-6 lg:px-8">
                {/* Panel Pilihan Pemain & Status Giliran */}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]">
                    <div className="flex flex-wrap items-center gap-2">
                        <Users className="h-5 w-5 text-[#FF9E44]" />
                        <span className="text-sm font-black text-[#1f2a44]">
                            Jumlah Pemain:
                        </span>
                        <div className="flex gap-2">
                            {[2, 3, 4].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => {
                                        setNumPlayers(n);
                                        resetGame();
                                    }}
                                    className={`cursor-pointer rounded-xl border-2 border-[#1f2a44] px-3.5 py-1 text-xs font-black transition-all ${
                                        numPlayers === n
                                            ? 'bg-[#FF9E44] text-white shadow-[2px_2px_0px_#1f2a44]'
                                            : 'bg-white text-[#1f2a44] hover:bg-slate-50'
                                    }`}
                                >
                                    {n} Karakter
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-500">
                            Giliran Melangkah:
                        </span>
                        <div
                            className="flex items-center gap-2 rounded-2xl border-3 border-[#1f2a44] px-3.5 py-1.5 font-display text-xs font-black shadow-[3px_3px_0px_#1f2a44]"
                            style={{
                                backgroundColor: currentSkin.color,
                                color: '#1f2a44',
                            }}
                        >
                            <div className="h-6 w-6">
                                {currentSkin.avatarSvg}
                            </div>
                            <span>
                                {currentPlayer.name} ({currentSkin.name})
                            </span>
                            <span className="rounded-md border border-[#1f2a44] bg-white px-1.5 py-0.5 text-[10px]">
                                Petak {currentPlayer.position}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid gap-8 lg:grid-cols-12">
                    {/* AREA KIRI: PAPAN BOARD GAME 100 PETAK DENGAN BENTUK KARAKTER (8 COLS) */}
                    <div className="lg:col-span-8">
                        <div className="relative mx-auto w-full max-w-[min(100%,calc(100dvh-240px))] rounded-3xl border-3 border-[#1f2a44] bg-white p-2 shadow-[5px_5px_0px_#1f2a44]">
                            <IllustratedSnakesBoard
                                players={activePlayers}
                                moving={isMoving}
                                activeId={currentPlayer.id}
                            />

                            {/* Legend / Keterangan Papan */}
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 border-t-2 border-[#1f2a44]/15 pt-3 text-xs font-bold text-slate-700">
                                <div className="flex items-center gap-1.5">
                                    <span className="inline-block h-3.5 w-3.5 rounded border border-[#1f2a44] bg-[#dcb783]" />
                                    <span>Tangga Edukasi (Naik Cepat)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="inline-block h-3.5 w-3.5 rounded border border-[#1f2a44] bg-[#e76866]" />
                                    <span>Jebakan Ular (Turun)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="inline-block h-3.5 w-3.5 rounded border border-[#1f2a44] bg-[#FFF176]" />
                                    <span>Petak 100 (Juara Finish)</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AREA KANAN: KONTROL, PROFIL KARAKTER & LOG PERMAINAN (4 COLS) */}
                    <div className="space-y-4 lg:col-span-4 lg:max-h-[calc(100dvh-200px)] lg:overflow-y-auto lg:pr-2">
                        {/* KONTROL UTAMA DADU */}
                        <div className="rounded-3xl border-3 border-[#1f2a44] bg-white p-6 shadow-[5px_5px_0px_#1f2a44]">
                            <div className="flex items-center justify-between border-b-2 border-[#1f2a44]/10 pb-3">
                                <div className="flex items-center gap-2">
                                    <Gamepad2 className="h-5 w-5 text-[#FF9E44]" />
                                    <span className="font-display text-base font-black text-[#1f2a44]">
                                        Pelontar Dadu
                                    </span>
                                </div>
                                <span className="rounded-full border border-[#1f2a44] bg-[#FFFDE6] px-2.5 py-0.5 text-xs font-bold">
                                    {currentPlayer.name}
                                </span>
                            </div>

                            {/* Tombol Lempar Dadu yang Memicu Animasi Tengah Layar */}
                            <div className="mt-6 flex flex-col items-center justify-center">
                                <div className="flex items-center gap-3">
                                    <div className="h-16 w-16">
                                        {currentSkin.avatarSvg}
                                    </div>
                                    <div>
                                        <div className="font-display text-lg font-black text-[#1f2a44]">
                                            {currentPlayer.name}
                                        </div>
                                        <div className="text-xs font-bold text-slate-500">
                                            Karakter: {currentSkin.name}
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    onClick={rollDice}
                                    disabled={
                                        isRolling ||
                                        isMoving ||
                                        currentQuestion !== null ||
                                        winner !== null ||
                                        showCenterDiceModal
                                    }
                                    className="mt-6 w-full cursor-pointer rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] py-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-0.5 hover:bg-[#ff8f29] hover:shadow-[6px_6px_0px_#1f2a44] active:translate-y-0 active:shadow-[2px_2px_0px_#1f2a44] disabled:opacity-50"
                                >
                                    <Shuffle className="mr-2 h-5 w-5" />
                                    {isRolling || showCenterDiceModal
                                        ? 'Dadu Berputar di Layar...'
                                        : isMoving
                                          ? 'Karakter Melangkah...'
                                          : 'Kocok Dadu di Layar!'}
                                </Button>
                                <span className="mt-2 text-center text-[11px] font-bold text-slate-500">
                                    *Animasi dadu dan kuis akan muncul langsung
                                    di tengah layar
                                </span>
                            </div>

                            {/* Daftar Skor & Posisi Karakter */}
                            <div className="mt-6 space-y-2.5 border-t-2 border-[#1f2a44]/10 pt-4">
                                <span className="text-xs font-black text-slate-500 uppercase">
                                    Pemain di Arena:
                                </span>
                                {activePlayers.map((p, idx) => {
                                    const pSkin =
                                        CHARACTER_SKINS[
                                            p.skinIndex % CHARACTER_SKINS.length
                                        ];
                                    const isTurn = idx === currentPlayerIndex;

                                    return (
                                        <div
                                            key={p.id}
                                            className={`flex items-center justify-between rounded-2xl border-2 border-[#1f2a44] p-2.5 transition-all ${
                                                isTurn
                                                    ? 'translate-x-1 bg-[#FFFDE6] shadow-[3px_3px_0px_#1f2a44]'
                                                    : 'bg-white opacity-85'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-8 w-8">
                                                    {pSkin.avatarSvg}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-[#1f2a44]">
                                                        {p.name}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-500">
                                                        {pSkin.name}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-bold">
                                                <span className="rounded-lg border border-[#1f2a44] bg-white px-2 py-0.5">
                                                    Petak:{' '}
                                                    <strong>
                                                        {p.position}
                                                    </strong>
                                                </span>
                                                <span className="rounded-lg bg-[#FF9E44]/20 px-2 py-0.5 text-[#1f2a44]">
                                                    {p.score} Pts
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* PEMENANG PERMAINAN */}
                        {winner && (
                            <div className="rounded-3xl border-3 border-[#1f2a44] bg-[#FFF176] p-6 text-center shadow-[6px_6px_0px_#1f2a44]">
                                <Trophy className="mx-auto h-16 w-16 text-[#FF9E44]" />
                                <h2 className="mt-2 font-display text-2xl font-black text-[#1f2a44]">
                                    {winner.name} Menjadi Juara!
                                </h2>
                                <p className="mt-1 text-xs font-bold text-slate-700">
                                    Berhasil menyelesaikan petak 100 dengan
                                    total skor{' '}
                                    <strong>{winner.score} Poin</strong>!
                                </p>
                                <Button
                                    onClick={resetGame}
                                    className="mt-4 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-6 py-2 font-display text-sm font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                                >
                                    Main Lagi
                                </Button>
                            </div>
                        )}

                        {/* LIVE GAME LOG */}
                        <div className="rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[4px_4px_0px_#1f2a44]">
                            <span className="text-xs font-black text-slate-500 uppercase">
                                Catatan Langkah:
                            </span>
                            <div className="mt-2 space-y-1.5">
                                {gameLog.map((log, lIdx) => (
                                    <div
                                        key={lIdx}
                                        className="rounded-lg border border-[#1f2a44]/10 bg-[#FFFDE6] px-3 py-1.5 text-xs font-semibold text-slate-700"
                                    >
                                        {log}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* ======================================================== */}
            {/* OVERLAY 1: ANIMASI KOCOK DADU DI TENGAH LAYAR (CENTER MODAL) */}
            {/* ======================================================== */}
            {showCenterDiceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="flex w-full max-w-sm animate-in flex-col items-center justify-center rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-8 text-center shadow-[10px_10px_0px_#1f2a44] duration-200 zoom-in-75">
                        <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-3 py-1 text-xs font-black text-[#1f2a44]">
                            <Sparkles className="h-3.5 w-3.5 text-[#FF9E44]" />
                            {currentPlayer.name} Mengocok Dadu...
                        </div>

                        {/* Animasi Putaran Dadu Besar */}
                        <div className="my-6">
                            <div
                                className={`flex h-32 w-32 items-center justify-center rounded-3xl border-4 border-[#1f2a44] bg-white shadow-[8px_8px_0px_#1f2a44] transition-all duration-100 ${
                                    isRolling
                                        ? 'scale-110 rotate-12 animate-pulse bg-[#FFF176]'
                                        : 'scale-105 bg-[#00C9A7]'
                                }`}
                            >
                                <CurrentDiceIcon className="h-20 w-20 stroke-[2.5] text-[#1f2a44]" />
                            </div>
                        </div>

                        <div className="font-display text-3xl font-black text-[#1f2a44]">
                            {isRolling
                                ? 'Memutar Angka...'
                                : `Dadu: ${diceValue}!`}
                        </div>
                        <p className="mt-2 text-xs font-bold text-slate-600">
                            {isRolling
                                ? 'Bersiaplah menjawab tantangan soal!'
                                : 'Membuka pertanyaan kuis di layar...'}
                        </p>
                    </div>
                </div>
            )}

            {/* ======================================================== */}
            {/* OVERLAY 2: MODAL PERTANYAAN DI TENGAH LAYAR (CENTER MODAL) */}
            {/* ======================================================== */}
            {currentQuestion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="relative max-h-[90dvh] w-full max-w-lg animate-in overflow-y-auto rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-6 shadow-[10px_10px_0px_#1f2a44] duration-200 zoom-in-95 fade-in sm:p-8">
                        {/* Header Kuis */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#1f2a44]/15 pb-4">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8">
                                    {currentSkin.avatarSvg}
                                </div>
                                <span className="font-display text-sm font-black text-[#1f2a44]">
                                    Giliran {currentPlayer.name}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="rounded-full border-2 border-[#1f2a44] bg-[#00C9A7] px-3 py-0.5 text-xs font-black text-[#1f2a44]">
                                    {currentQuestion.subject}
                                </span>
                                <span className="rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-2.5 py-0.5 text-xs font-black text-[#1f2a44]">
                                    Maju {diceValue} Petak
                                </span>
                            </div>
                        </div>

                        {/* Pertanyaan */}
                        <div className="my-5 rounded-2xl border-3 border-[#1f2a44] bg-white p-5 text-center shadow-[4px_4px_0px_#1f2a44]">
                            <span className="text-[11px] font-black tracking-wider text-[#845EC2] uppercase">
                                Level: {currentQuestion.level}
                            </span>
                            <h3 className="mt-2 font-display text-base leading-snug font-black text-[#1f2a44] sm:text-xl">
                                {currentQuestion.question}
                            </h3>
                        </div>

                        {/* Pilihan Jawaban */}
                        <div className="space-y-2.5">
                            {currentQuestion.options.map((opt, optIdx) => {
                                let btnStyle =
                                    'bg-white hover:bg-slate-50 text-[#1f2a44] border-2 border-[#1f2a44]';
                                if (selectedOption !== null) {
                                    if (optIdx === currentQuestion.answer) {
                                        btnStyle =
                                            'bg-[#00C9A7] text-[#1f2a44] border-3 border-[#1f2a44] font-black scale-102';
                                    } else if (optIdx === selectedOption) {
                                        btnStyle =
                                            'bg-[#FF6584] text-white border-3 border-[#1f2a44] font-black';
                                    }
                                }

                                return (
                                    <button
                                        key={optIdx}
                                        type="button"
                                        disabled={answerFeedback !== null}
                                        onClick={() => handleAnswer(optIdx)}
                                        className={`flex w-full cursor-pointer items-center justify-between rounded-2xl p-3.5 text-left text-xs font-bold shadow-[2px_2px_0px_#1f2a44] transition-all sm:text-sm ${btnStyle}`}
                                    >
                                        <span>{opt}</span>
                                        {selectedOption !== null &&
                                            optIdx ===
                                                currentQuestion.answer && (
                                                <CheckCircle2 className="h-5 w-5 text-[#1f2a44]" />
                                            )}
                                        {selectedOption !== null &&
                                            optIdx === selectedOption &&
                                            optIdx !==
                                                currentQuestion.answer && (
                                                <XCircle className="h-5 w-5 text-white" />
                                            )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Feedback Benar / Salah Sebelum Modal Menutup */}
                        {answerFeedback && (
                            <div
                                className={`mt-5 animate-in rounded-2xl border-3 border-[#1f2a44] p-4 text-xs font-bold shadow-[3px_3px_0px_#1f2a44] fade-in slide-in-from-bottom-2 ${
                                    answerFeedback === 'correct'
                                        ? 'bg-[#E8FAF6] text-[#00897B]'
                                        : 'bg-[#FFEBF0] text-[#D81B60]'
                                }`}
                            >
                                {answerFeedback === 'correct' ? (
                                    <div>
                                        🎉 <strong>BENAR SEKALI!</strong>{' '}
                                        Karakter melangkah {diceValue} petak
                                        menuju petak {pendingStepTarget}...
                                        <p className="mt-1 text-[11px] text-slate-700">
                                            {currentQuestion.explanation}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        ❌ <strong>KURANG TEPAT!</strong>{' '}
                                        Langkah dibatalkan untuk giliran ini.
                                        <p className="mt-1 text-[11px] text-slate-700">
                                            {currentQuestion.explanation}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
