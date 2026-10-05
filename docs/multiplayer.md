# Standar game multiplayer dan poin

**Status:** Accepted (2026-10-04)
Berlaku untuk semua game baru. Game lama yang sudah memakai standar ini: Ular Tangga, Duel Kuis Kelas, Teka-Teki Silang, Pasar Matematika, Taman Angka & Huruf, Jelajah Indonesia, Lab Mini.

## 1. Undangan (PIN + link)

Setiap game multiplayer memakai alur yang sama:

1. Host menekan **Buat ruang**. Go membuat **PIN 6 digit** unik.
2. Host membagikan PIN atau link `https://<host>/games/{game}/join/{pin}` (Salin PIN, Salin link, atau share bawaan HP).
3. Teman memasukkan PIN, atau membuka link. Tamu diminta login dulu, lalu kembali ke ruang.
4. Hanya **host** yang bisa mengubah pengaturan (misalnya level) dan menekan **Mulai**. Kalau host keluar, peran host pindah ke pemain berikutnya.
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
- Keluar sebelum selesai tetap dibayar `Participation + pencapaian`, asalkan sudah menjawab minimal `points.MinAnswersForAbandon` (3) soal. Ini mencegah farming buat-ruang/keluar.
- Poin dihitung dan dikirim oleh Go (hasil bertanda tangan HMAC), lalu Laravel mencatatnya di `game_histories` dan `point_ledgers`. Total poin akun adalah jumlah ledger.
- Kursi lokal (tanpa akun) dan mode latihan tamu tidak menghasilkan poin.

| Game | Partisipasi | Pencapaian | Batas |
|---|---|---|---|
| Misi Bendera | 5 | kesulitan × 40 + benar × 5 (+30 tanpa gagal) | 255 |
| Sky Quiz | 5 | benar × 10 (+20 selesai, +20 sempurna) | 145 |
| Kereta Pengetahuan | 5 | benar × 10 (+20 selesai, +20 sempurna) | 145 |
| Duel Kuis Kelas | 5 | benar × 10 (+20 menang / +10 seri) | 75 |
| Ular Tangga | 5 | benar × 10 (+20 menang) | 150 |
| Teka-Teki Silang | 5 | kata × (5 + 5 × level) (+20 juara) | 5 + kata × poin per kata + 20 |
| Pasar Matematika, Taman Angka & Huruf, Jelajah Indonesia, Lab Mini | 5 | benar × 10 (+20 juara / lulus solo ≥ 70%) | 950 |

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

