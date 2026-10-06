# Onboarding a New Customer (Deploy Kit)

Each deployment serves **one customer** (one database + one `customer/` folder).
To deploy for a new company:

## 1. Fill in the customer folder

All customer-specific data lives in `customer/` (committed to the repo):

| File | Purpose |
|---|---|
| `customer/brand.ts` | Company name, short name, app title, tagline, city, address, support email, timezone, locale, phone country + examples, brand colors, shift-type presets, default location names |
| `customer/seed.ts` | Team members to seed on first boot: name, role, phone, title, **initialPassword**. Only used when `users` is empty. |
| `customer/logo.svg` | In-app logo mark (SVG, `viewBox` required; wordmark optional) |
| `customer/app-icon.svg` | PWA / favicon artwork (square tile) |

Validation runs at boot and at asset-generation time — invalid config fails loudly
with the field name.

## 2. Set environment

Same as any deploy: database (`SUPABASE_HOST/...` or legacy `SQL_HOST/...`),
`SUPABASE_S3_*` (timesheet photos), `VAPID_*` (web push), `PORT`, `NODE_ENV=production`.

## 3. Create schema + build + boot

```bash
bunx drizzle-kit push --config src/db/drizzle.config.ts  # creates company_settings + all tables
npm run build    # runs brand-assets generation, then vite + server bundle
npm start        # first boot seeds company_settings + team from customer/
```

First boot inserts one `company_settings` row and the `customer/seed.ts` team.

## 4. Post-deploy

- Log in as the seeded manager and **change every seeded password**.
- Optional: tweak display branding later with SQL — the DB row wins at runtime:
  ```sql
  UPDATE company_settings SET company_name = '...', tagline = '...' WHERE id = 'default';
  ```
- To re-seed branding from `customer/brand.ts` after edits:
  ```sql
  DELETE FROM company_settings WHERE id = 'default';
  ```
  then restart (the row is re-created from the config). Note: static PWA assets
  (manifest, icons, page title) are generated **at build time** from `customer/`,
  so those need `npm run build`, not a DB reset.
- Server-side fields (timezone, phone country) are applied from the DB row on
  boot / on each `/api/settings` request — restart after changing them.

## Notes

- Demo data: `customer/seed.ts` → `demoData: true` enables
  `POST /api/timesheets/seed-mock` (manager-only) with generic demo shifts.
  Keep `false` for real customers.
- `public/manifest.webmanifest`, `public/app-icon.*`, `public/sw.js` are
  **generated** from `customer/` — never edit them by hand.
- `customer/seed.ts` contains initial passwords: server-only import, never
  import it from frontend code.
