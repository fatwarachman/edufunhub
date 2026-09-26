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
5. Pisahkan deployment dan observability portal Laravel dari game service Go bila skala gameplay meningkat.
6. Tambahkan test Laravel untuk portal/API contract dan test Go untuk aturan gameplay.

## Kondisi saat ini

Game demo yang sudah ada masih berupa frontend React/Inertia untuk prototyping visual dan interaksi lokal. Migrasi gameplay produksi ke Go dilakukan sebelum fitur multiplayer online, scoring persisten, matchmaking, atau state game authoritative dirilis.

## Open questions

- Lokasi service Go: repository/package terpisah atau monorepo `services/game`.
- Pilihan storage state room: in-memory, Redis, atau kombinasi.
- Kontrak autentikasi antara Laravel dan Go.
- Strategi deployment dan autoscaling game service.
