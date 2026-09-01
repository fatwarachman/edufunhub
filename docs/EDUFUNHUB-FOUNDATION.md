# EduFunHub — Platform Edukasi Interaktif & Gamified

> **Belajar Jadi Super Seru, Penuh Tantangan, dan Anti-Ngebosenin!**

EduFunHub adalah platform pembelajaran berbasis gamification: quiz harian berhadiah, live duel 1v1, RPG avatar & Pulau Ilmu, leaderboard, dan daily streak. Repo ini berisi **landing page statis** (nginx + Cloudflare tunnel) dan **fondasi aplikasi SaaS Laravel** (dari `XCO-Agency/Laravel-SAAS-Starter`).

## Structur

```text
EduFunHub/
├── public/index.html      # Landing page statis (cartoon pop, Tailwind CDN)
├── docker-compose.yml     # nginx :8095 + cloudflared tunnel → landing.edufunhub.com
├── app/ database/ routes/ # Laravel app (SaaS starter)
├── resources/js           # Inertia v2 + React 19 + shadcn/ui
└── docs/                  # Dokumentasi fitur starter
```

## Quick Start (Laravel App)

```bash
composer install
pnpm install
cp .env.example .env && php artisan key:generate   # atau pakai .env yang sudah ada
php artisan migrate --seed
pnpm build
php artisan serve --port=8095
```

## Quick Start (Landing, Docker)

```bash
docker compose up -d
# Lokal: http://localhost:8095 | Tunnel: https://landing.edufunhub.com
```

## Verifikasi

- **Test:** `php artisan test --compact` → 1511 passed (6045 assertions). Butuh `<ini name="memory_limit" value="1G"/>` di `phpunit.xml` (test suite besar).
- **Versi:** PHP 8.4+, Laravel 13, Inertia v2 + React 19, Tailwind v4, pnpm.

## Branches

- `main` — rilis stabil
- `dev` — pengembangan (aktif)

## Catatan

- Landing lama masih disajikan oleh nginx. Migrasi bertahap: landing → Laravel route `/`, aplikasi quiz di bawahnya.
- Stripe billing di starter butuh kredensial asli (`STRIPE_WEBHOOK_SECRET`) — nonaktif sampai dikonfigurasi.