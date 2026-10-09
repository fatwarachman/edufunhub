# EduFunHub — Design System

> Bagian dari [`README.md`](README.md). Semua nilai di bawah diambil dari kode yang sudah berjalan (`resources/css/*.css`, `components/multiplayer/room.tsx`, `components/site-nav.tsx`, `components/admin/*`). Jangan menambah warna, radius, atau bayangan di luar daftar ini tanpa persetujuan pemilik.

## 1. Tiga permukaan (surface) — pilih satu per halaman

| Surface | Dipakai di | Gaya | Mode gelap |
|---|---|---|---|
| **Game** | `/games/*`, `/arena/*`, `/play/*`, `/gamelist` | Playful neo-brutalist: tinta `#1f2a44`, border 2–3 px, bayangan offset keras, latar pastel per game, Fredoka | **Tidak** (selalu terang, warna eksplisit) |
| **Player portal** | `/portal`, `/dashboard`, `/leaderboard`, `/chat`, `/friends`, `/character`, `/profile`, `/teacher/*` via `PlayerLayout` | Sama keluarga dengan game, token di `.auth-landing` (`resources/css/auth-landing.css`): tinta `#151b2e`, krem `#faf7ef`, amber `#f5a623`, kartu `.auth-card` | **Tidak** (`color-scheme: light`) |
| **Admin** | `/admin/*` via `AdminLayout` | shadcn/ui + token semantik (`bg-card`, `text-foreground`, `border-border`, `bg-primary`) | **Wajib** mendukung terang & gelap |

Aturan: surface game/portal **tidak memakai** token shadcn yang berubah di mode gelap (`bg-background`, `text-foreground`) untuk elemen bergaya tebal; pakai warna eksplisit. Surface admin **tidak memakai** border tebal hitam/bayangan offset.

## 2. Warna

### 2.1 Palet inti (game & portal)

| Token | Hex | Tailwind | Fungsi |
|---|---|---|---|
| Ink (game) | `#1f2a44` | `text-[#1f2a44]`, `border-[#1f2a44]`, `--color-bubble-ink` | Teks utama, semua garis & bayangan di game |
| Ink (portal) | `#151b2e` | `var(--auth-ink)` | Teks/garis di `PlayerLayout` & `.edu-nav-btn` |
| Orange | `#FF9E44` (hover `#ff8f29`) | `bg-[#FF9E44]`, `--color-bubble-orange` | CTA utama game (Buat ruang, Mulai) |
| Amber | `#f5a623` | `var(--auth-amber)` | CTA portal, bayangan tombol primer gelap |
| Yellow | `#ffd93d` / `#FFF176` | `bg-[#ffd93d]`, `--color-bubble-yellow` | Highlight, chip aktif, hover tombol, juara 1 |
| Pink | `#FF6584` | `--color-bubble-pink` | Aksen judul, seleksi teks |
| Purple | `#6c5ce7` / `#845ec2` | `--color-bubble-purple` | Focus ring nav, aksen sekunder |
| Mint | `#00c9a7` / `#c9f5e5` | `--color-bubble-green` | Sukses, chip "online", tombol tambah |
| Blue | `#4d8fac` | `--color-bubble-blue` | Aksen info |
| Cream | `#FFF9E6` / `#FFFDE6` / `#FFFDF7` / `#faf7ef` | — | Latar halaman & dialog |
| Error bg / text | `#FFEBF0` / `#AD1457` | — | Kotak error ruang (`RoomError`) |
| Slate | `text-slate-600`, `text-slate-700`, `text-slate-500` | — | Teks sekunder (subtitle, hint) |

### 2.2 Identitas per game

Setiap game punya **satu** `accent` dan **satu** `BG`:

- `accent` didaftarkan di `config/game-catalog.php` (`'accent' => '#0f766e'`) dan `GAME_COLORS` di `resources/js/components/admin/dashboard-kit.tsx` — **nilai sama**.
- Konstanta di `components/<game>/shared.tsx`: `export const ACCENT = '#ea580c'; export const BG = '#fff4e6'; export const INK = '#1f2a44';`
- Accent dipakai untuk kotak ikon di header, progress, highlight. BG = latar halaman + header. Pilih accent yang belum dipakai game lain (cek `GAME_COLORS`) dan BG versi sangat terang (lightness ≥ 95 %) dari accent.
- Warna status gameplay (benar/salah/peringatan) pakai turunan yang lolos kontras AA dengan teks putih: hijau `#15803d`, amber `#b45309`, merah `#be123c` (lihat `MOOD_TONE` Monster Café).

### 2.3 Admin (token, otomatis terang/gelap)

Didefinisikan di `resources/css/app.css` (`:root` dan `.dark`). Pakai **hanya** utilitas token: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary text-primary-foreground`, `text-destructive`, `ring-ring`, `link` (utility teks tautan). Grafik: `var(--chart-1)` … `var(--chart-5)`, tooltip `chartTooltipStyle`, sumbu `axisTick` (`dashboard-kit.tsx`), warna per game `GAME_COLORS`.

Warna semantik non-token wajib berpasangan `dark:`: contoh `bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200` (`FlashMessages`), `text-green-700 dark:text-green-400`.

### 2.4 Kontras

- Teks normal ≥ 4.5:1, teks besar (≥ 18 px bold) ≥ 3:1.
- Putih di atas `#FF9E44` hanya untuk teks besar tebal (`font-display text-lg font-black`). Teks kecil di atas oranye/kuning pakai ink.
- Jangan menaruh teks `slate-500` di atas pastel gelap; uji dengan kontras checker (lihat `qa-and-release.md`).

## 3. Tipografi

| Peran | Font | Kelas |
|---|---|---|
| Display (judul game, angka besar, CTA game, PIN) | Fredoka 600–700 | `font-display font-black` |
| Body game & admin | Quicksand | default `font-sans` |
| Portal & tombol nav | Instrument Sans / DM Sans | otomatis di `.auth-landing`, `.edu-nav-btn` |

Skala yang dipakai:

| Elemen | Kelas |
|---|---|
| Judul header game | `truncate font-display text-lg font-black sm:text-2xl` |
| Subjudul header game | `hidden truncate text-xs font-bold text-slate-600 sm:block` |
| Hero portal (h1) | `text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl md:text-4xl` |
| Heading section game (h2) | `font-display text-xl font-black` (dialog) – `text-3xl sm:text-5xl` (hero daftar game) |
| Eyebrow / label kecil | `text-[11px]–text-xs font-black uppercase tracking-[0.07em–0.2em]` |
| PIN | `font-display text-3xl font-black tracking-[0.2em] sm:text-5xl` |
| Angka / skor | tambah `tabular-nums` |
| Admin h1 | `text-2xl font-bold text-foreground` |
| Admin deskripsi | `max-w-2xl text-sm text-muted-foreground` |

Berat: game memakai `font-bold` untuk body dan `font-black` untuk penekanan; admin memakai `font-medium`/`font-semibold`/`font-bold`. Jangan pakai `font-light`.

## 4. Border, radius, bayangan

| Elemen game | Border | Radius | Bayangan |
|---|---|---|---|
| Panel utama / kartu besar | `border-3 border-[#1f2a44]` | `rounded-3xl` | `shadow-[5px_5px_0px_#1f2a44]` |
| Kartu daftar / kartu kecil | `border-3` | `rounded-2xl` | `shadow-[4px_4px_0px_#1f2a44]` |
| Tombol CTA | `border-3` | `rounded-2xl` | `shadow-[4px_4px_0px_#1f2a44]` |
| Tombol/chip sekunder, input | `border-2` | `rounded-xl` | `shadow-[2px_2px_0px_#1f2a44]` |
| Dialog | `border-[3px]` | `rounded-3xl` | `shadow-[6px_6px_0px_#1f2a44]` |
| Badge/pill | `border` / `border-2` | `rounded-full` | `shadow-[3px_3px_0px_#1f2a44]` (badge hero) |
| Kotak ikon header | `border-2` | `rounded-xl size-10` | `shadow-[2px_2px_0px_#1f2a44]` |
| Area dashed (PIN, kosong) | `border-3 border-dashed` | `rounded-2xl` | — |
| Header game | `border-b-4 border-[#1f2a44]` | — | — |

Interaksi tombol tebal: `active:translate-x-[2px] active:translate-y-[2px] active:shadow-none` (sama dengan `.edu-nav-btn:active`).

Admin: `rounded-2xl border border-border bg-card shadow-sm` (panel), `rounded-lg` (tombol, input `h-9`), `rounded-full` (pill). Modal admin mode gelap: `dark:border-white/15` + glow halus (lihat `ConfirmDialog`).

## 5. Spacing & layout

- Gunakan `gap-*` untuk jarak antar item, bukan margin.
- Container halaman game: `<main className="mx-auto flex flex-col gap-4 px-3 py-5 sm:px-6 lg:px-8">`. Panel tengah: `mx-auto w-full max-w-xl` (form/lobi), `max-w-3xl` (tutorial), `max-w-[1120px]` (arena dua kolom).
- Header game: `mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8`.
- Player portal: `PlayerLayout` sudah memberi `px-[clamp(16px,2vw,32px)] py-6 md:py-8 gap-8`; jangan menambah padding luar lagi.
- Admin: konten di dalam `AdminLayout` dibungkus `<div className="flex flex-col gap-6">`; panel di-grid `grid gap-4 sm:grid-cols-2 lg:grid-cols-4` (KPI) / `lg:grid-cols-2` (panel).
- Padding panel: `p-5`/`p-6` mobile, `sm:p-7`/`sm:p-8` desktop.
- Semua anak flex/grid yang berisi teks panjang wajib `min-w-0` + `truncate`/`break-words` agar tidak mendorong lebar.

## 6. Breakpoint & responsif

| Nama | Lebar | Catatan |
|---|---|---|
| default | < 640 px | Ponsel. Nav jadi ikon-saja (`.edu-nav-bar`), jam header disembunyikan < 640 px |
| `sm` | ≥ 640 | Subjudul header & kotak ikon game muncul |
| `md` | ≥ 768 | |
| `lg` | ≥ 1024 | Dua kolom arena |
| `xl` | ≥ 1280 | |
| CSS game | `@media (max-width: 760px)` | Breakpoint ponsel di file CSS game; tambahan `max-height` untuk layar pendek, `max-width: 380px`/`359px` untuk ponsel sempit |

Wajib: tanpa scroll horizontal di 320, 360, 390, 768, 1280 px; kontrol tidak terpotong; `min-h-dvh` (bukan `100vh`) untuk halaman penuh; hormati `env(safe-area-inset-*)` untuk elemen fixed di bawah/atas. Tabel admin/pemain yang lebar pakai `ResponsiveTable` (otomatis jadi akordeon).

## 7. Ikon

- Library: `lucide-react` saja. Ikon katalog game didaftarkan di `GAME_ICONS` (`resources/js/lib/games.ts`) dan dirujuk lewat key (`'icon' => 'chef'`).
- Ukuran: `size-4` (inline/teks kecil), `size-5` (tombol, header), `18px` di `.edu-nav-btn`, `size-8` (empty state).
- Jarak ikon–teks: `gap-1.5` (chip) atau `gap-2` (tombol).
- **Tanpa emoji** sebagai ikon atau dekorasi UI. Ilustrasi game = SVG/komponen `art.tsx` milik game.

## 8. Komponen standar

### 8.1 Tombol (game)

```tsx
// CTA utama (oranye)
className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
// Primer gelap (Gabung, Mulai di form)
className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-4 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44] disabled:opacity-50"
// Sekunder / chip
className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#FFF176]"
```

Navigasi (back, nav header, mute, menu): **selalu** `.edu-nav-btn` lewat `NavButton`/`BackButton` (`components/site-nav.tsx`), varian `--primary`, `--icon` (44×44), `--block`. Tombol ikon-saja mute: `<button className="edu-nav-btn edu-nav-btn--icon" aria-label={…} aria-pressed={muted}>`.

### 8.2 Input (game)

`min-h-12 rounded-xl border-2 border-[#1f2a44] bg-white px-3.5 font-bold outline-none focus-visible:ring-4 focus-visible:ring-[#FF9E44]/40`. Input PIN: tambahkan `text-center font-display text-xl tracking-[0.3em]`, `inputMode="numeric"`, `maxLength={6}`.

### 8.3 Panel, kartu, notice

- Panel game: `rounded-3xl border-3 border-[#1f2a44] bg-white p-6 text-[#1f2a44] shadow-[5px_5px_0px_#1f2a44] sm:p-8`.
- Error: `RoomError` (game) / `FlashMessages` (admin). Jangan buat kotak error sendiri.
- Kosong (game/portal): `rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-6 text-center text-sm` (lihat `leaderboard/index.tsx`). Admin: `EmptyState` (`components/admin/game-stats.tsx`).
- Skeleton: `animate-pulse rounded-xl border-2 border-[#151b2e]/15 bg-[#151b2e]/[0.06]` dengan `role="status"` + `aria-label`. Wajib untuk deferred props.

### 8.4 Dialog / modal

Game/portal:

```tsx
<div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#1f2a44]/60 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="…">
  <div className="relative w-full max-w-md rounded-3xl border-[3px] border-[#1f2a44] bg-[#FFFDF7] p-5 text-[#1f2a44] shadow-[6px_6px_0px_#1f2a44]">
    {/* tombol tutup: absolute top-3 right-3 size-11 rounded-full, aria-label */}
  </div>
</div>
```

Wajib: tutup via tombol, **Esc**, dan klik di luar; fokus awal ke dialog; bottom-sheet di ponsel (`items-end`), tengah di `sm`. Contoh: `HostExitDialog` (`components/multiplayer/host-controls.tsx`). Admin: `ConfirmDialog` (`components/admin/admin-kit.tsx`) atau `components/ui/dialog`.

**Dilarang** `window.alert` / `window.confirm` / `prompt`. (Sisa lama di `teacher/index.tsx` dan `session-summary-card.tsx` jangan ditiru.) Notifikasi singkat: `sonner` (`toast`) yang sudah terpasang di `app.tsx`.

### 8.5 Avatar & pemain

`PlayerAvatar character={…} seat={…} userId={…}` untuk semua tampilan pemain (titik online otomatis). Kursi tanpa akun memakai look bawaan per `seat`. Jangan menggambar avatar sendiri.

## 9. Z-index

| Lapisan | Nilai |
|---|---|
| Elemen dalam konten | `z-10`, `z-20` |
| Header sticky game | `z-30` (daftar game `z-40`, header portal `.auth-header` 50) |
| Dropdown/menu nav | `z-50` |
| Confetti finale | `z-[60]` |
| Dialog game | `z-[70]` |
| Popup chat global | `z-[90]` |
| Bar impersonation | `z-[100]` |

Jangan memakai nilai di luar tabel.

## 10. Motion

- Durasi mikro 120–150 ms (`transition-colors`, transform tombol). Masuk elemen: `.animate-fade-in-up` (600 ms).
- Animasi gameplay: CSS transform/opacity atau `requestAnimationFrame`; jangan menganimasikan `width/left/top` tiap frame. GSAP tersedia (`gsap`) untuk sekuens kompleks.
- **`prefers-reduced-motion: reduce`**: matikan autoplay tutorial, confetti, goyangan, parallax. Pola: `useSyncExternalStore` + `matchMedia('(prefers-reduced-motion: reduce)')` (lihat `components/ping-pong/how-to-play.tsx`) dan blok `@media (prefers-reduced-motion: reduce)` di CSS game.
- Suara: efek via `useGameAudio()` (`lib/game-sounds.ts`, Web Audio sintetis, mengikuti setelan admin) atau modul suara game (`lib/<game>-sounds.ts`). Selalu ada tombol mute di header.

## 11. CSS khusus game

- Satu file per game: `resources/css/<game>.css`, diimpor di halaman game (`import '../../../css/<game>.css';`). (Ping Pong menyimpan CSS di `components/ping-pong/ping-pong.css` — game baru ikuti pola `resources/css/`.)
- Semua kelas diberi prefix 2–3 huruf unik: `pp-`, `mc-`, `bb-`, `tt-`, `or-`, `eh-`, `fd-`, `fq-`, `kt-`. Cek dulu prefix belum dipakai (`grep -rn "^\.<prefix>-" resources/css resources/js`).
- Pakai Tailwind untuk layout umum; file CSS untuk papan/arena/animasi kompleks. Jangan override kelas global (`.edu-*`, `.auth-*`) dari CSS game.
- Jangan menulis `@tailwind`, jangan membuat `tailwind.config.js`; token baru (jika disetujui) masuk `@theme` di `resources/css/app.css`.

## 12. Aksesibilitas (wajib)

- Satu `<h1>` per halaman; heading berurutan.
- Ikon dekoratif `aria-hidden="true"`; tombol ikon-saja `aria-label` dari locale.
- Status yang berubah (giliran, timer, hasil jawaban) `role="status"`/`aria-live="polite"`; error `role="alert"`.
- Toggle `aria-pressed`, tab `role="tab"` + `aria-selected`, langkah tutorial `aria-current="step"`.
- Fokus terlihat: `focus-visible:ring-4 focus-visible:ring-[#FF9E44]/40` (game) / outline `#6c5ce7` (nav) / `focus-visible:ring-2 ring-ring` (admin).
- Keyboard: semua aksi gameplay bisa dengan keyboard (panah, angka 1–4 untuk opsi bila relevan, Enter, Esc).
- Warna bukan satu-satunya penanda (benar/salah juga pakai ikon/teks).

## 13. Anti-pola (ditolak saat review)

- Gradien ungu-biru generik, glassmorphism di halaman game, kartu tanpa border tinta di surface game.
- Emoji sebagai ikon; teks UI hardcode; kunci i18n mentah tampil di layar.
- Tombol < 44 px, teks terpotong, overflow horizontal, ikon dan teks tidak sejajar.
- Komponen duplikat (tombol back, lobi, dialog, papan peringkat) yang meniru komponen bersama.
- `alert()`/`confirm()`; `100vh` di ponsel; z-index acak; warna accent game berbeda antara katalog dan admin.
