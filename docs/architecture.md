# EduFunHub — Architecture Notes

## Keputusan utama

**Status:** Accepted
**Tanggal:** 2026-09-26

### Portal dan administrasi

Laravel menjadi source of truth untuk seluruh area portal dan pengaturan admin:

- autentikasi dan akun pengguna;
- workspace, role, permission, dan konfigurasi;
- CMS, konten, SEO, pengumuman, billing, dan operasi admin;
- routing portal dan halaman non-game;
- integrasi Inertia React untuk UI portal.

### Game dan gameplay

Runtime game wajib menggunakan Golang (Go) dan berjalan dalam container Docker terpisah dari aplikasi Laravel. Pemisahan ini menjaga lifecycle, dependency, dan scaling game independen dari portal.

Go menjadi runtime utama untuk game dan gameplay:

- aturan permainan dan state machine;
- game loop, collision, movement, scoring, dan timer;
- sesi multiplayer dan sinkronisasi state;
- matchmaking, room, event gameplay, dan WebSocket;
- validasi aksi pemain agar hasil permainan tidak bergantung pada client.

Setiap fitur gameplay baru wajib menentukan package/service Go yang menangani aturan server-side. React hanya menangani rendering, input pemain, animasi presentasi, dan komunikasi dengan backend Go.

## Batas layanan

```text
Browser
  ├── Laravel / Inertia React
  │     └── portal, admin, auth, CMS, konfigurasi
  └── Go Game Service
        └── game state, gameplay rules, multiplayer, WebSocket

Laravel ↔ Go
  └── API/WebSocket terdokumentasi; kontrak payload wajib versioned bila breaking
```

Laravel boleh menerbitkan konfigurasi awal game atau entitlement pemain. Laravel tidak boleh menjadi tempat utama untuk menghitung state gameplay real-time.

## Aturan implementasi

1. Buat controller, request, policy, model, migration, dan halaman admin di Laravel.
2. Buat engine, room, tick loop, scoring, collision, dan sinkronisasi game di Go.
3. Jangan menaruh aturan kemenangan, validasi skor, atau hasil multiplayer hanya di React.
4. Gunakan API/WebSocket untuk komunikasi Laravel–Go; dokumentasikan kontrak request, response, event, dan error.
5. Jalankan game service Go dalam container Docker terpisah dari Laravel sejak awal; pisahkan lifecycle deployment dan observability keduanya.
6. Tambahkan test Laravel untuk portal/API contract dan test Go untuk aturan gameplay.

## Kondisi saat ini

Game demo yang sudah ada masih berupa frontend React/Inertia untuk prototyping visual dan interaksi lokal. Migrasi gameplay produksi ke Go dilakukan sebelum fitur multiplayer online, scoring persisten, matchmaking, atau state game authoritative dirilis.

## Game service: Flag Quest (`services/game`)

Service Go pertama berjalan di container `edufunhub-game` (`docker compose build game`).
Paket: `internal/world` (peta, collision), `internal/challenge` (mini game), `internal/questions`
(bank soal per jenjang), `internal/session` (state authoritative), `internal/server` (HTTP/WebSocket).

### Kontrak (protocol v1)

| Arah | Endpoint | Auth |
|---|---|---|
| Browser → Laravel | `POST /games/flag-quest/token` | sesi web + CSRF; butuh `player_profiles.grade` |
| Browser → Go | `GET /game-ws/ws?token=…&locale=id\|en` (WebSocket, via gateway) | token HMAC-SHA256 dari Laravel, TTL `GAME_SERVICE_TOKEN_TTL` |
| Go → Laravel | `POST /api/internal/game-results` (jaringan docker internal; diblokir 404 di gateway publik) | header `X-Game-Timestamp` + `X-Game-Signature = hex(HMAC(ts + "." + body))`, toleransi 300 dtk |

Token: `base64url(json{sub,name,grade,color,accessory,game,exp,nonce}) "." base64url(HMAC)`.
Nama karakter = `nickname` dashboard, fallback `users.name`. Kelas 1–12 diatur di dashboard.

Pesan client → Go: `move{x,y}`, `interact`, `raise`, `answer{value}`, `roll`, `leave`, `mission{mission}`, `locale{locale}`, `ping`.

Ular Tangga Flag Quest (`snakes_ladders`): papan 5×5 (25 kotak, boustrophedon), alur mengikuti `/games/snakes-and-ladders`. Urutannya `roll`, lalu Go menyimpan `pending_roll` dan mengirim soal. Jawaban benar menjalankan langkah; jawaban salah atau waktu habis menghabiskan giliran tanpa bergerak. Dadu 6 memberi giliran bonus, dan mencapai atau melewati kotak 25 berarti menang. Payload `board` berisi `size, cols, jumps, position, turns, max_turns, last_roll, last_jump, pending_roll, move_from, move_landing`. Client hanya menganimasikan `move_from → move_landing` per langkah, lalu tangga/ular ke `position`.

Sukhoi Sky Quiz (`sky-quiz`): jalur WebSocket `/game-ws/sky` ke `GET /ws/sky` di Go (paket `internal/sky`). Token dari `POST /games/sky-quiz/token` memakai `game=sky-quiz` dan kelas dari profil pemain. Client hanya merender dan mengirim kejadian (`start`, `touch{option}`, `shoot{option}`, `miss`, `crash`, `drone`, `pause`, `resume`). Go menentukan:
- soal sesuai kelas, berupa 10 ronde dengan 3 opsi;
- benar/salah, perisai (5), dan skor;
- batas waktu minimum tiap aksi untuk menolak laporan instan;
- poin akhir (10 per jawaban benar, +20 selesai, +20 sempurna, maksimal 150).

State `sky_state` juga memuat `history` (benar/salah per soal, untuk progress bar). Ketika selesai, `result` memuat `percent`, `passed` (benar > 70% dari total soal), dan `reason` (`finished` atau `shields`). Hasil dikirim ke `POST /api/internal/game-results` dengan `event_id` `sq-{user}-sky-{nanos}` dan `mission=sky`. Setelah selesai, client melakukan partial reload `points` sampai total akun sudah memuat award. Tamu memainkan mode demo lokal (kelas 1–4) tanpa poin.
Pilah Port & Protokol / Port Sorter (`port-sorter`, Edisi TKJ): jalur WebSocket `/game-ws/port-sorter` ke `GET /ws/port-sorter` di Go (paket `internal/portsorter`). Token dari `POST /games/port-sorter/token` (`game=port-sorter`; pemain tanpa kelas tetap dapat token, kelas diisi `MIN_GRADE`).

Keranjang dinamis: topik, keranjang, dan item dikelola super admin di `/admin/sorter-sets` (tabel `sorter_sets`, model `SorterSet`, kolom JSON `bins` dan `items`). Satu set punya 2–6 keranjang (nama ID/EN + warna hex, urutan = kolom kiri ke kanan) dan item jatuh (label maks. 12 karakter, petunjuk ID/EN, keranjang, level muncul 1–6). Level 1 wajib berisi item dari minimal 2 keranjang. Minimal satu set harus aktif. Go menarik `GET /api/internal/sorter-bank` (signed, `GAME_SORTER_BANK_URL`) tiap menit; set bawaan `ports-basic` (4 keranjang: HTTP/WEB, DNS, SSH/REMOTE, MAIL) dan `ports-services` (6 keranjang) dipakai sampai sinkron pertama dan di-seed dari `database/data/sorter_sets.php`. Permainan yang sedang berjalan memakai set saat mulai.

Client menganimasikan jatuhnya paket, menggambar kolom sebanyak keranjang set, menggeser kolom (swipe/ketuk/panah/angka 1–9), dan melapor `land{packet,option}` saat paket menyentuh tanah. Pesan lain: `choose{value}` (pilih set, hanya di luar permainan), `start{value}`, `pause`, `resume`, `locale`. Go menentukan:
- kunci jawaban item → keranjang dari set aktif, item terbuka bertahap per level;
- 30 paket, 3 nyawa, level kecepatan naik tiap 5 paket (jatuh 6,5 dtk → 3 dtk), paket biasanya muncul di atas keranjang yang salah;
- menolak pendaratan lebih cepat dari waktu jatuh (toleransi 400 ms), paket basi/ganda, dan indeks keranjang di luar set; paket tanpa laporan dianggap hilang setelah 6 dtk;
- poin akhir (`points.Question` per paket benar, +20 selesai, +20 sempurna; batas `Cap(30)+40` = 3190).

State `port_state` memuat `set{key,title,description}`, `bins[{key,name,color}]`, `packet{id,label,column,delay,fall_ms,elapsed_ms}` (tanpa jawaban), `history`, `level`; di luar permainan juga `sets` (pemilih topik) dan `legend` (contekan). `result` memuat `missed` (item yang salah). Hasil dikirim dengan `event_id` `ps-{user}-sort-{nanos}` dan `mission=sort`.

Pesan Go → client: `welcome`, `correct{x,y}`, `challenge`, `gates`, `raise`, `complete`, `error{code}`, `pong`.

Aturan server-side: kecepatan gerak dibatasi, collision air/gerbang/props, jawaban tidak pernah dikirim ke client
sebelum dijawab, poin dihitung di Go (maks 250), hasil idempotent via `event_id` unik.

### Mata pelajaran (subjects)

Daftar mata pelajaran ada di tabel `subjects` (model `App\Models\Subject`), bukan di kode. Super admin
mengelolanya di `/admin/subjects`: tambah, ubah nama/ikon/warna, sembunyikan, urutkan, dan hapus
(hanya mapel buatan admin yang belum punya soal). Enam mapel bawaan (`math`, `science`, `language`,
`social`, `english`, `civics`) berstatus `is_system`, jadi tidak bisa dihapus, hanya disembunyikan.

- Kunci (`key`) dibuat dari nama, pola `^[a-z][a-z0-9-]{1,29}$`, tidak bisa diubah setelah dibuat, dan
  `mix`/`all` dicadangkan. Soal menyimpan kunci ini di `questions.subject`.
- Validasi soal (admin, guru, impor CSV, generator AI) memakai `Subject::activeKeys()`. Soal lama dengan
  mapel yang disembunyikan tetap bisa disimpan tanpa mengganti mapelnya.
- Mapel aktif dibagikan ke semua halaman lewat shared prop `subjects` (`{key, name{id,en}, icon, color}`).
  `SubjectPicker` dan label soal di game membacanya (`resources/js/lib/subjects.tsx`), jadi mapel baru
  langsung muncul di semua game. Admin memakai `subjectLabels` untuk label mapel yang disembunyikan juga.
- `GET /api/internal/question-bank` mengirim `subjects` (kunci aktif) dan ikut menghitung `version`. Go
  (`questions.UseSubjects`) mengganti daftar mapel yang bisa dipilih saat sinkron (paling lambat 1 menit).
  Mapel tanpa soal untuk kelas pemain otomatis memakai campuran dan menampilkan catatan fallback.
- Kolom `ai_hint` dipakai sebagai deskripsi mapel untuk generator soal AI.

## Chat service (`services/chat`)

Chat antar pemain berjalan di container Go terpisah, `edufunhub-chat` (`docker compose build chat`, port internal 8091). Laravel tetap pemilik data: keanggotaan, penyimpanan pesan, notifikasi lonceng. Go hanya mengantar event secara live. Go tidak menyimpan riwayat, dan klien melakukan resync dari Laravel setiap kali tersambung ulang.

| Arah | Endpoint | Auth |
|---|---|---|
| Browser → Laravel | `GET /chat`, `/chat/inbox`, `/chat/conversations/{id}`, `POST …/messages`, `/chat/direct`, `/chat/groups`, `PATCH /chat/groups/{id}`, `POST …/leave`, `…/read` | sesi web + CSRF; bukan anggota → 404 |
| Browser → Laravel | `POST /chat/token` | sesi web; token `base64url(json{sub,aud:"chat",exp,nonce}) "." base64url(HMAC)` |
| Browser → Go | `GET /chat-ws/ws?token=…` (WebSocket via gateway) | token di atas; `aud` wajib `chat` sehingga token game tidak bisa dipakai |
| Laravel → Go | `POST http://edufunhub-chat:8091/internal/publish` `{users:[ids], event:{…}}` (jaringan docker saja, tidak diekspos gateway) | `X-Chat-Timestamp` + `X-Chat-Signature = hex(HMAC(ts + "." + body))`, toleransi 300 dtk |

- Secret: `CHAT_SERVICE_SECRET`. Jika kosong, fallback ke `GAME_SERVICE_SECRET`.
- Pesan baru: Laravel menyimpan pesan, lalu publish `{t:"message", message}` ke semua anggota.
- Notifikasi: penerima mendapat satu notifikasi lonceng `kind=chat` per percakapan. Notifikasi ini diperbarui (`count`) selama belum dibaca, dan hilang saat percakapan dibuka.
- Jika Go mati, pesan tetap tersimpan dan notifikasi tetap masuk. Halaman chat beralih ke polling setiap 10 detik.
- Batas: pesan maksimal 1000 karakter; 30 pesan/menit dan 3 pesan/detik per pengguna. Grup maksimal 30 anggota. Hanya pembuat grup yang bisa mengganti nama grup; kepemilikan pindah otomatis bila pembuat keluar.
- Go membatasi 8 socket per pengguna. Klien yang lambat (buffer 64 event) diputus.

## Open questions

- Lokasi service Go: repository/package terpisah atau monorepo `services/game`.
- Pilihan storage state room: in-memory, Redis, atau kombinasi.
- Kontrak autentikasi antara Laravel dan Go.
- Strategi deployment dan autoscaling game service.
