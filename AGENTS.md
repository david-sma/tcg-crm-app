# AGENTS.md

Mobile-first workforce roster/timesheet PWA. Express + Vite/React 19 single process; Drizzle + Postgres; PWA with web-push. One deployment = one customer (see `docs/NEW_CUSTOMER.md`).

## Commands

- `npm run dev` — `tsx server.ts`: ONE server for everything (Express `/api/*` + Vite middleware). Do not start a separate Vite dev server. `predev` regenerates brand assets from `customer/` first.
- `npm run build` — regenerates brand assets, then `vite build`, then esbuild-bundles `server.ts` → `dist/server.cjs` (CJS, externals kept).
- `npm run brand-assets` — regenerate `public/manifest.webmanifest`, `public/app-icon.*`, `public/sw.js` from `customer/` without building.
- `npm start` — `node dist/server.cjs`. Requires `NODE_ENV=production`; otherwise it boots Vite middleware instead of serving `dist/` statics (`server.ts:61`).
- `npm run lint` — the ONLY check: `tsc --noEmit`. No tests, ESLint, formatter, or CI exist. Verify changes with typecheck + manual `/api/health` or route hits.
- Install with Bun (`bun.lock` committed; no package-lock.json).
- Schema changes: edit `src/db/schema.ts`, then `bunx drizzle-kit generate --config src/db/drizzle.config.ts` (or `generate --custom --name=…` for hand-written SQL), and commit the new `drizzle/*.sql` file. Migrations are applied automatically at boot (`runMigrations()` in `bootstrapInitialData`); `bunx drizzle-kit push` is for local Docker experiments only. Data backfills go in a `--custom` migration as idempotent SQL.

## Architecture

- Entry `server.ts`: mounts routers under `/api/auth|staff|availability|rosters|personal-roster|notifications|audit|timesheets|settings`; `/api/health` and `/api/settings` are registered before auth. `bootstrapInitialData()` seeds `company_settings` + team from `customer/` on first boot (team only when `users` is empty).
- Customer config: `customer/brand.ts` + `customer/seed.ts` (zod-validated via `src/config/customerSchema.ts`), logo artwork in `customer/logo.svg` + `customer/app-icon.svg`. Runtime settings live in the `company_settings` DB table (single row `id='default'`); `GET /api/settings` serves them publicly and refreshes server memory. Frontend reads them via `BrandContext` (`useBrand()`); server logic via `getAppSettings()` (`src/config/appSettings.ts`). Brand colors are Tailwind v4 `@theme` tokens (`--color-brand*` in `src/index.css`), overridden at runtime from settings.
- `src/` = React SPA (`App.tsx` switches views by role + CRM module); `server/routes` + `server/services` = API/domain logic.
- Real DB layer is `src/db/` (Drizzle + `pg` Pool). `server/db/index.ts` is only a re-export shim — edit schema/config in `src/db/`.
- Schema (`src/db/schema.ts`): all datetimes are TEXT ISO strings, not SQL timestamps. IDs are text (crypto UUIDs).
- Imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`). Alias `@/*` → repo root.
- Auth: session token accepted as cookie `roster_session_token`, `Authorization: Bearer` / `x-auth-token`, or `?token=`. Bumping `users.password_version` invalidates all sessions. Manager routers use `requireRole('manager')` (`server/middleware/auth.ts`).
- Timesheet photos are stored as `s3://` references in Supabase S3 and served through authenticated `/api/timesheets/photo/...` and `/api/timesheets/event-photo/...` routes; the backend streams from the private bucket.

## Gotchas

- Business timezone comes from customer settings (default `Pacific/Auckland`); weeks start Monday. `getDefaultActiveWeek()` returns NEXT week's Monday on Sundays from 15:00 local (`server/services/timezone.ts`) — intentional.
- `DISABLE_HMR=true` in `vite.config.ts` disables HMR and file watching to prevent flicker during agent edits. Do not remove or "fix" this. A `brandHtmlPlugin` in `vite.config.ts` injects customer title/meta/theme into `index.html` (tokens like `%BRAND_TITLE%`).
- `public/manifest.webmanifest`, `public/app-icon.*`, `public/sw.js` are GENERATED from `customer/` (gitignored) — never edit by hand.
- Never import `customer/seed.ts` from frontend code (contains initial passwords).
- Env: runtime pool needs `SQL_HOST`/`SQL_USER`/`SQL_PASSWORD`/`SQL_DB_NAME`; drizzle-kit needs `SQL_ADMIN_USER`/`SQL_ADMIN_PASSWORD`. None are in `.env.example`. `dotenv` is only loaded by `drizzle.config.ts` — `server.ts` does not load `.env`; export vars in the shell for local runs. Optional: `VAPID_*` (web push). Required: `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`, and `SUPABASE_S3_BUCKET` (timesheet photos) — validated at boot; optional `SUPABASE_S3_FORCE_PATH_STYLE` defaults to path-style S3 addressing.
- `server/services/storage.ts` uses Supabase S3-compatible object storage and throws if its configuration is missing or invalid. `server/services/image.ts` resizes supported uploads to a 1,600 px maximum edge, normalizes them to WebP quality 72, strips metadata, and rejects unsupported formats with HTTP 400. Never copy or commit credentials.
- PWA bits live in `public/` (`sw.js`, `manifest.webmanifest`); service worker is registered in `src/main.tsx`.
