# EduFunHub — Panduan Fitur, Halaman & Menu

> Bagian dari [`README.md`](README.md). Gaya visual: [`design-system.md`](design-system.md). Keamanan & middleware lengkap: [`../../DEVELOPER.md`](../../DEVELOPER.md).

## 1. Pilih jenis halaman

| Jenis | URL | Layout | Gaya | Contoh |
|---|---|---|---|---|
| Halaman game | `/games/<key>`, `/arena/…`, `/play/…` | header game sendiri (lihat `game-development.md` §3.1) | Game | `pages/games/ping-pong.tsx` |
| Halaman pemain | `/dashboard`, `/portal`, `/leaderboard`, `/friends`, `/chat`, `/character`, `/profile`, `/players/*`, `/ability`, `/feedback` | `PlayerLayout title={…}` (`fill` untuk layar penuh seperti chat) | Portal | `pages/user/dashboard.tsx`, `pages/leaderboard/index.tsx` |
| Portal guru | `/teacher/*` | `PlayerLayout` | Portal | `pages/teacher/index.tsx` |
| Admin | `/admin/*` | `AdminLayout` | Admin (shadcn + dark mode) | `pages/admin/subjects/index.tsx` |
| Auth | `/login`, `/register`, … | `auth-shell` / `.auth-landing` | Portal | `pages/auth/*` |

Halaman baru **tidak boleh** membuat layout/header sendiri selain halaman game.

## 2. Backend (Laravel 13, PHP 8.4)

### 2.1 Struktur

- Controller tipis di `app/Http/Controllers` (`Admin/`, `Teacher/`, `Chat/`, `Settings/`). Logika bisnis di `app/Services`.
- Validasi **selalu** Form Request (`app/Http/Requests`, admin di `Requests/Admin`), lengkap `rules()` + `messages()` (pesan lewat `__()` / `lang/`). Ikuti gaya array rules (`['required', 'string', Rule::in(...)]`).
- Model baru: `php artisan make:model -mf --no-interaction` (migration + factory), relasi bertipe, `casts()` method, seeder demo bila fitur tampil di UI.
- Tidak ada `DB::` bila Eloquent cukup; cegah N+1 dengan eager loading; `request()->all()` dilarang tanpa whitelist.
- PHP: constructor property promotion, return type eksplisit, kurung kurawal di semua control structure, PHPDoc array shape, tanpa komentar inline kecuali logika rumit.
- Konfigurasi aplikasi yang bisa diubah admin = model `Setting` (`Setting::get/set/group`), bukan `env()`/`config()` mutable. `env()` hanya di `config/*.php`.
- Octane: jangan injeksi `Request`/`Auth`/`Config` ke singleton; jangan menambah static property.

### 2.2 Route

| Area | File | Grup / middleware |
|---|---|---|
| Pemain | `routes/web.php` | `['auth', EnsurePlayerIsActive::class]`; game di dalam `EnsurePlayerDetailsComplete` |
| Guru | `routes/web.php` | `EnsureTeacher::class`, prefix `teacher.` |
| Admin | `routes/admin.php` | `['web', 'auth', EnsureAdmin::class, 'verified']`, prefix `admin.`; halaman sensitif + `EnsureSuperadmin::class` |
| API internal Go | `routes/api.php` (`/api/internal/*`) | tanda tangan HMAC; diblokir 404 di gateway publik |

- Selalu bernama (`->name(...)`), URL di kode lewat `route()` / Wayfinder (`@/routes/...`, `@/actions/...`), bukan hardcode bila route bernama tersedia.
- Endpoint yang bisa disalahgunakan diberi `throttle:<n>,1,<name>` atau rate limiter bernama.
- Parameter dibatasi `->where()` / `whereNumber()` / `whereUuid()`.
- Web route merespons Inertia (`Inertia::render`) atau redirect; JSON hanya untuk endpoint XHR khusus (token game, lookup) dan API.

### 2.3 Audit & keamanan

- Setiap mutasi admin: `activity()->causedBy($request->user())->performedOn($model)->withProperties([...])->log('Created subject');` (teks log English, diterjemahkan di `id-admin.json`).
- Otorisasi: middleware (`EnsureAdmin`, `EnsureSuperadmin`, `EnsureTeacher`) dan/atau Policy. Superadmin bypass role/permission.
- Data pemain lain (profil, statistik) hanya field publik; jangan bocorkan email/tanggal lahir.
- Unggahan: validasi mime + ukuran, simpan di disk `public`, tolak SVG bila disajikan ke pengguna lain.

### 2.4 Shared props Inertia

Prop global ditambah di `app/Http/Middleware/HandleInertiaRequests.php` sebagai closure lazy (`'subjects' => fn (): array => …`) **dan** tipe di `resources/js/types/index.d.ts` (`SharedData`). Yang sudah ada dan wajib dipakai ulang: `auth`, `locale`, `gameMenu`, `gameSounds`, `subjects`, `flash`, `chatLive`, `ads`/`adGame` (route game).

## 3. Frontend umum

- React 19 + Inertia, TypeScript strict. Halaman di `resources/js/pages/**` (nama file kebab-case, default export komponen PascalCase).
- Props halaman diketik eksplisit (`interface Props`).
- Navigasi: `<Link>` / `router.visit`. Form: Inertia `<Form>` atau `useForm`; jangan `axios` untuk submit form Inertia. Fetch JSON ringan pakai helper `lib/http.ts`.
- Deferred props wajib skeleton animasi (`role="status"`).
- Polling: `useVisibleInterval` (berhenti saat tab tersembunyi), jangan `setInterval` mentah.
- `components/ui/*` (shadcn) **jangan diedit**; buat wrapper di `components/`.
- Komponen yang dipakai ≥ 2 halaman pindah ke `components/` (dengan PHPDoc/JSDoc singkat di atas fungsi).
- Penanda test: `data-testid="<area>-<element>"` pada kontrol utama.

## 4. i18n (wajib)

| Area | Mekanisme | File |
|---|---|---|
| Pemain, game, portal, guru | `const { t } = useTranslations(); t('section.key', { name })` | `resources/js/locales/{id,en}-player.json` |
| Auth | `t(...)` | `{id,en}-auth.json` |
| Admin | Tulis teks **English** di komponen: `tr('Subjects')`, `tr('{0} subjects', [n])`; terjemahan Indonesia di `id-admin.json` (kunci = teks English persis) | `id-admin.json` (+ `en-admin.json` bila perlu) |
| Pencarian fitur | entri `features.<key>` dengan `href`, `title`, `superadminOnly`, `teacherOnly` | `{id,en}-feature-search.json` |
| Backend / validasi / notifikasi | `__('file.key')` | `lang/{id,en}/*.php` |

Aturan:

- Kunci English camelCase, dikelompokkan per fitur (`wordRally.howTo.scenes.join.title`).
- Tambah kunci di id **dan** en dengan struktur identik. Saat menyisipkan ke JSON besar, gunakan skrip Python `json.load(..., object_pairs_hook=OrderedDict)` → sisipkan → `json.dump(ensure_ascii=False, indent=4)` agar diff kecil dan urutan terjaga.
- Bahasa Indonesia: kalimat sapaan ramah untuk anak/pelajar ("kamu"), singkat, tanpa jargon. English: setara, bukan terjemahan kata per kata.
- Angka & tanggal: `Intl.NumberFormat(locale === 'en' ? 'en-US' : 'id-ID')`, admin `adminLocale()`, tanggal `use-date-formatter`.
- `LocaleTest` memaksa setiap `tr('...')` di admin punya terjemahan Indonesia; `FeatureSearchCatalogTest` memaksa paritas pencarian fitur.

## 5. Registrasi menu (checklist per jenis)

### 5.1 Halaman pemain baru

1. Route di grup pemain + controller + test.
2. Bila masuk navigasi utama: tambahkan `NavItem` di `components/site-nav.tsx` (`PLAYER_ITEMS` atau item bersyarat seperti `CHAT_ITEM`, `TEACHER_ITEM`) dengan `labelKey: 'nav.<key>'`, ikon lucide, `testId: 'nav-<key>'`, `mobileHide` bila tidak muat di ponsel. Label di `nav.*` id+en.
3. Entri pencarian fitur di `{id,en}-feature-search.json` (`features.<key>`).
4. Bila tampil di dashboard pemain sebagai kartu: ikuti kartu `CARD = 'auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5'` di `pages/user/dashboard.tsx`.

### 5.2 Halaman admin baru

1. Route di `routes/admin.php` (+ `EnsureSuperadmin` bila hanya superadmin).
2. Halaman dibungkus `<AdminLayout>` + `<Head title={tr('…')} />`, struktur:
   ```tsx
   <div className="flex flex-col gap-6">
       <div className="flex flex-wrap items-end justify-between gap-4">
           <div>
               <h1 className="text-2xl font-bold text-foreground">{tr('Title')}</h1>
               <p className="max-w-2xl text-sm text-muted-foreground">{tr('One-line purpose.')}</p>
           </div>
           {/* aksi utama: inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 */}
       </div>
       <FlashMessages errors={errors} />
       <Panel title={tr('…')} description={tr('…')} icon={Icon}>…</Panel>
   </div>
   ```
3. Sidebar: tambahkan `NavItem` di `resources/js/lib/admin-navigation.ts` (`title` English, `href`, ikon lucide, `superadminOnly`), di grup yang tepat (`Analytics`, dll.). Sidebar dan pencarian fitur membaca file yang sama, jadi otomatis tersinkron.
4. Terjemahan `title` di `id-admin.json`.
5. Komponen admin yang dipakai ulang: `Panel`, `StatTile`, `EmptyState`, `BucketTable`, `fieldClass` (`components/admin/game-stats.tsx`); `FlashMessages`, `ConfirmDialog`, `SimplePagination`, `StatusPill`, `AiBadge` (`components/admin/admin-kit.tsx`); `KpiCard`, `Sparkline`, `ShareBars`, `Delta`, `SectionHeading`, `UserAvatar`, `GameDot`, `chartTooltipStyle`, `axisTick` (`components/admin/dashboard-kit.tsx`); `ResponsiveTable`; grafik `recharts`.
6. Halaman bank konten khusus game → tab di `GAME_TABS` (`components/admin/game-tabs.tsx`), bukan item sidebar baru.
7. Aksi destruktif → `ConfirmDialog tone="danger"`; tombol ikon `size-9 rounded-lg` dengan `aria-label` + `title`.
8. Mode gelap dicek (token, pasangan `dark:`).

### 5.3 Game baru

Lihat [`game-development.md`](game-development.md) §5 (katalog, ikon, warna/label admin, tab admin, landing, gateway, docs, changelog). Katalog otomatis mengisi: menu "Games" di header (`GameMenu`), `/gamelist`, portal, pencarian fitur (game + statistik admin), dropdown target iklan, statistik admin.

### 5.4 Pengumuman game yang akan datang

Tambahkan ke `UPCOMING` di `pages/games/index.tsx` (key, ikon, accent) + `gameList.upcoming.games.<key>.{title, inspiration, concept, gameplay, fun}` id+en + kunci di `GameMenuTest`.

## 6. Pola UI fitur yang sering dipakai

| Kebutuhan | Pakai |
|---|---|
| Tabel/daftar responsif | `ResponsiveTable` (`variant="admin"` / `"player"`) |
| Paginasi admin | `SimplePagination` + `Paginated<T>` |
| Tab tersegmentasi pemain | pola `SegmentedTabs` di `pages/leaderboard/index.tsx` (`role="tab"`, panah kiri/kanan) |
| Avatar pemain | `PlayerAvatar` (+ `OnlineDot`) |
| Pilih mapel / level / waktu jawab | `SubjectPicker`, `QuestionLevelPicker`, `AnswerTimePicker` |
| Pilih sekolah | `SchoolPicker` |
| Bagikan | `lib/share.ts`, `WhatsappShareButton` |
| Notifikasi singkat | `sonner` (`toast.success/error`), di admin `FlashMessages` via redirect flash |
| Konfirmasi | `ConfirmDialog` (admin) / `HostExitDialog`-style (game/portal) |
| Tooltip bantuan | `HelpTooltip` |
| Bahasa di dalam game | `GameLanguageToggle` |
| Jam header | `DigitalClock` (`edu-clock--game` di header game) |

## 7. Notifikasi, realtime, chat

- Notifikasi lonceng pemain: model notifikasi + `kind`; satu notifikasi per objek, perbarui `count` alih-alih spam (pola chat).
- Live event antar pemain: lewat Go chat service (`/internal/publish`), bukan Reverb baru. Presence pakai `OnlineDot` / `players[].user_id`.
- Polling cadangan 10 detik bila socket mati.

## 8. Data & privasi anak

- Minimalkan data pribadi; nickname ditampilkan, bukan nama lengkap, di tempat publik.
- Jangan tampilkan email, tanggal lahir, sekolah pemain lain di halaman publik kecuali sudah ada polanya.
- Iklan: patuhi `AdServer::showsAdsTo()` (saklar global + per user), label "Sponsor", klik lewat `/ads/click`.
