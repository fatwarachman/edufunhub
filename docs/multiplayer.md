# Standar game multiplayer dan poin

**Status:** Accepted (2026-10-04)
Berlaku untuk semua game baru. Game lama yang sudah memakai standar ini: Ular Tangga, Duel Kuis Kelas, Teka-Teki Silang, Pasar Matematika, Taman Angka & Huruf, Jelajah Indonesia, Lab Mini, Lantai Runtuh, Peti Emas Misteri, Order Rush TKJ, Turbo Trivia.

## 1. Undangan (PIN + link)

Setiap game multiplayer memakai alur yang sama:

1. Host menekan **Buat ruang**. Go membuat **PIN 6 digit** unik.
2. Host membagikan PIN atau link `https://<host>/games/{game}/join/{pin}` (Salin PIN, Salin link, atau share bawaan HP).
3. Teman memasukkan PIN, atau membuka link. Tamu diminta login dulu, lalu kembali ke ruang.
4. Hanya **host** yang bisa mengubah pengaturan (misalnya level) dan menekan **Mulai**. Kalau host keluar, peran host pindah ke pemain berikutnya. Kalau host **terputus** lebih dari `lobby.HostGrace` (10 detik), permainan tetap berjalan dan peran host pindah ke pemain yang masih terhubung (`Hub.HandOver`). Kursi lokal tetap milik perangkat yang menambahkannya (`Seat.Owner`).
5. Ruang dengan satu kursi = main sendiri. Game boleh mengizinkan **pemain di satu perangkat** (kursi lokal milik host).

### Komponen yang wajib dipakai

| Lapisan | Pakai | Lokasi |
|---|---|---|
| Go | `lobby.Hub[GameState, SeatData]` (PIN, kursi, host, presence, kursi lokal, prune, `RoomPayload`) | `services/game/internal/lobby` |
| Go | aturan poin `points.Finished` / `points.Abandoned` | `services/game/internal/points` |
| Laravel | link undangan generik `GameInviteController` (`games.join`) | `app/Http/Controllers/GameInviteController.php` |
| Laravel | `'multiplayer' => true` di katalog | `config/game-catalog.php` |
| React | `RoomEntry`, `RoomLobby`, `useRoomPin`, `ConnectionBadge`, `RoomError` | `resources/js/components/multiplayer/room.tsx` |
| Locale | teks ruang `room.*` (id dan en) | `resources/js/locales/{id,en}-player.json` |

### Kontrak WebSocket ruang

Client → Go: `create`, `join{pin}`, `leave`, `start`, `add_local{name}`, `remove_local{seat}`, `locale{locale}`, `ping`, ditambah aksi khusus game.

State Go → client memuat payload ruang standar:

```json
{ "pin": "482913", "seq": 7, "phase": "lobby|playing|done", "host": 0, "you": 1,
  "players": [{ "seat": 0, "name": "Rani", "grade": 4, "online": true, "left": false,
                "local": false, "controlled": false }],
  "min_players": 1, "max_players": 4, "local_seats": true }
```

`controlled` berarti pemain ini boleh bertindak untuk kursi tersebut: kursinya sendiri, atau kursi lokal saat dia host.

Kode error ruang: `room_not_found`, `room_full`, `room_started`, `not_host`, `not_enough_players`, `wrong_phase`, `not_in_room`, `local_limit`, `not_local`.

### Riwayat pertandingan (match history)

Setiap hasil game ruang/duel membawa ringkasan `match` yang sama untuk semua pemain (`internal/record`): `key`, `mode` (`solo`/`room`/`random`/`bot`), `pin`, `level`, `grade` soal, waktu mulai/selesai, dan semua kursi (akun, nama, kelas, lokal/bot, keluar, peringkat, skor, benar/salah). Laravel menyimpannya ke `game_matches` + `game_match_players` (upsert berdasarkan `match_key`) sehingga admin bisa melihat siapa pernah bermain dengan siapa, level berapa, dan perkembangan per bulan (`/admin/matches`, detail user).

### Checklist game multiplayer baru

- [ ] Paket Go memakai `lobby.Hub`, `points` dan `record` (hasil membawa `Match`). Ada test untuk alur ruang, keluar ruang, poin, dan ringkasan match.
- [ ] Endpoint `GET /ws/{game}`, gateway dev/prod `location = /game-ws/{game}`.
- [ ] Controller game menerima `?pin=` (6 digit) dan meneruskannya sebagai prop `pin`.
- [ ] Katalog: `multiplayer`, `awards_points` → `true`.
- [ ] `StoreGameResultRequest::GAMES`: pola `event_id`, misi, `max_points`.
- [ ] Halaman memakai `RoomEntry` / `RoomLobby` / `useRoomPin`.
- [ ] Karakter pemain = avatar portal. Controller mengirim `player.character` (`PlayerProfile::look()`) dan token membawa claim `character`. Go meneruskannya sebagai `players[].character` (maks 2 KB, opaque). Render pakai `PlayerAvatar`; kursi tanpa akun (perangkat sama, robot) memakai look bawaan per kursi.

## 2. Poin: setiap permainan menambah poin

- Pemain login **selalu** dapat poin setiap kali permainan selesai: `points.Participation` (5) ditambah poin pencapaian game (jawaban benar, menang, bonus).
- Keluar sebelum selesai tetap dibayar **pencapaian** (jawaban benar). `Participation` hanya ditambahkan bila sudah menjawab minimal `points.MinAnswersForAbandon` (3) soal, supaya buat-ruang/keluar tidak bisa di-farm.
- Portal menampilkan **Lanjutkan permainan** dari `GET /internal/presence?user=ID` (HMAC sama dengan `/internal/stats`): semua ruang/match yang masih berjalan untuk akun itu, jadi browser yang tertutup tidak sengaja bisa kembali ke ruang.
- Poin dihitung dan dikirim oleh Go (hasil bertanda tangan HMAC), lalu Laravel mencatatnya di `game_histories` dan `point_ledgers`. Total poin akun adalah jumlah ledger.
- Kursi lokal (tanpa akun) dan mode latihan tamu tidak menghasilkan poin.

| Game | Partisipasi | Pencapaian | Batas |
|---|---|---|---|
| Misi Bendera | 5 | kesulitan × 40 + benar × 5 (+30 tanpa gagal) | 255 |
| Sky Quiz | 5 | benar × 10 (+20 selesai, +20 sempurna) | 145 |
| Kereta Pengetahuan | 5 | benar × 10 (+20 selesai, +20 sempurna) | 145 |
| Pilah Port & Protokol (solo) | 5 | paket benar × 10, 30 paket (+20 selesai, +20 sempurna) | 3190 |
| Duel Kuis Kelas | 5 | benar × 10 (+20 menang / +10 seri) | 75 |
| Ular Tangga | 5 | benar × 10 (+20 menang, +100 pertama finish) | 3250 |
| Teka-Teki Silang | 5 | kata × (5 + 5 × level) (+20 juara) | 5 + kata × poin per kata + 20 |
| Pasar Matematika, Taman Angka & Huruf, Jelajah Indonesia, Lab Mini | 5 | benar × 10 (+20 juara / lulus solo ≥ 70%) | 950 |
| Lantai Runtuh | 5 | benar × 10 (+20 juara) | 2150 |
| Peti Emas Misteri | 5 | benar × 10, maks. 40 jawaban (+20 juara emas) | 4150 |
| Order Rush TKJ | 5 | modul benar × 10, maks. 40 (+20 juara) | 4150 |
| Turbo Trivia | 5 | benar × 10, maks. 15 soal (+20 juara 1) | 1650 |

### Ular Tangga (`internal/snakes`)

- **Lama bermain (host, sebelum mulai):** `duration{minutes}` dengan pilihan `0` (sampai ada yang finish), 5, 10, 15, 20, 30 menit. Mode berwaktu: pemain yang finish berhenti mendapat giliran, sisanya lanjut sampai waktu habis; peringkat = urutan finish, lalu petak terjauh.
- **Bonus finish:** pemain pertama yang mencapai petak 100 mendapat `FinishBonus` (+100 poin portal).
- **Waktu tunggu giliran:** dadu dikocok otomatis setelah `RollTime` (10 detik). Setelah kocok otomatis, waktu jawab jadi `IdleAnswerTime` (10 detik) supaya HP yang ditinggal tidak menahan pemain lain.
- **Keluar di tengah permainan:** konfirmasi di UI, server membalas `{t: "left", points}` dengan poin yang tetap masuk akun.
- **`sync`:** client meminta state terbaru bila deadline langkah sudah lewat tanpa update (jaring pengaman dialog dadu/soal yang macet). `useGameSocket` juga reconnect saat tab kembali terlihat atau socket diam > 25 detik (`lib/socket-watchdog.ts`).

### Game kuis ruang (`internal/minigames`)

Empat game memakai satu referee bersama: `market-math`, `number-garden`, `explore-indonesia`, `mini-lab`.
- WebSocket `GET /ws/{game}` (gateway `/game-ws/{game}`), token `POST /games/{game}/token`, halaman `games/mini-game`.
- 8 soal per permainan, semua kursi menjawab soal yang sama. Waktu jawab mengikuti kelas terendah. Jawaban benar lebih cepat mendapat skor lebih tinggi.
- Soal dibuat server sesuai jenjang (belanja/kembalian/diskon, pola angka/huruf, provinsi/budaya, percobaan sains). Soal bank admin yang didistribusikan ke game ini ikut dicampur.
- Pesan client → Go: `create`, `join{pin}`, `leave`, `start`, `answer{option}`, `locale`, `ping`. State: `mini_state`.
- `event_id`: `{mm|ng|ei|ml}-{user}-room-{nanos}`, misi `room`.

### Lantai Runtuh / Floor Drop (`internal/floordrop`)

Battle royale kuis untuk 2–100 pemain per ruangan. Berbeda dari `lobby.Hub`
(satu mutex untuk semua ruangan), setiap ruangan Floor Drop berjalan di
goroutine sendiri dan memegang state-nya sendiri. Goroutine koneksi hanya
mengirim perintah lewat channel dan membaca "gerbang jawaban" atomik
(`round_id`, deadline, open), sehingga jawaban terlambat ditolak di
penerimaan sebelum masuk antrean ruangan. Waktu jawaban selalu jam server
saat pesan diterima; timestamp klien tidak pernah dibaca.

- **Peran:** layar host (guru/proyektor) memakai token `floor-drop-host`
  (`POST /games/floor-drop/token?role=host`), pemain memakai token
  `floor-drop`. Host tidak bisa menjawab; pemain tidak bisa memulai.
- **State machine:** `LOBBY → ROUND_SUMMARY (siap) → QUESTION_ACTIVE →
  LOCK_ANSWERS → REVEAL_DROP → ROUND_SUMMARY → … → GAME_OVER`.
- **Eliminasi:** salah atau tidak menjawab = tersingkir (jadi penonton).
  Waktu ronde berikutnya 90% ronde sebelumnya (min. 4 detik; kelas 0–2 mulai
  15 detik, lainnya 10 detik). Jika semua yang tersisa salah di ronde yang
  sama (*sudden death*), peringkat ditentukan jawaban tercepat di ronde itu.
  Game selesai saat ≤1 pemain tersisa atau setelah 20 ronde.
- **Reconnect:** koneksi putus diberi jendela 5 detik; lewat itu pemain
  tersingkir dengan alasan `disconnected`. Host yang keluar menutup ruangan
  dan pemain dibayar sesuai capaian (`points.Abandoned`).
- **Hasil:** peringkat akhir, lama bertahan (`survival_ms`) dan akurasi
  dikirim ke `/api/internal/game-results` (HMAC `X-Game-Signature`) dan
  disimpan di `game_match_players.survival_ms|accuracy`. Batas poin
  `points.Cap(20) = 2150`, maks. 100 pemain per match.
- **Presisi timer:** loop ruangan bangun tepat di deadline fase (bukan
  polling). Uji beban 100 pemain (`TestHundredPlayersTickVariance`, `-race`)
  mensyaratkan keterlambatan bangun < 50 ms; terukur ~1 ms. Benchmark
  `BenchmarkRoundHundredPlayers`: ~1,2 ms untuk 100 jawaban.

Kontrak WebSocket `GET /game-ws/floor-drop?token=…&locale=id|en`:

| Arah | Pesan | Isi |
| --- | --- | --- |
| klien → server | `create_room` | host saja |
| klien → server | `join_room` | `{pin}` |
| klien → server | `start_game` | host saja (juga "main lagi") |
| klien → server | `set_subject` | host, `{subject}` |
| klien → server | `submit_answer` | `{round_id, choice_index}` |
| klien → server | `leave_room`, `sync`, `locale`, `ping` | |
| server → klien | `state_sync` | snapshot penuh (fase, pemain, `you`, soal, podium) |
| server → klien | `question_start` | `{round_id, round, time_limit, remaining_ms, question, options, alive}` |
| server → klien | `answer_ack`, `answer_progress` | konfirmasi & `{answered, alive}` (maks. 4×/detik) |
| server → klien | `lock_answers` | `{choices, tiles}` posisi pemain per ubin |
| server → klien | `tile_drop` | `{correct_index, eliminated_user_ids, survivors, sudden_death, hint}` |
| server → klien | `round_summary` | `{survivors, next_time_limit}` |
| server → klien | `player_eliminated` | `{user_ids, reason}` (putus/keluar) |
| server → klien | `podium_result` | `{podium[3], ranking[], you}` |
| server → klien | `error` | `{code}` → `room.errors.*` |

### Peti Emas Misteri / Economy Heist (`internal/heist`)

Kuis emas mandiri (referensi Blooket Gold Quest / Gimkit) untuk 2–60 pemain
per ruangan. Pola sama dengan Lantai Runtuh: setiap ruangan berjalan di
goroutine sendiri, koneksi hanya mengirim intent lewat channel perintah, dan
host memakai token terpisah (`economy-heist-host`).

- **Kondisi menang (host):** `TIME_LIMIT` (3/5/7/10/15 menit, emas terbanyak
  menang) atau `GOLD_TARGET` (1.000–25.000 emas, pertama mencapai target
  menang; batas aman 20 menit). Host juga bisa mengakhiri lebih awal.
- **Alur pemain (asinkron):** setiap pemain punya aliran soal sendiri sesuai
  kelasnya. Benar → 3 peti misteri (isi diundi server *sebelum* dipilih, ketiga
  isi ditampilkan setelah dibuka). Salah → cooldown 3 detik tanpa peti.
  Pemain yang terlambat boleh masuk saat permainan berjalan (mulai 0 emas).
- **Isi peti (bobot %):** `ADD_GOLD` +50/+100/+250 atau +10/+25/+50% (50),
  `LOSE_GOLD` −10…−25% (14), `SHIELD` (10), `STEAL_PERCENT` 10…25% (15),
  `SWAP_GOLD` (7), `BANKRUPT_BOMB` −50% (4). Tanpa lawan, curi/tukar diganti
  +100 emas. Persentase gain minimal `2 × persen` emas.
- **Curi/tukar:** pemain memilih target dalam 20 detik (`execute_heist_target`).
  Perisai target menahan serangan sekali lalu pecah (`BLOCKED`), tidak ada emas
  yang berpindah; penyerang dan korban sama-sama diberi tahu.
- **Ledger atomik:** `heist.Ledger` (mutex) membaca-memeriksa-memindah saldo
  dalam satu critical section: saldo tidak pernah negatif, transfer tidak
  menciptakan emas (uji `TestLedgerConcurrentTransfers`,
  `TestDoubleSpendSameVictim`, `-race`). Batas saldo 10.000.000.
- **Avatar:** `join_room` membawa `avatar`; Go memakai claim `character` dari
  token bertanda tangan bila ada (klien tidak bisa memalsukan avatar orang
  lain), lalu meneruskannya di roster, leaderboard, feed aksi, dan podium.
  `player_id` yang tidak sama dengan token ditolak (`invalid_player`).
- **Hasil:** peringkat berdasarkan emas akhir; `match.players[].score` = emas.
  `event_id` `eh-{user}-room-{nanos}`, misi `room`, maks. 60 pemain,
  `points.Cap(40) = 4150`.

Kontrak WebSocket `GET /game-ws/economy-heist?token=…&locale=id|en`:

| Arah | Pesan | Isi |
| --- | --- | --- |
| klien → server | `create_room`, `start_game`, `end_game` | host saja |
| klien → server | `configure` | host, `{win: TIME_LIMIT\|GOLD_TARGET, value}` |
| klien → server | `set_subject` | host, `{subject}` |
| klien → server | `join_room` | `{room_code, player_id, username, avatar}` |
| klien → server | `submit_answer` | `{question_id, answer_index}` |
| klien → server | `select_chest` | `{chest_index}` (0–2) |
| klien → server | `execute_heist_target` | `{target_player_id}` |
| klien → server | `leave_room`, `sync`, `locale`, `ping` | |
| server → klien | `state_sync` | snapshot (fase, roster, kondisi menang, leaderboard, feed, `you`, podium) |
| server → klien | `player_sync`, `question` | state pribadi pemain / soal berikutnya |
| server → klien | `answer_result` | `{question_id, correct, correct_index, cooldown_ms?}` |
| server → klien | `chest_result` | `{type, value, unit, requires_target, chest_index, chests[3], gold, delta}` |
| server → klien | `balance_update` | `{player_id, gold, delta, reason}` |
| server → klien | `action_broadcast` | `{source_player, action, target_player?, amount, blocked}` |
| server → klien | `leaderboard_sync` | `{leaderboard[], remaining_ms}` (maks. 4×/detik) |
| server → klien | `heist_expired` | waktu memilih target habis |
| server → klien | `podium_result` | `{podium[3], ranking[], you}` |
| server → klien | `error` | `{code}` → `room.errors.*` |

### Order Rush / Sequence Masters TKJ (`internal/orderrush`)

Balapan menyusun urutan (tap-to-order) materi TKJ untuk 2–60 pemain per
ruangan. Pola sama dengan Peti Emas Misteri: satu goroutine per ruangan,
koneksi hanya mengirim intent lewat channel, host memakai token terpisah
(`order-rush-host`).

- **Mode (host):** `RACE` (pertama menyelesaikan 5/10/15/20 modul; batas aman
  15 menit) atau `TIME_ATTACK` (3/4/5 menit, skor terbanyak). Host memilih
  materi (set urutan); kosong = semua materi diacak.
- **Bank urutan:** `sequence_sets` (admin `/admin/games/order-rush/sequences`, tab di halaman game), disinkron Go
  tiap menit lewat `GET /api/internal/sequence-bank` (HMAC). Bawaan: UTP T568B,
  UTP T568A, Fiber 12 core, OSI atas-bawah, OSI bawah-atas, PDU, DHCP DORA, TCP
  3-way handshake, troubleshooting, plus kabel dua ujung **Straight (T568B ↔
  T568B)** dan **Cross (T568B ↔ T568A)**. Set dua ujung punya `ends` (2 nama
  ujung) dan item = ujung A lalu ujung B (masing-masing 2–12); pemain mengisi
  kedua ujung dan LAN tester memakai 2 baris. Validasi membandingkan nilai
  kepingan, jadi dua kabel identik (mis. Putih-Orange di A1 dan B1) boleh
  tertukar. Item disimpan dalam urutan benar; Go
  membagikan kepingan dengan id acak per modul dan **tidak pernah** mengirim
  urutan benar ke klien.
- **Validasi (authoritative):** `submit_sequence` harus permutasi lengkap dari
  kepingan modul (panjang, id, tanpa duplikat), kalau tidak `invalid_order`
  tanpa dihitung salah. `FirstMismatch` membandingkan sampai panjang terpendek
  sehingga panjang array apa pun aman (tanpa panic). Salah → `error_slot_index`
  pertama, streak putus. Waktu = jam server saat diterima; `client_duration_ms`
  diabaikan.
- **Skor:** 100 + bonus kecepatan linear sampai +100 bila < 5 detik. Setiap 3
  benar beruntun → power-up acak (maks. 3 disimpan): `TANGLE` (acak kepingan
  lawan 3 detik), `FREEZE` (blokir input lawan 1,5 detik), `SHIELD` (tahan 1
  serangan). Tanpa target → pemimpin yang diserang.
- **Race condition:** skor, streak, inventori, perisai dan efek sabotase ada di
  `orderrush.Scoreboard` (mutex). Pemakaian power-up membaca-mengecek-mengurangi
  inventori penyerang dan perisai target dalam satu critical section
  (`TestConcurrentSabotageOneShield`, `TestConcurrentSubmitsScoreOnce`, `-race`).
- **Avatar:** claim `character` token (fallback `avatar` di `join_room`) dikirim
  di roster, `race_progress_broadcast`, feed sabotase, dan podium.
- **Hasil:** `event_id` `or-{user}-room-{nanos}`, misi `room`, maks. 60 pemain,
  `points.Cap(40) = 4150`. `match.players[].score` = skor balapan, `accuracy` =
  benar / jumlah submit. Tambahan `sequence_stats[]` per set
  (`attempts, solved, wrong, total_ms, slot_errors[]`) disimpan ke
  `sequence_attempts` untuk analitik "urutan paling sering salah" (slot mana).

Kontrak WebSocket `GET /game-ws/order-rush?token=…&locale=id|en`:

| Arah | Pesan | Isi |
| --- | --- | --- |
| klien → server | `create_room`, `start_game`, `end_game` | host saja |
| klien → server | `configure` | host, `{mode: RACE\|TIME_ATTACK, value, sets[]}` |
| klien → server | `join_room` | `{room_code, player_id, username, avatar}` |
| klien → server | `submit_sequence` | `{question_id, submitted_order[], client_duration_ms}` |
| klien → server | `use_powerup` | `{powerup_type, target_player_id?}` |
| klien → server | `leave_room`, `sync`, `locale`, `ping` | |
| server → klien | `state_sync` | snapshot (fase `LOBBY\|RACE_ACTIVE\|GAME_OVER`, katalog set, leaderboard, feed, `you` + modul aktif) |
| server → klien | `sequence_validated` | `{is_correct, error_slot_index, earned_score, speed_bonus, streak, score, step, next_question?, powerup_granted?}` |
| server → klien | `sabotage_received` | `{attacker_name, attacker, type, duration_ms, blocked}` |
| server → klien | `powerup_result` | `{type, blocked, inventory, target_player?}` |
| server → klien | `action_broadcast` | feed sabotase (host semua, pemain yang terlibat) |
| server → klien | `race_progress_broadcast` | `{leaderboard[{id, username, avatar, score, step, streak}], remaining_ms}` (maks. 4×/detik) |
| server → klien | `podium_result` | `{podium[3], ranking[] (akurasi, rata-rata waktu), you}` |
| server → klien | `error` | `{code, for}` → `room.errors.*` |

### Turbo Trivia / Kart Racer (`internal/turbotrivia`)

Balap gokart kuis kelas untuk 2–40 murid. Dua layar: proyektor/Smart TV
(`/arena/turbo-trivia/{pin}`, token `turbo-trivia-host`) dan HP murid
(`/play/turbo-trivia/{pin}`, token `turbo-trivia`). Arena menampilkan PIN dan
QR (`/games/turbo-trivia/qr/{pin}`) yang membuka kontroler; `?pin=` dan link
undangan standar `/games/turbo-trivia/join/{pin}` juga membuka kontroler.

- **Goroutine per ruang + tick 20 Hz** (`Config.Tick` 50 ms). Setiap tick
  menggerakkan kart (`progress` dalam lap, 3 lap), cek tabrakan pisang, rudal
  yang mendarat, garis finish, lalu broadcast `tick` ke proyektor. HP menerima
  status kart pribadi `kart` maks. 5×/detik.
- **Kecepatan:** dasar 50 km/j. Benar → Nitro 120 km/j selama
  `2,5 + 2 × S` detik (`S` = sisa waktu jawab / batas waktu, jam server).
  Salah → Engine Stutter 30 km/j selama 2 detik. Panjang lap dihitung dari
  jumlah soal sehingga kart rata-rata finish sekitar soal terakhir.
- **Soal:** 10/12/15 soal (host memilih), mapel dari `SubjectPicker`, semua
  murid menjawab soal yang sama. Waktu jawab 15 detik (20 detik bila ada murid
  kelas 0–2), selesai lebih cepat bila semua sudah menjawab. Jawaban < 300 ms
  ditolak `too_early`. Bank soal: soal pilihan ganda yang didistribusikan ke
  `turbo-trivia` (migrasi menyalin semua soal Sky Quiz).
- **Item Box** (maks. 2 disimpan, diundi saat jawaban benar):
  `BANANA` (jatuh 0,006 lap di belakang kart, lawan yang melintas berhenti
  3 detik), `MISSILE` (homing ke pemimpin selain penembak, mendarat 1,2 detik,
  stagger 2,5 detik), `LIGHTNING` (semua lawan menyusut, kecepatan ×0,6 selama
  4 detik), `SHIELD` (8 detik, menyerap 1 pisang/rudal lalu pecah, kebal petir).
  Posisi 1–3 tidak bisa mendapat Rudal/Petir; makin belakang makin besar
  peluangnya (`ItemWeights`).
- **Akhir balapan:** semua kart finish, 30 detik setelah kart pertama finish,
  batas aman waktu, atau host `end_game`. Peringkat: waktu finish, lalu jarak.
- **Hasil:** `event_id` `tt-{user}-room-{nanos}`, misi `room`, maks. 40 pemain,
  `points.Cap(15) = 1650`. `match.players[].score` = persen jarak tempuh,
  `survival_ms` = waktu balap, `accuracy` = benar / soal.

Kontrak WebSocket `GET /game-ws/turbo-trivia?token=…&locale=id|en`:

| Arah | Pesan | Isi |
| --- | --- | --- |
| klien → server | `create_room`, `start_game`, `end_game` | host saja |
| klien → server | `configure` | host, `{questions: 10\|12\|15}` |
| klien → server | `set_subject` | host, `{subject}` |
| klien → server | `join_room` | `{room_code, player_id, avatar}` |
| klien → server | `submit_answer` (SUBMIT_ANSWER) | `{qid, choice_index}` |
| klien → server | `use_item` (USE_ITEM) | `{item: BANANA\|MISSILE\|LIGHTNING\|SHIELD}` |
| klien → server | `leave_room`, `sync`, `locale`, `ping` | |
| server → klien | `state_sync` | snapshot (fase `LOBBY\|COUNTDOWN\|RACE\|GAME_OVER`, roster, kart, hazard, `quiz`, `you`, podium) |
| server → proyektor | `tick` (TICK, 20 Hz) | `{seq, race_ms, karts[{id,p,v,fx,rank,fin,...}], bananas[], missiles[], answered}` |
| server → HP | `kart` | `{speed, fx, rank, of, progress, lap, items, remaining_ms}` |
| server → klien | `question_start`, `question_end` | soal (tanpa kunci) / `{correct_index, hint}` |
| server → HP | `answer_result` | `{correct, nitro_ms?, stutter_ms?, item?, items}` |
| server → HP | `item_gained` (ITEM_GAINED) | `{item, items}` |
| server → semua | `item_triggered` (ITEM_TRIGGERED) | `{event: {kind: item\|banana_hit\|missile_hit, item, by, target, struck[], immune[], blocked}}` |
| server → HP | `hit`, `item_used`, `finished` | efek ke kart sendiri |
| server → semua | `race_event` | `finish`, `left` (ticker) |
| server → klien | `podium_result` | `{podium[3], ranking[], you}` |
| server → klien | `error` | `{code, for}` → `room.errors.*` |

## 3. Poin vs saldo toko

- **Poin terkumpul** = jumlah ledger positif. Dipakai untuk level dan peringkat; tidak pernah turun.
- **Saldo** = jumlah seluruh ledger. Membeli item karakter menulis ledger negatif (`shop:{item}`), jadi saldo turun tetapi level/peringkat tetap.

## 4. Iklan sponsor (`config/ads.php`, `AdServer`)

Iklan adalah sumber pendapatan. Superadmin mengelolanya di `/admin/ads`: pengiklan, kampanye (durasi, nilai kontrak, batas tayang total/harian, bobot, target game dan kelas), materi iklan (logo per ukuran, moto, jingle, item karakter sponsor), dan laporan harian per penempatan/game.

**Fondasi untuk setiap game (wajib):**

| Bagian | Cara pasang |
|---|---|
| Data | Route halaman game memakai `RecordGameAccess::class.':<key>'`. Middleware ini mengirim prop Inertia `ads` (penempatan => materi) dan `adGame`. Tidak perlu kode backend tambahan. |
| Strip header | `<GameAdStrip />` sebagai anak pertama `<main>`. |
| Hasil / samping / hitung mundur / papan | `<AdSlot placement="arena.result" />`, `arena.sidebar`, `arena.loading`, `arena.board`. |
| Jingle | `useAdMoments(phase, { muted, won })` (phase `idle`/`playing`/`done`), atau `<AdMoment moment="start" />` / `"win"` di UI bermain/pemenang. Mengikuti tombol mute game. |
| Item karakter | Materi tipe `item` menautkan `character_items.advertiser_id`; toko menampilkan chip "Disponsori …". |

- Penempatan yang kosong tidak merender apa pun.
- Setiap iklan diberi label "Sponsor".
- Tayangan dihitung bila ≥50% terlihat. Klik dan putar jingle dicatat lewat token `serve` bertanda tangan (HMAC dari `APP_KEY`, berlaku 6 jam, terikat ke user), satu kali per serve, ke `ad_events` dan `ad_daily_stats`.
- URL klik hanya https dan tidak dikirim ke browser (diarahkan lewat `/ads/click`).
- Media disimpan di disk `public` (`ads/*`) dan disajikan lewat `/ads/media/*` dengan `nosniff`. SVG ditolak.
- **Statis atau dinamis:** tiap penempatan diatur di *Admin → Advertising → Delivery settings*. Mode statis menampilkan satu materi per tampilan halaman. Mode berganti (*rotating*) memutar hingga N materi setiap X detik; rotasi berhenti saat kursor di atas iklan, saat tab tersembunyi, atau bila pemain memilih *reduced motion*. Jingle dan item toko selalu statis.
- **Mematikan iklan:** saklar global (`settings.ads.enabled`) menyembunyikan semua ruang iklan, label sponsor, dan jingle. Per user lewat kolom `users.ads_disabled` (menu *Hide ads* di daftar user atau di Delivery settings). Keduanya dicek di `AdServer::showsAdsTo()`.
- **Analitik kampanye:** jangkauan (pemain unik), frekuensi rata-rata dan sebarannya, CTR per penempatan/game/materi, perangkat, kelas, dan jam tayang. Data berasal dari `ad_events` (kolom `device`, `grade`) dan `ad_daily_stats`.

