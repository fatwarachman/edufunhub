# 🎪 EduFunHub

> **Platform Edukasi Interaktif & Gamified: Belajar Jadi Super Seru, Penuh Tantangan, dan Anti-Ngebosenin!**

EduFunHub adalah platform pembelajaran masa depan yang menggabungkan materi akademis & pengetahuan umum dengan mekanik video game (gamification). Dirancang agar proses belajar tidak lagi terasa kaku atau membosankan, melainkan menjadi petualangan harian yang dinanti-nanti.

---

## ✨ Nilai Utama & Fitur Unggulan

### 1. 🎁 Quiz Harian Berhadiah (Real Rewards)
- Uji wawasan setiap hari lewat kuis bertarget waktu.
- Kumpulkan koin dan poin prestasi yang bisa ditukarkan dengan reward nyata: merchandise eksklusif, voucher belajar, dan badge kehormatan digital.

### 2. ⚔️ Live Duel 1 vs 1 & Room Kelas
- Mode adu kecerdasan real-time melawan teman atau rival se-Indonesia.
- Fitur ruang kelas khusus untuk guru/fasilitator membuat turnamen belajar interaktif.

### 3. 👾 RPG Gamification & Pulau Ilmu
- Buat dan kustomisasi avatar karakter sendiri.
- Jelajahi peta tematik *Pulau Ilmu* (Matematika Cepat, Lab Sains & Alam, Petualangan Sejarah & Dunia).
- Kumpulkan XP, buka level baru, dan raih titel master.

### 4. 🏆 Leaderboard & Daily Streak
- Pertahankan streak harian untuk menjaga konsistensi belajar.
- Bersaing sehat di papan peringkat mingguan nasional untuk mendapatkan penghargaan top learner.

---

## 🛠️ Arsitektur & Tech Stack

EduFunHub memakai pemisahan tanggung jawab berikut:

- **Portal web & pengaturan admin:** Laravel + Inertia React. Semua autentikasi, akun, workspace, CMS, konfigurasi, dashboard admin, dan operasi platform berada di Laravel.
- **Game & gameplay:** Go. Semua runtime permainan, aturan game, state permainan, sesi multiplayer, scoring, collision, animasi/game loop, dan komunikasi real-time gameplay wajib dibuat sebagai service atau module Go.
- **Batas integrasi:** Laravel menangani portal dan administrasi; Laravel tidak menjadi engine gameplay. Frontend game berkomunikasi dengan backend Go melalui API atau WebSocket yang terdokumentasi.
- **Web Server:** Nginx Alpine
- **Containerization:** Docker & Docker Compose
- **Network & Tunnel:** Cloudflare Zero Trust Tunnel
- **Frontend Engine:** React, Inertia, Tailwind CSS, Google Fonts (Fredoka & Quicksand)

**Aturan wajib:** runtime game menggunakan Golang (Go) dalam container Docker terpisah dari Laravel. React hanya menangani rendering dan input; aturan serta state gameplay authoritative berada di Go.

Dokumen arsitektur: [`docs/architecture.md`](docs/architecture.md). Panduan agent: [`DEVELOPER.md`](DEVELOPER.md).


---

## 🚀 Quick Start (Docker Deployment)

### 1. Clone Repository
```bash
git clone -b dev https://github.com/fatwarachman/edufunhub.git
cd edufunhub
```

### 2. Jalankan Stack
```bash
docker compose up -d
```

### 3. Akses Layanan
- **Lokal:** `http://localhost:8095`
- **Produksi / Live Tunnel:** `https://landing.edufunhub.com`

---

## 📂 Struktur Direktori

```text
edufunhub/
├── .gitignore
├── README.md
├── docker-compose.yml       # Definisi service web (Nginx) & Cloudflare Tunnel
└── public/
    └── index.html           # Landing page interaktif & mini-quiz preview
```

---

## 👨‍💻 Author & Maintainer

- **Creator:** Fatwarachman
- **Copyright:** &copy; 2026 EduFunHub. All rights reserved.
