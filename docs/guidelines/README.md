# EduFunHub — Panduan Pengembangan (wajib untuk semua agen & developer)

> **Status:** Accepted · **Berlaku sejak:** 0.3.1 (2026-10-09)
> Dokumen ini adalah **source of truth gaya & teknis**. Agen apa pun (Claude, Codex, Gemini, OpenCode, Hermes, manusia) yang membuat game, fitur, halaman, atau menu baru **wajib membaca dan mengikuti** panduan ini. Bila kode yang ada bertentangan dengan panduan, ikuti pola di **game/fitur referensi** yang disebut di sini, lalu catat ketidaksesuaian itu, jangan membuat gaya ketiga.

## Daftar dokumen

| File | Isi | Baca saat |
|---|---|---|
| [`design-system.md`](design-system.md) | Warna, tipografi, border/bayangan, radius, spacing, ikon, tombol, kartu, dialog, motion, responsif, aksesibilitas, mode gelap | Menyentuh UI apa pun |
| [`game-development.md`](game-development.md) | Resep lengkap game baru: Go referee, kontrak WebSocket, Laravel controller/route/katalog, halaman React, tutorial, iklan, finale, poin, test | Membuat/mengubah game |
| [`features-and-menus.md`](features-and-menus.md) | Halaman pemain, halaman admin, registrasi menu (header, sidebar admin, pencarian fitur, katalog game, landing), i18n, Form Request, audit log | Membuat fitur/halaman/menu |
| [`qa-and-release.md`](qa-and-release.md) | Gate verifikasi (lint, types, build, Pest, Go test), cara menjalankan di server dev `mfrdev`, changelog SemVer, git | Sebelum menyatakan selesai |

Dokumen pendukung yang tetap berlaku: [`../architecture.md`](../architecture.md) (batas Laravel ↔ Go, kontrak tiap game), [`../multiplayer.md`](../multiplayer.md) (PIN, poin, iklan), [`../../DEVELOPER.md`](../../DEVELOPER.md) (keamanan, middleware, deployment).

## 12 aturan emas (ringkas)

1. **Gameplay di Go, bukan Laravel/React.** Aturan, skor, timer, validasi jawaban, multiplayer = paket Go di `services/game/internal/<game>`. React hanya render + kirim intent. Kunci jawaban tidak pernah dikirim sebelum dijawab.
2. **Satu bahasa visual pemain: "playful neo-brutalist".** Garis tinta `#1f2a44`, border tebal 2–3 px, bayangan offset keras (`shadow-[4px_4px_0px_#1f2a44]`), sudut membulat besar, latar krem/pastel, font display Fredoka. Admin memakai token shadcn (`bg-card`, `border-border`) dan mendukung mode gelap. Jangan mencampur keduanya.
3. **Pakai ulang komponen bersama** (`SiteNav`, `BackButton`, `BrandLink`, `DigitalClock`, `RoomEntry`, `RoomLobby`, `SubjectPicker`, `AnswerTimePicker`, `RoomLeaveControl`, `GameFinale`, `GameAdStrip`, `AdSlot`, `PlayerAvatar`, `Panel`/`EmptyState`/`ConfirmDialog` admin, `ResponsiveTable`). Membuat versi baru dari komponen yang sudah ada = ditolak.
4. **Tidak ada teks UI hardcode.** Pemain: `t('key')` + `resources/js/locales/{id,en}-player.json`. Admin: `tr('English source')` + `id-admin.json`. Backend: `lang/{id,en}/*.php`. Indonesia default, Inggris wajib.
5. **Tidak ada emoji sebagai ikon.** Ikon = `lucide-react` (atau SVG ilustrasi milik game). Ikon dekoratif `aria-hidden="true"`; tombol ikon-saja wajib `aria-label`.
6. **Target sentuh ≥ 44 px** (`min-h-11`, `size-11`, `.edu-nav-btn`). Tidak boleh ada scroll horizontal di 320–1280 px.
7. **Hormati `prefers-reduced-motion`** untuk animasi, autoplay tutorial, confetti.
8. **Setiap game**: route `RecordGameAccess`, `<GameAdStrip />`, `<AdSlot placement="arena.result" />`, `useAdMoments`, `<GameFinale />`, `HowToPlay` + tutorial MP4/PDF, `data-testid` pada kontrol penting.
9. **Setiap game multiplayer**: standar PIN + link (`lobby.Hub`, `GameInviteController`, `RoomEntry`/`RoomLobby`/`useRoomPin`), poin via `internal/points`, `record.Match`.
10. **Validasi = Form Request, mutasi admin = `activity()` log, route admin di `routes/admin.php`, halaman admin dibungkus `<AdminLayout>`.**
11. **Setiap perubahan dicatat** di `database/data/changelog.php` (id + en, SemVer) dalam pekerjaan yang sama.
12. **Bukti nyata sebelum klaim selesai**: test Pest/Go yang relevan hijau, `pnpm run build` sukses, i18n paritas id/en, tidak ada kunci mentah tampil di layar.

## Referensi implementasi (contoh "benar")

| Kebutuhan | Tiru dari |
|---|---|
| Game duel/room 1–4 pemain (lobby.Hub) | Ping Pong: `services/game/internal/pingpong`, `app/Http/Controllers/PingPongController.php`, `resources/js/pages/games/ping-pong.tsx`, `resources/js/hooks/use-ping-pong.ts`, `resources/js/lib/ping-pong.ts`, `resources/js/components/ping-pong/*` |
| Game kelas host/proyektor + HP pemain (goroutine per ruang) | Monster Café (`internal/monstercafe`, `pages/games/monster-cafe.tsx`, `components/monster-cafe/{host-screen,player-screen,shared,how-to-play}.tsx`, `css/monster-cafe.css`) |
| Dua layar arena `/arena/...` + kontroler `/play/...` + QR | Turbo Trivia, Block Battle |
| Halaman pemain (non-game) | `pages/user/dashboard.tsx`, `pages/leaderboard/index.tsx` dengan `PlayerLayout` |
| Halaman admin CRUD | `pages/admin/subjects/index.tsx` |
| Dashboard/statistik admin | `pages/admin/dashboard.tsx`, `components/admin/dashboard-kit.tsx`, `components/admin/game-stats.tsx` |

## Checklist cepat sebelum PR / laporan selesai

- [ ] Aturan di atas dipatuhi; tidak ada gaya visual baru di luar `design-system.md`.
- [ ] Teks baru ada di id **dan** en; `LocaleTest` + test paritas lulus.
- [ ] Menu/katalog/landing/pencarian fitur sudah diregistrasi (lihat `features-and-menus.md` §5).
- [ ] Test baru ditulis; test terkait + Go test lulus; `pnpm run build` sukses.
- [ ] Entri changelog ditambahkan; versi disebut di laporan.
- [ ] Tidak deploy ke prod, tidak push `main`, tidak commit tanpa diminta pemilik.
