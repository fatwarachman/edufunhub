# EduFunHub — Developer Handoff

> **Baca ini sebelum menyentuh satu baris kode pun.**  
> Dokumen ini menjelaskan arsitektur, fitur, keamanan, dan konvensi yang wajib diikuti agar pengembangan baru tidak merusak fondasi yang sudah ada.

---

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Stack Teknologi](#2-stack-teknologi)
3. [Struktur Direktori Kritis](#3-struktur-direktori-kritis)
4. [Arsitektur Sistem](#4-arsitektur-sistem)
5. [Fitur yang Sudah Ada](#5-fitur-yang-sudah-ada)
6. [Sistem Keamanan](#6-sistem-keamanan)
7. [Database & Model](#7-database--model)
8. [Routing Convention](#8-routing-convention)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Deployment](#10-deployment)
11. [Aturan Wajib untuk Agent / Developer Berikutnya](#11-aturan-wajib-untuk-agent--developer-berikutnya)

---

## 1. Gambaran Umum

EduFunHub adalah platform edukasi berbasis game. Dua domain runtime yang **terpisah dan tidak boleh dicampur**:

| Domain | Teknologi | Tanggung Jawab |
|---|---|---|
| **Portal / Admin** | Laravel 13 + Inertia React | Auth, user management, admin dashboard, settings, CMS, workspace |
| **Game Runtime** | Go (belum diimplementasi) | Authoritative game state, scoring, collision, WebSocket, matchmaking |

Go berkomunikasi ke Laravel via internal API — **bukan** berbagi database secara langsung.

---

## 2. Stack Teknologi

### Backend

| Package | Versi | Peran |
|---|---|---|
| `laravel/framework` | ^13.0 | Core framework |
| `inertiajs/inertia-laravel` | ^3.0 | SSR bridge ke React |
| `laravel/fortify` | ^1.30 | Headless auth (login, register, 2FA, password reset) |
| `laravel/sanctum` | ^4.0 | API token authentication |
| `laravel/cashier` | ^16.0 | Stripe billing & subscription |
| `laravel/pennant` | ^1.20 | Feature flags |
| `laravel/reverb` | ^1.0 | WebSocket broadcasting |
| `laravel/octane` | ^2.13 | High-performance request handling |
| `laravel/scout` | ^11.0 | Full-text search |
| `laravel/socialite` | ^5.24 | OAuth social login |
| `laravel/ai` | ^0.8.1 | AI SDK integration |
| `laravel/mcp` | ^0.8.2 | Model Context Protocol |
| `spatie/laravel-activitylog` | ^4.12 | Audit trail otomatis |
| `spatie/laravel-webhook-server` | ^3.10 | Outgoing webhooks |
| `sentry/sentry-laravel` | ^4.20 | Error monitoring |

### Frontend

| Package | Versi | Peran |
|---|---|---|
| `react` | ^19 | UI framework |
| `@inertiajs/react` | ^3.6.0 | Inertia client |
| `tailwindcss` | v4 | Styling (CSS-first, no tailwind.config.js) |
| `@radix-ui/*` | various | Accessible UI primitives |
| `gsap` | ^3.15 | Animation |
| `i18next` | ^26.3.6 | Internasionalisasi |
| `laravel-echo` | latest | WebSocket client |
| `@sentry/react` | ^10.63 | Error tracking frontend |

### Build

- **Bundler**: Vite + `@laravel/vite-plugin` + `@vitejs/plugin-react`
- **Package manager**: `pnpm` — jangan pakai npm/yarn
- **TypeScript**: strict mode aktif
- **PHP tidak tersedia** di dev server MFR (172.16.200.27) — semua `php artisan` via `docker exec edufunhub-app php artisan`

---

## 3. Struktur Direktori Kritis

```
app/
├── Http/
│   ├── Controllers/
│   │   ├── Admin/          ← dashboard, users, roles, permissions, activity log, settings
│   │   ├── Auth/           ← login, register, socialite, magic link
│   │   ├── Api/            ← health check, workspace API v1
│   │   └── Settings/       ← user-facing profile, password, 2FA, sessions
│   ├── Middleware/         ← SEMUA middleware keamanan (lihat §6)
│   └── Requests/           ← Form Request validation (WAJIB, jangan inline validate)
├── Models/
│   ├── User.php            ← has roles, permissions, workspaces, is_superadmin flag
│   ├── Role.php            ← has permissions (many-to-many)
│   ├── Permission.php      ← atomic permission unit
│   ├── Setting.php         ← key-value store (group + cache)
│   ├── Workspace.php       ← multi-tenant root
│   └── ...                 ← lihat §7
├── Services/               ← business logic, jangan di controller
└── Providers/
    ├── AppServiceProvider.php
    └── FortifyServiceProvider.php  ← Fortify customization

routes/
├── web.php         ← public + auth routes
├── admin.php       ← semua /admin/* routes (diload via bootstrap/app.php `then`)
├── settings.php    ← user settings routes
├── api.php         ← API v1 routes (Sanctum)
├── ai.php          ← MCP server routes
└── channels.php    ← broadcasting channels

resources/js/
├── pages/
│   ├── admin/      ← semua halaman admin panel
│   ├── auth/       ← login, register
│   └── games/      ← game pages (index, sky-quiz, snakes-and-ladders)
├── layouts/
│   └── admin-layout.tsx   ← WAJIB dipakai semua halaman admin
├── components/
│   └── ui/         ← shadcn/ui primitives — JANGAN edit, extend saja
└── types/
    └── index.d.ts  ← SharedData, User, dll — update sini kalau tambah shared prop
```

---

## 4. Arsitektur Sistem

```
Browser
  │
  ▼ HTTPS
Nginx (reverse proxy)
  │
  ├── /           → Laravel (Inertia React) — portal, auth, admin
  ├── /api/       → Laravel (Sanctum API)
  └── /ws/        → Laravel Reverb (WebSocket)

Laravel ←→ MySQL / SQLite
         ←→ Redis (cache, queue, sessions)
         ←→ Stripe (via Cashier)
         ←→ Sentry (error tracking)

Go Game Server (PLANNED — belum ada)
  ├── internal REST → Laravel /api/internal/*
  └── WebSocket     → client (game events)
```

### Multi-tenancy

- Setiap user bisa punya banyak **Workspace**
- Semua resource workspace-scoped wajib filter by `workspace_id`
- Middleware `workspace` (`EnsureWorkspaceAccess`) wajib di semua route workspace

---

## 5. Fitur yang Sudah Ada

### Admin Panel (`/admin/*`)

| Fitur | Route | Controller |
|---|---|---|
| Dashboard | `GET /admin/dashboard` | `Admin\DashboardController` |
| User Management | `CRUD /admin/users` | `Admin\UserController` |
| Toggle User Status | `PATCH /admin/users/{id}/toggle-status` | `Admin\UserController` |
| Role Management | `CRUD /admin/roles` | `Admin\RoleController` |
| Permission List | `GET /admin/permissions` | `Admin\PermissionController` |
| Activity Log | `GET /admin/activity-log` | `Admin\ActivityLogController` |
| Settings — General | `GET /admin/settings` + `PUT /admin/settings/general` | `Admin\SettingsController` |
| Settings — Mail | `PUT /admin/settings/mail` | `Admin\SettingsController` |
| Settings — Security | `PUT /admin/settings/security` | `Admin\SettingsController` |
| Settings — Profile | `PUT /admin/settings/profile` | `Admin\SettingsController` |
| Settings — Password | `PUT /admin/settings/password` | `Admin\SettingsController` |

### Auth System

- Login/Register via Fortify (routes otomatis) + custom UI di `pages/auth/`
- Social Login via Socialite
- Magic Link login tanpa password
- Two-Factor Authentication (TOTP via Fortify)
- Password Reset via email

### Platform Features

| Fitur | Model/Controller | Keterangan |
|---|---|---|
| Workspace | `Workspace`, `WorkspaceController` | Multi-tenant, invite member, manage roles |
| Billing | `BillingController` + Cashier | Stripe subscription, seat-based |
| Feature Flags | `FeatureFlag`, Pennant | Per-workspace rollout |
| Webhooks | `WebhookEndpoint`, `WebhookLog` | Outgoing via spatie |
| Notifications | `Notification*` | In-app + email, delivery log |
| Activity Log | Spatie Activitylog | Semua perubahan ditrack otomatis |
| Announcements | `WorkspaceAnnouncement` | Workspace-level announcements |
| Status Page | `StatusIncident` | Incident tracking |
| Support Tickets | `Ticket`, `TicketReply` | Ticket + reply system |
| Feedback | `Feedback` | User feedback collection |
| Changelog | `ChangelogEntry` | Changelog entries |
| GDPR Data Export | `UserDataExportController` | Export personal data + account deletion |
| API Keys | `WorkspaceApiKey` | Per-workspace API key management |
| Search | Scout | Full-text search |

### App Settings (`Setting` model)

- Tabel: `settings(id, group, key, value, created_at, updated_at)`
- Grouped: `general`, `mail`, `security`
- Cached dengan `Cache::rememberForever`

```php
Setting::get('app_name', 'EduFunHub');        // read + cache
Setting::set('app_name', 'New', 'general');   // write + bust cache
Setting::group('mail');                        // semua key dalam group
```

### Games (Frontend Only, Go Backend Planned)

- Sky Quiz — `pages/games/sky-quiz.tsx`
- Snakes & Ladders — `pages/games/snakes-and-ladders.tsx`
- Game List — `pages/games/index.tsx`

---

## 6. Sistem Keamanan

> **KRITIS** — Jangan modifikasi middleware ini tanpa memahami konsekuensinya.

### Middleware Keamanan

| Alias | Class | Fungsi |
|---|---|---|
| `admin` | `EnsureAdmin` | Pass jika `is_superadmin = true` ATAU role `admin` |
| `superadmin` | `EnsureSuperadmin` | Hanya `is_superadmin = true` |
| `workspace` | `EnsureWorkspaceAccess` | User harus member workspace yang diakses |
| `workspace.owner` | `EnsureWorkspaceOwner` | Hanya workspace owner |
| `workspace.admin` | `EnsureWorkspaceAdmin` | Owner atau admin workspace |
| `workspace.suspended` | `EnsureWorkspaceNotSuspended` | Blokir kalau workspace di-suspend |
| `workspace.ip` | `EnforceWorkspaceIpAllowlist` | Whitelist IP per workspace |
| `onboarded` | `EnsureUserIsOnboarded` | Redirect ke onboarding kalau belum selesai |
| `require2fa` | `RequireTwoFactor` | Enforce 2FA sebelum lanjut |
| `api-key` | `AuthenticateApiKey` | Validasi API key dari header |

### Admin Route Protection

Semua `/admin/*` route diproteksi oleh:

```php
Route::middleware(['web', 'auth', 'verified', EnsureAdmin::class])
    ->prefix('admin')
    ->name('admin.')
    ->group(...)
```

**Jangan hapus `verified`** — user tanpa verifikasi email tidak boleh akses admin.

### CSRF

- Semua web routes: CSRF aktif otomatis via Laravel
- Exception hanya `stripe/*` (Stripe webhook) — sudah dikonfigurasi di `bootstrap/app.php`
- **Jangan tambah exception CSRF tanpa alasan kuat**

### Password Security

- Hash: bcrypt (Laravel default)
- History: tabel `password_histories` — cegah reuse password lama
- Expiry: env `AUTH_PASSWORD_EXPIRY_DAYS`
- Policy: configurable via Settings > Security (min length, uppercase, numbers, symbols)
- Middleware `EnsurePasswordNotExpired` jalan di semua web request

### Session Security

- Enkripsi cookie aktif (kecuali `appearance` dan `sidebar_state` — non-sensitive)
- Session lifetime: configurable via Settings > Security
- Login activity ditrack di tabel `login_activities`
- Session management (list & revoke) tersedia di user settings

### Role & Permission System

- **Role** → many-to-many **Permission** via `role_permission`
- **User** → many-to-many **Role** via `role_user`
- Helper di User model: `hasRole(string)`, `hasPermission(string)`
- Superadmin (`is_superadmin = true`) **bypass semua** role/permission check

### Audit Trail

- Semua CRUD admin di-log ke `activity_log` (Spatie)
- Pattern wajib di controller:

```php
activity()
    ->causedBy($request->user())
    ->performedOn($model)
    ->withProperties(['data' => $data])
    ->log('Action description');
```

- Impersonation di-log ke `impersonation_logs`

### Error Handling

- Sentry terintegrasi (backend + frontend via `@sentry/react`)
- Inertia error pages (403, 404, 429, 500, 503) di-render via `pages/error.tsx`
- Request ID header (`X-Request-Id`) propagated di semua response untuk tracing

### Octane Safety

Reverb + Octane sudah diinstall. Untuk Octane, perhatikan:

- **Jangan inject `Request`, `Auth`, atau `Config` ke singleton constructor** — pakai resolver closure
- **Jangan append ke static properties** — akumulasi antar request
- Gunakan `$this->app->scoped()` sebagai alternatif aman `singleton()`

---

## 7. Database & Model

### Tabel Kritis (jangan drop/rename)

| Tabel | Model | Keterangan |
|---|---|---|
| `users` | `User` | Core, column `is_superadmin` wajib ada |
| `roles` | `Role` | RBAC roles |
| `permissions` | `Permission` | Atomic permissions |
| `role_permission` | pivot | Role ↔ Permission |
| `role_user` | pivot | User ↔ Role |
| `workspaces` | `Workspace` | Multi-tenant root |
| `workspace_user` | pivot | User ↔ Workspace + `role` column |
| `workspace_invitations` | `WorkspaceInvitation` | Pending invites |
| `settings` | `Setting` | App-level key-value config |
| `activity_log` | (Spatie) | Audit trail |
| `login_activities` | `LoginActivity` | Session/login tracking |
| `password_histories` | `PasswordHistory` | Reuse prevention |

### Migration Convention

- File di `database/migrations/` dengan timestamp prefix
- Kalau modify kolom yang sudah ada: **sertakan semua attributes lama**, jangan cuma yang berubah — Laravel wajib state lengkap saat `change()`

---

## 8. Routing Convention

### File Routes

| File | Prefix | Guard | Isi |
|---|---|---|---|
| `routes/web.php` | `/` | guest/auth | Landing, games, auth redirect |
| `routes/admin.php` | `/admin` | auth + EnsureAdmin | Semua admin routes |
| `routes/settings.php` | `/settings` | auth | User-facing settings |
| `routes/api.php` | `/api` | Sanctum | API v1 |
| `routes/ai.php` | `/ai` | — | MCP server |
| `routes/channels.php` | — | — | Broadcasting channels |

`routes/admin.php` diload via `bootstrap/app.php` melalui callback `then`:

```php
->withRouting(
    ...
    then: function (): void {
        require __DIR__.'/../routes/admin.php';
    },
)
```

### Named Route Convention

```
admin.dashboard          → GET  /admin/dashboard
admin.users.index        → GET  /admin/users
admin.users.store        → POST /admin/users
admin.roles.create       → GET  /admin/roles/create
admin.settings.index     → GET  /admin/settings
admin.settings.general   → PUT  /admin/settings/general
```

Selalu gunakan `route('admin.xxx')` di controller dan TSX, **bukan hardcode URL**.

---

## 9. Frontend Architecture

### Layout Wajib

Semua halaman admin **WAJIB** menggunakan:

```tsx
import AdminLayout from '@/layouts/admin-layout';

export default function MyPage() {
  return (
    <AdminLayout title="Page Title">
      {/* content */}
    </AdminLayout>
  );
}
```

Jangan buat layout baru untuk halaman admin — extend `admin-layout.tsx` saja.

### Komponen UI

- Primitives: `resources/js/components/ui/` — shadcn/ui based
- **Jangan edit file di `ui/`** — bisa di-overwrite oleh shadcn CLI
- Buat wrapper/extension di `resources/js/components/` level atas

### Inertia Form Pattern

```tsx
// useForm
const { data, setData, post, put, processing, errors } = useForm({ field: '' });

// <Form> component Inertia v2
<Form action="/path" method="post">
  {({ errors, processing, wasSuccessful }) => (/* ... */)}
</Form>
```

Jangan pakai `axios` langsung untuk submit Inertia form — pakai `useForm` atau `<Form>`.

### TypeScript

- Semua prop Inertia page harus di-type eksplisit
- `SharedData` interface ada di `resources/js/types/index.d.ts`
- Kalau tambah shared prop di `HandleInertiaRequests.php`, update `index.d.ts` juga

### Tailwind v4

- Konfigurasi CSS-first via `@theme` di `resources/css/app.css`
- **Tidak ada `tailwind.config.js`** — konfigurasi via CSS
- Utility yang deprecated: gunakan `bg-black/50` bukan `bg-opacity-50`, `shrink-*` bukan `flex-shrink-*`

### Build Commands

```bash
pnpm run dev       # development server
pnpm run build     # production build (wajib sebelum deploy)
pnpm run types     # TypeScript check
pnpm run lint      # ESLint
pnpm run format    # Prettier
```

> Wayfinder plugin dinonaktifkan secara kondisional di `vite.config.ts` saat PHP tidak ada — jangan rely pada generated files di `resources/js/actions/` dan `resources/js/routes/`.

---

## 10. Deployment

### Stack Container

App berjalan di Docker. Container name: `edufunhub-app`.

```bash
# Build frontend
pnpm run build

# Copy build assets ke container
docker cp /root/dev/edufunhub/public/build edufunhub-app:/app/public/

# Copy file PHP baru ke container
docker cp /root/dev/edufunhub/app/Http/Controllers/Admin/MyController.php \
  edufunhub-app:/app/app/Http/Controllers/Admin/

# Copy seluruh app folder (kalau banyak perubahan)
docker cp /root/dev/edufunhub/app edufunhub-app:/app/
docker cp /root/dev/edufunhub/routes edufunhub-app:/app/

# Run migration
docker exec edufunhub-app php artisan migrate --force

# Clear all cache
docker exec edufunhub-app php artisan optimize:clear

# Check logs
docker logs edufunhub-app --tail=50

# Tinker (debug/query Eloquent)
docker exec -it edufunhub-app php artisan tinker
```

### Environment

| Server | IP | Port SSH | Peran |
|---|---|---|---|
| Dev MFR | 172.16.200.27 | 10022 | Development |
| Prod | 172.16.200.23 | 10022 | Production |

**Jangan deploy ke prod sebelum diminta user.**

### Git

- Branch aktif: `dev`
- Commit convention: `feat:`, `fix:`, `refactor:`, `chore:`
- Jangan push ke `main` tanpa approval

---

## 11. Aturan Wajib untuk Agent / Developer Berikutnya

### ✅ WAJIB

1. **Baca file yang relevan sebelum edit** — jangan asumsi struktur dari nama file saja
2. **Semua route admin wajib di `routes/admin.php`** dengan middleware `['web', 'auth', 'verified', EnsureAdmin::class]`
3. **Semua halaman admin wajib wrap `<AdminLayout>`**
4. **Validation wajib pakai Form Request** (`app/Http/Requests/`) — jangan inline validate di controller
5. **Setiap CRUD admin wajib log activity** via `activity()->causedBy($user)->log(...)`
6. **Setting app-level wajib pakai model `Setting`** — jangan `config()` mutable atau langsung env
7. **Jalankan `pnpm run build` + copy ke container** setelah edit frontend
8. **Jalankan `migrate --force`** setelah tambah migration baru
9. **Update `resources/js/types/index.d.ts`** kalau tambah shared Inertia prop
10. **Tambah menu ke `admin-layout.tsx`** kalau tambah halaman admin baru

### ❌ DILARANG

1. **Jangan drop/rename tabel kritis** (lihat §7) — breaking change permanen
2. **Jangan modifikasi middleware stack di `bootstrap/app.php`** tanpa alasan kuat
3. **Jangan hapus `EnsureAdmin`** dari grup admin routes
4. **Jangan pakai `request()->all()`** tanpa explicit whitelist — mass assignment risk
5. **Jangan hardcode credential/secret** di source code
6. **Jangan edit file di `resources/js/components/ui/`** secara langsung
7. **Jangan buat controller tanpa Form Request** untuk input yang bisa dimanipulasi user
8. **Jangan return JSON di web routes** — pakai Inertia `render()` (kecuali di `routes/api.php`)
9. **Jangan deploy ke prod tanpa instruksi user**
10. **Jangan taruh game logic di Laravel** — keep separation of concerns

### ⚠️ PERHATIAN

| Situasi | Yang Harus Dilakukan |
|---|---|
| PHP tidak ada di dev server | Semua `php artisan` via `docker exec edufunhub-app` |
| Set superadmin | Set `is_superadmin = true` langsung di DB/tinker, bukan via form user |
| Cashier / Billing | Belum dikonfigurasi untuk EduFunHub — jangan aktifkan tanpa Stripe keys |
| Reverb WebSocket | Semua channel di `routes/channels.php` harus ada auth check |
| Octane singleton | Jangan inject `Request`/`Auth` ke constructor singleton |
| Wayfinder | Dinonaktifkan saat PHP tidak ada — jangan rely pada generated files |
| Migration modify column | Sertakan **semua attributes** kolom lama saat `change()` |

---

*Dokumen ini mencerminkan state branch `dev`. Update setiap kali ada perubahan arsitektur signifikan.*
