# EduFunHub — QA, Changelog & Rilis

> Bagian dari [`README.md`](README.md). Tidak ada pekerjaan yang dinyatakan selesai tanpa bukti eksekusi nyata dari gate di bawah.

## 1. Lingkungan dev (`mfrdev`, 172.16.200.27)

- Repo: `/root/dev/edufunhub`, branch `dev`. Paket manager frontend: **pnpm** (bukan npm/yarn untuk install).
- Host **tidak punya PHP dan Go**. Jalankan lewat Docker:

```bash
# Pest (file atau filter tertentu). --tmpfs mencegah bootstrap/cache host membekukan config.
docker run --rm --entrypoint php --network edufunhub-net --tmpfs /app/bootstrap/cache \
  -v /root/dev/edufunhub:/app -w /app edufunhub-app:latest \
  artisan test --compact tests/Feature/PingPongTest.php

# Pint hanya pada file yang diubah (jangan direktori)
docker run --rm --entrypoint vendor/bin/pint -v /root/dev/edufunhub:/app -w /app \
  edufunhub-app:latest --format agent app/Http/Controllers/WordRallyController.php

# Go: format, vet, test
cd services/game && docker run --rm -v "$PWD":/src -w /src -v edufunhub-gomod:/go/pkg/mod \
  -e CGO_ENABLED=0 golang:1.23-alpine sh -c 'gofmt -l . ; go vet ./... && go test ./...'

# Logika murni klien
node --test resources/js/lib/<key>.test.mjs
```

- `--entrypoint` wajib: tanpa itu entrypoint image menjalankan migrate + server dan perintah menggantung.
- Container: `edufunhub-app`, `edufunhub-dashboard`, `edufunhub-game`, `edufunhub-chat`, `edufunhub-gateway`, `edufunhub-db`. **Jangan** rebuild/restart/deploy tanpa permintaan pemilik.

## 2. Gate verifikasi (urut)

| # | Gate | Perintah | Lulus bila |
|---|---|---|---|
| 1 | Format TS/TSX | `pnpm exec prettier --write <file baru/yang diubah>` | Tidak reformat file lama yang sebelumnya belum prettier-clean |
| 2 | Lint | `pnpm exec eslint <file>` | 0 error |
| 3 | Types | `pnpm run types` | Jumlah error tidak bertambah dibanding baseline `git stash` |
| 4 | Build | `pnpm run build` | Sukses |
| 5 | PHP style | Pint (file eksplisit) | Bersih |
| 6 | Pest | test file fitur + test bersama yang terdampak | Hijau |
| 7 | Go | `gofmt -l` kosong, `go vet`, `go test ./...` | Hijau |
| 8 | i18n | `LocaleTest`, `FeatureSearchCatalogTest`, paritas id/en | Hijau, tidak ada kunci mentah di UI |
| 9 | Browser (UI) | cek 320/360/390/768/1280 px, `scrollWidth === innerWidth`, bahasa id+en, admin terang+gelap | Tidak overflow/terpotong, kontras AA |

Kegagalan test yang sudah ada sebelum perubahan: buktikan dengan baseline (stash atau `git worktree` HEAD) dan laporkan terpisah; jangan diklaim sebagai regresi baru, jangan disembunyikan.

## 3. Test yang wajib ditulis

| Perubahan | Test |
|---|---|
| Route/halaman baru | Pest feature: akses (guest → login, role salah → 403), render Inertia + props |
| Form | Pest: sukses, validasi gagal (dataset), otorisasi, activity log |
| Endpoint hasil game | Pest: signature, cap, pola event_id, idempotensi, ledger |
| Gameplay | Go test di paket game (+ `-race` untuk ruang berkonkurensi) |
| Copy/locale saja | Pest: paritas kunci id/en, nilai tidak kosong |
| Logika klien murni | `node --test` |
| Alur UI kritis | Pest 4 browser test (`tests/Browser/`) bila diminta |

Gunakan factory + state (`User::factory()->withPlayerDetails()`), `Http::fake()`/`preventStrayRequests()` untuk HTTP luar, `config(['game-service.secret' => str_repeat('x', 40)])` untuk tanda tangan.

## 4. Changelog (wajib setiap perubahan)

File: `database/data/changelog.php` (source of truth, rilis terbaru di **atas**).

```php
[
    'version' => '0.4.0',            // fitur/perilaku baru = MINOR; fix/tweak = PATCH
    'date' => 'YYYY-MM-DD',
    'changes' => [
        [
            'key' => 'word-rally-game',   // unik dalam rilis, kebab-case
            'type' => 'feature',          // feature | improvement | fix
            'title' => ['id' => '…', 'en' => '…'],
            'body' => ['id' => '…', 'en' => '…'],  // apa yang berubah bagi pengguna, bukan detail kode
        ],
    ],
],
```

- Versi yang sudah ada tidak diubah nomornya; boleh menambah perubahan ke rilis yang **belum** dirilis pada hari yang sama hanya bila pemilik meminta, selain itu buat versi baru.
- Sinkron ke admin: `php artisan changelog:sync` (entrypoint container menjalankannya saat boot).
- Sebut nomor versi di laporan akhir.

## 5. Git

- Kerja di `dev`. Commit hanya bila diminta: `feat(<area>): …`, `fix(<area>): …`, `chore: …`, `docs: …` (English, imperatif, ≤ 72 karakter).
- Satu fitur per commit bila memungkinkan; file bersama (katalog, locale, test bersama) boleh commit `chore: shared wiring for …` terpisah, mengikuti riwayat repo.
- Jangan push `main`, jangan rewrite history, jangan commit `.env`/kredensial.

## 6. Laporan akhir agen (format)

1. Ringkasan perubahan (file:baris penting).
2. Bukti gate: perintah + hasil (jumlah test lulus, build sukses, Go ok).
3. Versi changelog.
4. Hal yang belum dilakukan / butuh keputusan pemilik (rebuild container, deploy, aset tutorial, dsb).
