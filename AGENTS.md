# AGENTS.md

Mobile-first workforce roster/timesheet PWA for The Cleaning Guys NZ. Express + Vite/React 19 single process; Drizzle + Postgres; PWA with web-push.

## Commands

- `npm run dev` — `tsx server.ts`: ONE server for everything (Express `/api/*` + Vite middleware). Do not start a separate Vite dev server.
- `npm run build` — `vite build` then esbuild-bundles `server.ts` → `dist/server.cjs` (CJS, externals kept).
- `npm start` — `node dist/server.cjs`. Requires `NODE_ENV=production`; otherwise it boots Vite middleware instead of serving `dist/` statics (`server.ts:53`).
- `npm run lint` — the ONLY check: `tsc --noEmit`. No tests, ESLint, formatter, or CI exist. Verify changes with typecheck + manual `/api/health` or route hits.
- Install with Bun (`bun.lock` committed; no package-lock.json).
- Schema changes: edit `src/db/schema.ts`, then `bunx drizzle-kit push --config src/db/drizzle.config.ts`. No migrations directory and no npm script wraps this.

## Architecture

- Entry `server.ts`: mounts routers under `/api/auth|staff|availability|rosters|personal-roster|notifications|audit|timesheets`; `/api/health` is registered before auth. `bootstrapInitialData()` seeds the real team on first boot when `users` is empty (real phone numbers — do not "fix" or re-seed casually).
- `src/` = React SPA (`App.tsx` switches views by role + CRM module); `server/routes` + `server/services` = API/domain logic.
- Real DB layer is `src/db/` (Drizzle + `pg` Pool). `server/db/index.ts` is only a re-export shim — edit schema/config in `src/db/`.
- Schema (`src/db/schema.ts`): all datetimes are TEXT ISO strings, not SQL timestamps. IDs are text (crypto UUIDs).
- Imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`). Alias `@/*` → repo root.
- Auth: session token accepted as cookie `roster_session_token`, `Authorization: Bearer` / `x-auth-token`, or `?token=`. Bumping `users.password_version` invalidates all sessions. Manager routers use `requireRole('manager')` (`server/middleware/auth.ts`).
- Timesheet photos are stored as `s3://` references in Supabase S3 and served through authenticated `/api/timesheets/photo/...` and `/api/timesheets/event-photo/...` routes; the backend streams from the private bucket.

## Gotchas

- Business timezone is `Pacific/Auckland`; weeks start Monday. `getDefaultActiveWeek()` returns NEXT week's Monday on Sundays from 15:00 NZ (`server/services/timezone.ts`) — intentional.
- `DISABLE_HMR=true` in `vite.config.ts` disables HMR and file watching to prevent flicker during agent edits. Do not remove or "fix" this.
- Env: runtime pool needs `SQL_HOST`/`SQL_USER`/`SQL_PASSWORD`/`SQL_DB_NAME`; drizzle-kit needs `SQL_ADMIN_USER`/`SQL_ADMIN_PASSWORD`. None are in `.env.example`. `dotenv` is only loaded by `drizzle.config.ts` — `server.ts` does not load `.env`; export vars in the shell for local runs. Optional: `VAPID_*` (web push). Required: `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`, and `SUPABASE_S3_BUCKET` (timesheet photos) — validated at boot; optional `SUPABASE_S3_FORCE_PATH_STYLE` defaults to path-style S3 addressing.
- `server/services/storage.ts` uses Supabase S3-compatible object storage and throws if its configuration is missing or invalid. `server/services/image.ts` resizes supported uploads to a 1,600 px maximum edge, normalizes them to WebP quality 72, strips metadata, and rejects unsupported formats with HTTP 400. Never copy or commit credentials.
- PWA bits live in `public/` (`sw.js`, `manifest.webmanifest`); service worker is registered in `src/main.tsx`.
