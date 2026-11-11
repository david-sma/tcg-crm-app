# AGENTS.md

Mobile-first workforce roster/timesheet PWA. Express + Vite/React 19 single process; Drizzle + Postgres; PWA with web-push. One deployment = one customer (see `docs/NEW_CUSTOMER.md`).

## Commands

- `npm run dev` — `tsx server.ts`: ONE server for everything (Express `/api/*` + Vite middleware). Do not start a separate Vite dev server. `predev` regenerates brand assets from `customer/` first.
- `npm run build` — regenerates brand assets, then `vite build`, then esbuild-bundles `server.ts` → `dist/server.cjs` (CJS, externals kept). Always build through this script — a bare `vite build` skips brand-asset generation.
- `npm run brand-assets` — regenerate `public/manifest.webmanifest`, `public/app-icon.*`, `public/sw.js` from `customer/` without building.
- `npm start` — `node dist/server.cjs`. Requires `NODE_ENV=production`; without it the server boots Vite middleware instead of serving `dist/` statics.
- `npm run lint` — the ONLY check: `tsc --noEmit`. No tests, ESLint, formatter, or CI exist. Verify changes with typecheck + manual `/api/health` or route hits.
- Install with Bun (`bun.lock` committed; no package-lock.json).
- Schema changes: edit `src/db/schema.ts`, then `bunx drizzle-kit generate --config src/db/drizzle.config.ts` (or `generate --custom --name=…` for hand-written SQL), and commit the new `drizzle/*.sql` file. Migrations apply automatically at boot (`runMigrations()` in `bootstrapInitialData`, including auto-baselining databases originally created with `drizzle-kit push`). Data backfills go in a `--custom` migration as idempotent SQL.

## Environments (dev vs prod) — read before touching the DB

- Two Supabase projects (DB + S3) and two Railway deployments exist: **dev** and **prod**. There is no local Postgres; Docker is not part of this stack.
- Local env files (both gitignored): `.env` → **PROD** Supabase/S3 (deploy parity), `.env.dev` → dev. The server loads NO env file itself — run it as `node --env-file=.env.dev node_modules\tsx\dist\cli.mjs server.ts` (or export vars in the shell).
- **Before any command that touches the database, confirm which env file it uses.** Booting `server.ts` applies pending migrations and writes data (seeding, media queue) to whatever DB its env points at — a casual local boot against `.env` mutates prod. Run test writes and feature verification against `.env.dev` only.
- Resetting a password logs the user out of all devices and the temp password is shown exactly once (then unrecoverable) — treat `POST /api/staff/:id/reset-password` as a real-world action even on seeded accounts.
- Safe verification loop: boot with `--env-file=.env.dev`, exercise APIs with a session row inserted directly into `sessions` (auth accepts `?token=<id>`), check UI at `localhost:3000`, then delete your test rows.

## Running on Windows (this repo was started on Linux)

- A copied/older `node_modules` from Linux lacks Windows natives and shims. Symptoms and fixes:
  - rollup "Cannot find module @rollup/rollup-win32-arm64-msvc", esbuild "Host version does not match binary version", lightningcss "Cannot find module '../lightningcss.win32-arm64-msvc.node'", or sharp load errors → `bun install` on Windows (preferred; also creates the `.bin` shims and per-platform `ffmpeg-static`), or manually add `@esbuild/win32-arm64`, `@rollup/rollup-win32-arm64-msvc`, `lightningcss-win32-arm64-msvc`, `@img/sharp-win32-arm64` + `@img/sharp-libvips-win32-arm64` at versions matching the installed packages.
  - `npm run lint`/`dev` fail with "'tsc' is not recognized" (bun's `.bin` entries have no `.cmd` shims) → run tools directly: `node node_modules\typescript\bin\tsc --noEmit`, `node node_modules\drizzle-kit\bin.cjs generate --config src/db/drizzle.config.ts`, `node node_modules\tsx\dist\cli.mjs server.ts`.
  - PowerShell execution policy blocks `npx.ps1`/`npm.ps1` → call `*.cmd` shims or `node <pkg>\bin.cjs` directly (or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).

## Architecture

- Entry `server.ts`: mounts routers under `/api/auth|staff|availability|rosters|personal-roster|notifications|audit|timesheets|jobs|job-series|customers|settings`; `/api/health` and `/api/settings` are registered before auth. `bootstrapInitialData()` seeds `company_settings` + team from `customer/` on first boot (team only when `users` is empty).
- Customer config: `customer/brand.ts` + `customer/seed.ts` (zod-validated via `src/config/customerSchema.ts`), logo artwork in `customer/logo.svg` + `customer/app-icon.svg`. Frontend reads settings via `BrandContext` (`useBrand()`); server logic via `getAppSettings()` (`src/config/appSettings.ts`). Brand colors are Tailwind v4 `@theme` tokens (`--color-brand*` in `src/index.css`), overridden at runtime from settings.
- Settings precedence: `customer/` is the source of truth, but the `company_settings` DB row (single row `id='default'`, served publicly by `GET /api/settings`) wins at runtime — editing `customer/brand.ts` does NOT change an already-seeded deployment (re-seed: `DELETE FROM company_settings WHERE id='default'` + restart). Static PWA pieces (page title, manifest, icons) are generated at build time and need `npm run build`, not a DB reset.
- `src/` = React SPA (`App.tsx` switches views by role + module); `server/routes` + `server/services` = API/domain logic.
- Real DB layer is `src/db/` (Drizzle + `pg` Pool). `server/db/index.ts` and `server/db/schema.ts` are only re-export shims — edit schema/config in `src/db/`.
- Schema (`src/db/schema.ts`): all datetimes are TEXT ISO strings, not SQL timestamps. IDs are text (crypto UUIDs).
- Imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`). Alias `@/*` → repo root.
- Auth: session token accepted as cookie `roster_session_token`, `Authorization: Bearer` / `x-auth-token`, or `?token=`. Bumping `users.password_version` invalidates all sessions. Manager routers use `requireRole('manager')` (`server/middleware/auth.ts`).
- Timesheet photos are stored as `s3://` references in Supabase S3 and served through authenticated `/api/timesheets/photo/...` and `/api/timesheets/event-photo/...` routes; the backend streams from the private bucket.

## Push notifications

- Env vars (both Railway services have them): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` — the subject must be a real `mailto:` or `https:` contact, not a placeholder. Missing keys/subject warn once at boot and push is disabled (in-app notifications keep working).
- Supported targets only: Chrome on Android (app installed via Chrome) and iPhone Home Screen app (iOS 16.4+). Other browsers get an install hint instead of a permission prompt.
- Which notification types also push is the allow-list `PUSH_ENABLED_TYPES` in `server/services/notification.ts` (currently `ROSTER_PUBLISHED`/`ROSTER_REVISED`/`JOB_NEEDS_PRICING` — other job/timesheet/availability types are in-app only). All pushes go through `pushForType()`; the low-level sender is `sendPushNotificationToUser()` (also used by manager-only `POST /api/notifications/test`).
- The service worker is generated: `public/sw.js` comes from `scripts/generate-brand-assets.ts` (`npm run brand-assets`). Never edit `sw.js` by hand; change the generator (cache name is `${slug}-portal-v2`).
- Client push state (`src/context/NotificationContext.tsx`) is derived from a real `PushManager` subscription and self-heals on every signed-in load: stale/lost subscriptions are re-created and re-registered (which also re-binds a shared phone to the last user to log in). `src/components/common/PushNotificationPrompt.tsx` is the single enable prompt for all roles.
- If a phone stops getting alerts: open the installed app once (this re-syncs the subscription). If still broken, uninstall and reinstall from Chrome (Android) / re-add via Home Screen (iPhone).

- Customers (`customers` table, `/api/customers`, `src/components/customers/`): the single source of truth for customer contact details. `jobs`/`job_series` keep `customer_name/phone/email` as a mirror (synced by `syncCustomerMirrors()` on customer edit) and link via `customer_id`; job and series edits never change contact details. Visible to office roles; create/edit/archive is manager + customer service; customers are archived, never deleted.
- Pricing is `price_cents` (integer, NZD cents) + optional `agreed_price` text used as the pricing note (API: `price_amount` in, `price_cents`/`price_note` out). Manager-only everywhere, including customer profile totals.
- Roles for jobs (`src/config/roles.ts`): `INTAKE_ROLES` (manager, customer service) create jobs, customers and recurring series; `PROCESSING_ROLES` (manager, service team) schedule, allocate and cancel; the service team never creates jobs.
- Job `frequency` (+ `frequency_note` for Custom) is a reporting TAG only — required on new jobs, One-off by default, and never linked to recurring series config. `job_series.frequency` is the recurrence pattern; the series' copy of the tag is `job_series.job_frequency`.
- Mobile layout: the iPhone Home Screen app draws under the notch (`viewport-fit=cover`), so the header, bottom bar and full-screen overlays use the safe-area classes in `src/index.css` (`safe-top`, `safe-bottom-nav`, `safe-main`, `safe-overlay`). New full-screen overlays should use `fixed inset-0 safe-overlay`. Bottom bars with more than 5 tabs collapse into 4 + "More" (`MobileBottomNav`).
- Entity profiles share `src/components/common/profile/ProfileLayout.tsx` (header, stat tiles, sections) so Staff and Fleet profiles match Customers.

## Gotchas

- Business timezone comes from customer settings (default `Pacific/Auckland`); weeks start Monday. `getDefaultActiveWeek()` returns NEXT week's Monday on Sundays from 15:00 local (`server/services/timezone.ts`) — intentional.
- `DISABLE_HMR=true` in `vite.config.ts` disables HMR and file watching to prevent flicker during agent edits. Do not remove or "fix" this. A `brandHtmlPlugin` in `vite.config.ts` injects customer title/meta/theme into `index.html` (tokens like `%BRAND_TITLE%`).
- `public/manifest.webmanifest`, `public/app-icon.*`, `public/sw.js` are GENERATED from `customer/` (gitignored) — never edit by hand.
- Never import `customer/seed.ts` from frontend code. It holds placeholder names/phones only; initial passwords come from `SEED_MANAGER_PASSWORD` / `SEED_STAFF_PASSWORD` or are generated at first boot — never commit real ones. `demoData: true` there enables `POST /api/timesheets/seed-mock` (manager-only demo shifts); keep it `false` for real customers.
- Env: `server.ts` does NOT load `.env` (`dotenv` runs only in `drizzle.config.ts`) — export vars in the shell for local runs; see `.env.example`. DB: `SUPABASE_HOST`/`SUPABASE_PORT`/`SUPABASE_DATABASE`/`SUPABASE_USER`/`SUPABASE_DB_PASSWORD` (legacy fallback `SQL_HOST`/`SQL_USER`/`SQL_PASSWORD`/`SQL_DB_NAME`; drizzle-kit uses `SQL_ADMIN_USER`/`SQL_ADMIN_PASSWORD` on the legacy path). Required: `SUPABASE_S3_*` (timesheet photos) — validated at boot, the server exits if missing; `SUPABASE_S3_FORCE_PATH_STYLE` optional, defaults to path-style. Optional: `VAPID_*` (web push), `PORT` (defaults 3000).
- `server/services/storage.ts` uses Supabase S3-compatible object storage and throws if its configuration is missing or invalid. `server/services/image.ts` resizes supported uploads to a 1,600 px maximum edge, normalizes them to WebP quality 72, strips metadata, and rejects unsupported formats with HTTP 400. Never copy or commit credentials.
- PWA bits live in `public/` (`sw.js`, `manifest.webmanifest`); service worker is registered in `src/main.tsx`.
