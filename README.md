# Workforce Roster & Timesheet Portal

Mobile-first workforce roster/timesheet PWA: **Express + Vite/React 19** in a single
process, **Drizzle + Postgres**, PWA with web-push. **One deployment = one customer**
(see [docs/NEW_CUSTOMER.md](docs/NEW_CUSTOMER.md)).

## App configuration

All customer-specific data lives in the **`customer/` folder** (committed to the repo).
To deploy for a new company you replace this folder's contents, rebuild, and boot —
see [docs/NEW_CUSTOMER.md](docs/NEW_CUSTOMER.md) for the full checklist.

| File | Purpose |
|---|---|
| `customer/brand.ts` | Branding + locale: company name, short name, app title, tagline, city, address, support email, timezone, locale, phone country + examples, brand colors, shift-type presets, default location names |
| `customer/seed.ts` | Team to seed on first boot: name, role, phone, title, **initialPassword**. Only used when the `users` table is empty. **Server-only import — never import from frontend code (contains passwords).** |
| `customer/logo.svg` | In-app logo mark (SVG, needs a `viewBox`; wordmark optional) |
| `customer/app-icon.svg` | PWA / favicon artwork (square tile) |

Both files are zod-validated at boot and at asset-generation time
(`src/config/customerSchema.ts`) — an invalid config fails loudly with the field name.

### Settings precedence (DB vs config)

`customer/` is the **source of truth**, but the **database row wins at runtime**:

1. On first boot the server inserts one `company_settings` row (`id='default'`) from
   `customer/brand.ts` (+ `customer/logo.svg`), and the team from `customer/seed.ts`.
2. After that, `GET /api/settings` serves the DB row, and SQL edits take effect
   without redeploying (server-side fields like timezone/phone country refresh on
   boot or on each `/api/settings` hit):
   ```sql
   UPDATE company_settings SET company_name = '...' WHERE id = 'default';
   ```
3. To re-seed branding from the config files: `DELETE FROM company_settings WHERE id = 'default';` then restart.
4. Static PWA pieces (page title, manifest, icons) are generated **at build time**
   from `customer/` — those need `npm run build`, not a DB reset.

### Generated PWA assets

`public/manifest.webmanifest`, `public/app-icon.*`, `public/sw.js` are **generated**
from `customer/` by `npm run brand-assets` (also runs automatically as
`predev`/`prebuild`) — never edit them by hand. The build must go through the
`build` script (`npm run build` or `bun run build`), not a bare `vite build`,
or these files will be missing. `index.html` brand tokens (`%BRAND_TITLE%`, …)
are injected by the `brandHtmlPlugin` in `vite.config.ts`.

## Environment variables

No `.env` is loaded by the server (`dotenv` is only used by `drizzle.config.ts`);
export variables in the shell / hosting dashboard. See `.env.example` for the
full list.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_HOST` / `SUPABASE_PORT` / `SUPABASE_DATABASE` / `SUPABASE_USER` / `SUPABASE_DB_PASSWORD` (or legacy `SQL_HOST` / `SQL_USER` / `SQL_PASSWORD` / `SQL_DB_NAME`) | yes | Postgres connection (runtime pool). Drizzle-kit push uses `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` for the legacy path |
| `SUPABASE_S3_ENDPOINT` / `SUPABASE_S3_REGION` / `SUPABASE_S3_ACCESS_KEY_ID` / `SUPABASE_S3_SECRET_ACCESS_KEY` / `SUPABASE_S3_BUCKET` (+ optional `SUPABASE_S3_FORCE_PATH_STYLE`, default path-style) | yes | Timesheet photo storage (validated at boot — the server exits if missing) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | no | Web push (VAPID subject defaults to `mailto:<support email from settings>`) |
| `PORT` | no | Defaults to `3000`; hosting platforms inject it |
| `NODE_ENV=production` | yes (prod) | Serves `dist/` statics + secure session cookies; otherwise boots Vite middleware |

## Commands

- `npm run dev` — `tsx server.ts`: one server for Express `/api/*` + Vite middleware.
- `npm run build` — regenerates brand assets, then `vite build`, then esbuild-bundles `server.ts` → `dist/server.cjs`.
- `npm start` — `node dist/server.cjs`.
- `npm run lint` — the only check: `tsc --noEmit`.
- Install with Bun (`bun.lock` committed; no package-lock.json).
- Schema changes: edit `src/db/schema.ts`, then `bunx drizzle-kit generate --config src/db/drizzle.config.ts`, commit the new `drizzle/*.sql` file. Migrations apply automatically at server boot.

## Deploying (Railway + Supabase)

1. **Railway:** build command `npm run build`, start command `npm start`,
   `NODE_ENV=production`, plus the env vars above. A failed build keeps the old
   deployment live. On boot the server applies any pending `drizzle/` migrations
   to the database its env vars point at (dev or prod), then seeds
   `company_settings` on first boot. Look for migration + `Seeded company_settings`
   lines in the logs. Databases created before boot-time migrations existed are
   baselined automatically on first boot.
2. **Verify:** `GET /api/health` → ok · `GET /api/settings` → brand JSON ·
   login works · `/manifest.webmanifest`, `/app-icon.svg`, `/sw.js` return 200.

Rollback: redeploy the previous Railway build. New columns are additive so the
old code keeps working against the migrated database.
