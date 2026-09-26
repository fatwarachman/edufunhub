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
