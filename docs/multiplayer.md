# Standar game multiplayer dan poin

**Status:** Accepted (2026-10-04)
Berlaku untuk semua game baru. Game lama yang sudah memakai standar ini: Ular Tangga, Duel Kuis Kelas, Teka-Teki Silang.

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

## 3. Poin vs saldo toko

- **Poin terkumpul** = jumlah ledger positif. Dipakai untuk level dan peringkat; tidak pernah turun.
- **Saldo** = jumlah seluruh ledger. Membeli item karakter menulis ledger negatif (`shop:{item}`), jadi saldo turun tetapi level/peringkat tetap.

