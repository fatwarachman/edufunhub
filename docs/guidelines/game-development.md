# EduFunHub — Panduan Pembuatan Game

> Bagian dari [`README.md`](README.md). Gaya visual: [`design-system.md`](design-system.md). Kontrak per game yang sudah ada: [`../architecture.md`](../architecture.md), [`../multiplayer.md`](../multiplayer.md).
> Referensi kode terbaik: **Ping Pong** (room 1–2 pemain, `lobby.Hub`) dan **Monster Café** (host/proyektor + HP, goroutine per ruang). Saat ragu, buka file padanannya dan tiru strukturnya.

## 0. Sebelum menulis kode

1. Tentukan **game key** (kebab-case, unik, ≤ 30 karakter): mis. `word-rally`. Turunannya:

   | Turunan | Pola | Contoh |
   |---|---|---|
   | Paket Go | `services/game/internal/<nospace>` | `internal/wordrally` |
   | Controller | `<Studly>Controller` | `WordRallyController` |
   | Route name | `games.<key>` | `games.word-rally` |
   | Halaman Inertia | `resources/js/pages/games/<key>.tsx` (atau folder `<key>/index.tsx` bila banyak layar) | `games/word-rally` |
   | Hook socket | `resources/js/hooks/use-<key>.ts` | `use-word-rally.ts` |
   | Logika murni klien | `resources/js/lib/<key>.ts` + `<key>.test.mjs` | |
   | Komponen | `resources/js/components/<key>/` (`shared.tsx`, `how-to-play.tsx`, `art.tsx`, `host-screen.tsx`, `player-screen.tsx`) | |
   | CSS | `resources/css/<key>.css`, prefix kelas 2–3 huruf | `.wr-` |
   | Locale pemain | kunci camelCase di `{id,en}-player.json` | `wordRally` |
   | Locale backend | `lang/{id,en}/<snake>.php` | `word_rally.php` |
   | Event ID hasil | `<2 huruf>-{user}-<mission>-{nanos}` | `wr-12-room-1790…` |
   | Gateway WS | `/game-ws/<key>` → `http://edufunhub-game:8090/ws/<key>` | |
   | Tutorial | `public/tutorials/cara-bermain-<key>.{mp4,pdf}` | |

2. Pilih **arketipe**:

   | Arketipe | Kapan | Pola Go | Contoh |
   |---|---|---|---|
   | A. Room kecil | 1–4 pemain, giliran/soal sama, boleh bot/kursi lokal | `lobby.Hub[GameState, SeatData]` + ticker `Run<Game>` | Ping Pong, Ular Tangga, Duel, mini-games |
   | B. Kelas besar mandiri | 2–100 pemain, tiap pemain alur sendiri, host di proyektor | Goroutine per ruang, intent via channel, token host terpisah `<key>-host` | Monster Café, Peti Emas, Order Rush, Lantai Runtuh |
   | C. Dua layar realtime | Arena proyektor + kontroler HP, tick 20 Hz | Seperti B + tick 50 ms + `/arena/<key>/{pin?}` & `/play/<key>/{pin?}` + QR | Turbo Trivia, Block Battle |

3. Tulis **kontrak WebSocket** (tabel pesan klien→server dan server→klien) di `docs/multiplayer.md` (bagian game baru) **sebelum** implementasi. Perubahan arsitektur Laravel ↔ Go butuh persetujuan pemilik.

## 1. Go referee (`services/game`)

### 1.1 Prinsip authoritative

- Semua aturan, skor, timer, deadline, validasi, peringkat di Go. Waktu = **jam server** saat pesan diterima; timestamp klien diabaikan.
- Soal dikirim **tanpa** kunci jawaban. Klien mengirim **indeks opsi yang ditampilkan**. Kunci baru keluar di `feedback`/`answer_result` setelah dijawab.
- Tolak input tak valid dengan error code (string snake_case), jangan panic: `invalid_option`, `stale_question`, `not_your_turn`, `too_early` (jawaban < 300 ms), `wrong_phase`, `not_host`, dst. Kode baru → tambahkan ke `room.errors.*` di kedua locale.
- Batasi laju input (mis. 30 input/detik, `conn.SetReadLimit(1024)`), tolak pesan basi/ganda.
- State/snapshot yang dikirim ke klien adalah **salinan** (tidak berbagi slice/map dengan state hidup).

### 1.2 Soal

```go
gen := questions.NewFor(GameKey, grade, seed).For(r.Subject, r.Humans()...).AtLevel(level)
q := gen.Present(gen.Choice(), Options) // Options = 4
```

- **Selalu** `gen.Present(...)`, jangan `questions.Trim` langsung: `Present` mengacak ulang posisi jawaban bila soal muncul ulang. Jangan rusak `Question.Order` (statistik per opsi admin).
- Kelas soal = **kelas terendah** di meja; level = level terendah. Mapel dari host via `SetSubject` (`questions.NormSubject`, `mix` = semua). Mapel tanpa soal untuk kelas itu → `subject_fallback: true` + `SubjectFallbackNote` di UI.
- Daftarkan key game di `both` (`internal/questions/bank.go`) dan `Question::GAMES` + `CHOICE_ONLY_GAMES` (`app/Models/Question.php`). Bila bank awal perlu diisi, buat migration distribusi (contoh `2026_10_29_090001_distribute_trivia_questions_to_ping_pong.php`).

### 1.3 Poin & hasil

```go
var MaxPoints = points.Cap(N)                       // N = jumlah jawaban yang dibayar
award := points.Finished(achieved, MaxPoints)       // selesai normal / host stop
award := points.Abandoned(achieved, answered, MaxPoints) // keluar di tengah
achieved += points.Worth(q.Points, level)           // per jawaban benar
achieved = points.Outcome(achieved, won, draw)      // bonus menang/seri
```

- Pemain login **selalu** dapat poin saat selesai. Kursi lokal, bot, dan tamu tidak.
- `Result` (lihat `pingpong.Result`): `event_id`, `user_id`, `game_key`, `mission`, `grade`, `points`, `correct`, `wrong`, `duration_seconds`, `completed_at`, `answers` (`[]questions.Answer`), `match` (`*record.Match`, berisi semua kursi, peringkat, skor). Hasil idempotent lewat `event_id` unik.
- Kirim lewat `s.report(res)` (HMAC `X-Game-Signature`, retry 3×) dari `TakeResults()`.
- Tambah cap ke `internal/points/caps_test.go` **dan** `StoreGameResultRequest::GAMES` — nilainya harus identik.

### 1.4 Registrasi di server

| File | Tambahan |
|---|---|
| `internal/server/server.go` | field hub + subs, inisialisasi di `New`, `mux.HandleFunc("GET /ws/<key>", s.serve<Game>)`, `Prune` di loop prune |
| `internal/server/<key>.go` | `serve<Game>` (verifikasi token `auth.Verify(token, secret, GameKey, now)`, `websocket.Accept` dengan `AllowedOrigins`, read loop `switch in.T`), `Run<Game>` ticker, `push<Game>`, `report<Game>` |
| `cmd/game/main.go` | `go srv.Run<Game>(ctx, 250*time.Millisecond)` (arketipe A) / `time.Second` (B) |
| `internal/server/pin.go` | `RoomPhase(pin)` agar `/join/{pin}` menemukan ruang |
| `internal/server/presence.go` | `Presence(uid)` untuk "Lanjutkan permainan" |
| `internal/server/stats.go` | `Usage{Game, Connections, Sessions}` untuk Server Monitor |

### 1.5 Pesan standar

Klien → Go (arketipe A): `create`, `join{pin}`, `leave`, `start`, `stop`, `subject{subject}`, `answer_time{seconds}`, `answer{round, option}`, `sync`, `locale{locale}`, `ping`. Arketipe B/C memakai bentuk `create_room`, `join_room{room_code}`, `start_game`, `end_game`, `configure{…}`, `set_subject`, `submit_answer{question_id, answer_index}`, `leave_room`, `sync`, `locale`, `ping` — **ikuti bentuk arketipe yang dipilih, jangan campur**.

Go → klien: satu pesan state (`<key>_state` / `state_sync`) berisi payload ruang standar (`pin, seq, phase, host, you, players[], min_players, max_players, answer_seconds, answer_times, subject`), plus `error{code}`, `pong`, `left{points}`, `podium_result` (B/C).

### 1.6 Test Go (wajib)

Minimal: alur ruang (buat, gabung, mulai), payload lobi tanpa soal, soal tanpa kunci, validasi opsi/basi/giliran/timeout, benar vs salah, poin + cap, keluar di tengah tetap dibayar, host stop/hand-over/prune, ringkasan `Match`, snapshot terpisah (`-race` untuk arketipe B/C). Contoh: `internal/pingpong/pingpong_test.go`, `internal/server/pingpong_test.go`.

## 2. Laravel

### 2.1 Controller (tiru `PingPongController`)

```php
class WordRallyController extends Controller
{
    public const GAME_KEY = 'word-rally';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $pin = $request->query('pin');

        return Inertia::render('games/word-rally', [
            'player' => $this->player($request),
            'pin' => is_string($pin) && preg_match('/^[0-9]{6}$/', $pin) ? $pin : null,
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_word_rally_ws_url'),
        ]);
    }

    public function token(Request $request): JsonResponse { /* issueToken(user, GAME_KEY, player) */ }
}
```

- `player()` mengembalikan `id, name (nickname ?: name), grade, color, accessory, character (PlayerProfile::look())`.
- Game yang butuh kelas: token mengembalikan 422 bila `grade` kosong (status socket `grade_required`). Yang tidak butuh: isi `PlayerProfile::MIN_GRADE`.
- Arketipe B: terima `?role=host|player|solo`, token host `self::HOST_GAME = '<key>-host'`.

### 2.2 Route (`routes/web.php`, dalam grup auth game)

```php
Route::get('/games/word-rally', [WordRallyController::class, 'show'])
    ->middleware(RecordGameAccess::class.':word-rally')->name('games.word-rally');
Route::post('/games/word-rally/token', [WordRallyController::class, 'token'])
    ->middleware('throttle:30,1,games.word-rally.token')->name('games.word-rally.token');
```

`RecordGameAccess` wajib di **setiap** route halaman game (iklan + statistik akses). Undangan `/games/{game}/join/{pin}` sudah generik (`GameInviteController`) selama katalog `multiplayer => true`.

### 2.3 Konfigurasi & registrasi backend

| File | Tambahan |
|---|---|
| `config/game-service.php` | `'public_word_rally_ws_url' => env('GAME_SERVICE_PUBLIC_WORD_RALLY_WS_URL', '/game-ws/word-rally')` |
| `config/game-catalog.php` | entri game di kategori yang tepat (lihat §2.4) |
| `app/Http/Requests/StoreGameResultRequest.php` | `GAMES['word-rally'] => ['event_id' => '/^wr-[0-9]+-room-[0-9]+$/', 'missions' => ['room'], 'max_points' => …, 'max_players' => …, 'max_level' => 3]` |
| `app/Http/Controllers/Api/GameResultController.php` | `historyName()` → `__('word_rally.history_name', [], $locale)` |
| `lang/{id,en}/word_rally.php` | `'history_name' => '…'` |
| `app/Models/Question.php` | `GAMES`, `CHOICE_ONLY_GAMES` |
| `app/Services/ActiveGames.php` | `resumeUrl()` bila URL lanjutkan bukan `route($game['route'], ['pin'])` (arketipe B/C) |
| `dashboard-gateway.dev.conf` + `deploy/nginx/gateway.prod.conf` | `location = /game-ws/word-rally { … Upgrade … proxy_read_timeout 120s; }` (salin blok ping-pong) |

### 2.4 Entri katalog

```php
[
    'key' => 'word-rally',
    'titleKey' => 'player.wordRally',
    'descriptionKey' => 'portal.games.wordRally',
    'route' => 'games.word-rally',
    'icon' => 'swords',          // key di GAME_ICONS (resources/js/lib/games.ts)
    'accent' => '#7c3aed',       // sama dengan GAME_COLORS admin
    'min_grade' => 1,
    'max_grade' => 12,
    'min_players' => 1,          // mengikuti batas Go
    'max_players' => 2,
    'awards_points' => true,     // hanya bila hasil diverifikasi Go
    'requires_grade' => false,
    'guest_playable' => false,   // selalu false
    'multiplayer' => true,       // standar PIN + link
    'released_at' => 'YYYY-MM-DD', // muncul di "Game terbaru" 3 hari
],
```

## 3. Frontend game

### 3.1 Kerangka halaman (wajib, urutan tetap)

```tsx
<div className="xx-page min-h-dvh text-[#1f2a44]" style={{ background: BG }} data-testid="word-rally" data-phase={state?.phase}>
    <Head title={`${title} — EduFunHub`} />
    <header className="sticky top-0 z-30 border-b-4 border-[#1f2a44]" style={{ background: BG }}>
        <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
            <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <BackButton href={backHref} label={t('nav.backToPortal')} iconOnly />
                <BrandLink variant="mark" />
                <span className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid" style={{ background: ACCENT }}>
                    <GameIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col">
                    <h1 className="truncate font-display text-lg font-black sm:text-2xl">{title}</h1>
                    <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">{t('wordRally.subtitle')}</span>
                </div>
                <DigitalClock className="edu-clock--game" />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {/* mute: edu-nav-btn edu-nav-btn--icon, aria-pressed */}
                <SiteNav compact />
            </div>
        </div>
    </header>
    <main className="mx-auto flex flex-col gap-4 px-3 py-5 sm:px-6 lg:px-8">
        <GameAdStrip />
        {/* !serviceReady → notice; !state → RoomEntry; lobby → RoomLobby; playing/done → arena */}
        {!playing && <HowToPlay />}
        <GameFinale game="word-rally" done={done} matchKey={…} standings={…} won={won} points={…} onPlayAgain={isHost ? playAgain : undefined} />
    </main>
</div>
```

- `backHref = useGameBackHref()` (portal bila login).
- Status layanan mati: notice `role="status"` dengan teks locale `<game>.unavailable`.

### 3.2 State & socket

- Hook `use-<key>.ts` membungkus `useGameSocket<State>(wsUrl, '/games/<key>/token', '<key>_state', locale, { onState, onError, onMessage })`. Hook **hanya mengirim intent**; tidak menghitung skor/benar.
- Tipe state memperluas `RoomPayload<Seat>` dari `components/multiplayer/room.tsx`.
- Logika murni klien (boleh/tidak kirim jawaban, validasi indeks, kunci pending) di `lib/<key>.ts`, dites dengan `node --test resources/js/lib/<key>.test.mjs`.
- Gabung via PIN dari URL: `useRoomPin(status === 'online', state?.pin, pin, join)`.
- Locale berubah → hook mengirim `locale` (sudah ditangani `useGameSocket`).

### 3.3 Komponen wajib per fase

| Fase | Komponen |
|---|---|
| Belum ada ruang | `RoomEntry` (intro dengan nama pemain, aturan singkat sebagai children) |
| Lobi | `RoomLobby` dengan `settings`: `SubjectPicker` (+ `isGameSubject`, `MIX_SUBJECT`), `AnswerTimePicker` bila soal berwaktu, `QuestionLevelPicker` bila ada level, disabled bila bukan host / offline |
| Bermain | Arena game + `RoomError` + `ConnectionBadge` + timer `role="status"` + `RoomLeaveControl` (host: keluar sendiri atau hentikan untuk semua) + `SubjectFallbackNote` |
| Selesai | Panel hasil (judul menang/kalah/seri/dihentikan, poin) + tombol main lagi (host) / `room.waitingHost` + `<AdSlot placement="arena.result" />` |
| Selalu | `<GameFinale>` (confetti + modal peringkat), `useAdMoments(phase, { muted, won })` |

Feedback jawaban: tampilkan benar/salah dengan ikon **dan** teks, jawaban benar, dan `hint` dari Go.

### 3.4 Tutorial "Cara bermain"

- `components/<key>/how-to-play.tsx`: karusel 5–6 adegan (`SCENES` konstanta, `SCENE_MS` 6000–6500), adegan memakai komponen arena asli (bukan screenshot), autoplay mati bila reduced motion, kontrol prev/next/dots (`aria-current="step"`), panah kiri/kanan, caption `aria-live`.
- Teks adegan di `<game>.howTo.scenes.<scene>.{title,body}` (id + en).
- Tautan unduh `TUTORIAL_BASE = '/tutorials/cara-bermain-<key>'` → `.mp4` dan `.pdf` (Bahasa Indonesia), dibuat dari adegan tutorial yang sama (rekam/render lalu encode dengan ffmpeg). Contoh hasil: `public/tutorials/cara-bermain-ping-pong.{mp4,pdf}`.

### 3.5 Iklan sponsor (fondasi wajib)

`RecordGameAccess` di route, `<GameAdStrip />` sebagai anak pertama `<main>`, `<AdSlot placement="arena.result" />` di panel hasil, slot lain bila ada ruang (`arena.sidebar`, `arena.loading`, `arena.board`), `useAdMoments`. Tambahkan key game ke daftar di `tests/Feature/AdsTest.php`.

### 3.6 Layar host/arena (arketipe B/C)

- Teks besar untuk proyektor (PIN `text-5xl`), QR join (`GET /games/<key>/qr/{pin}`, SVG `bacon-qr-code`), daftar pemain dengan `PlayerAvatar`, feed aksi, leaderboard (maks 4 update/detik).
- HP pemain: kontrol besar ≥ 56 px di area jempol, tanpa scroll saat bermain, layar terkunci tidak memutus (watchdog `useGameSocket`).

## 4. Locale (id + en)

Wajib di kedua `{id,en}-player.json`:

- `player.<camel>` (judul katalog), `portal.games.<camel>` (deskripsi katalog).
- Objek `<camel>`: `title, eyebrow, subtitle, unavailable, intro, rules, soloHint, back, mute, unmute, yourTurn, waitTurn, seconds, won, finished, draw, stopped, points, playAgain, answer, hint, …` + `howTo.{title, step, previous, next, pause, replay, video, pdf, scenes.*}`.
- Error baru di `room.errors.*`.
- Admin: label game di `GAME_LABELS` (`components/admin/game-stats.tsx`, English) + terjemahan di `id-admin.json` bila dipakai lewat `tr()`.
- Gunakan interpolasi `{{name}}` (i18next), plural `{{count}}`. Daftar = array JSON dibaca `t(key, { returnObjects: true })` + guard `Array.isArray`.

## 5. Registrasi di seluruh aplikasi (sering terlewat)

| Tempat | File |
|---|---|
| Katalog game (portal, /gamelist, menu header, admin) | `config/game-catalog.php` |
| Ikon katalog | `GAME_ICONS` di `resources/js/lib/games.ts` (bila ikon baru) |
| Warna & label admin | `GAME_COLORS` (`components/admin/dashboard-kit.tsx`), `GAME_LABELS` (`components/admin/game-stats.tsx`) |
| Tab admin per game (bank konten khusus) | `GAME_TABS` di `components/admin/game-tabs.tsx` + route di `routes/admin.php` |
| Landing statis | `public/new-landing/index.html` (menu dropdown + mobile, `data-plays`, `data-game-players`) dan `games.html` |
| Gateway dev & prod | `dashboard-gateway.dev.conf`, `deploy/nginx/gateway.prod.conf` |
| Dokumentasi kontrak | `docs/architecture.md` (ringkas) + `docs/multiplayer.md` (tabel pesan, poin) |
| Changelog | `database/data/changelog.php` (fitur baru = MINOR) |

## 6. Test Laravel (wajib, tiru `tests/Feature/PingPongTest.php`)

- Halaman, undangan, token butuh login (`assertRedirect('/login')`, `assertUnauthorized()`).
- Render Inertia: komponen, `player.id`, `pin`, `wsUrl`, `serviceReady`, prop `ads`, akses tercatat (`GameAccess`).
- Token: claim game benar, kelas default, 503 bila secret kosong.
- Hasil `/api/internal/game-results` bertanda tangan: tercatat di `game_histories`, `point_ledgers`, `game_matches`; cap poin & pola `event_id` ditolak bila salah; idempotent.
- Perbarui dataset test bersama: `MultiplayerStandardTest`, `GameMenuTest` (indeks katalog + landing), `GamePlayerCountTest`, `AdsTest`, `GameAvatarTest`, `Admin/GameAdminTest`, `GameListLatestTest` bila relevan.

## 7. Definisi selesai (game)

- [ ] Go: paket + test (`go vet`, `go test ./...`, `gofmt -l` bersih), registrasi server/pin/presence/stats/main.
- [ ] Laravel: controller, route + `RecordGameAccess`, katalog, config WS, `StoreGameResultRequest`, history name, Question games, gateway dev+prod, test Pest hijau.
- [ ] Frontend: kerangka header/main standar, `RoomEntry`/`RoomLobby`/`GameFinale`/iklan, tutorial + unduhan, mute, i18n id+en, `data-testid`, a11y, reduced motion, responsif 320–1280 tanpa overflow.
- [ ] Admin: warna, label, (tab bank konten bila ada).
- [ ] Landing + docs kontrak + changelog MINOR.
- [ ] Tidak rebuild/deploy container tanpa diminta pemilik.
