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
Pesan Go → client: `welcome`, `correct{x,y}`, `challenge`, `gates`, `raise`, `complete`, `error{code}`, `pong`.

Aturan server-side: kecepatan gerak dibatasi, collision air/gerbang/props, jawaban tidak pernah dikirim ke client
sebelum dijawab, poin dihitung di Go (maks 250), hasil idempotent via `event_id` unik.

## Open questions

- Lokasi service Go: repository/package terpisah atau monorepo `services/game`.
- Pilihan storage state room: in-memory, Redis, atau kombinasi.
- Kontrak autentikasi antara Laravel dan Go.
- Strategi deployment dan autoscaling game service.
