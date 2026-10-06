/**
 * Questions for practice on one device. The page receives the active bank
 * questions for Ular Tangga (`practiceQuestions`); this built-in set (also
 * seeded into the bank as `sl-01`…`sl-30`) is only the offline fallback.
 */
export interface OfflineQuestion {
    id: number;
    key?: string;
    level: string;
    subject: string;
    question: string;
    options: string[];
    answer: number;
    explanation: string;
}

export const OFFLINE_QUESTIONS: OfflineQuestion[] = [
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
