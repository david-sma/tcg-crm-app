import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { sql, type SQL } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './index.ts';

/**
 * Boot-time schema/data migrations.
 *
 * Workflow: edit src/db/schema.ts -> `bunx drizzle-kit generate --config src/db/drizzle.config.ts`
 * (or `generate --custom` for hand-written SQL) -> commit the new drizzle/*.sql file.
 * The next deploy applies pending migrations to whichever database the env vars
 * point at. `drizzle-kit push` is only needed for local Docker experiments.
 *
 * Existing databases built with `drizzle-kit push` have no migration history;
 * on first boot after this change they are baselined (migrations 0000-0003 are
 * stamped as already applied) so only the new migrations run. Fresh databases
 * receive every migration in order.
 */

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

function resolveMigrationsFolder(): string {
  const candidates = [
    path.join(process.cwd(), 'drizzle'),
    path.join(process.cwd(), '..', 'drizzle'),
    path.join(process.cwd(), 'dist', '..', 'drizzle'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'meta', '_journal.json'))) {
      return candidate;
    }
  }
  throw new Error(
    `Migrations folder not found (looked in: ${candidates.join(', ')}). ` +
      'The drizzle/ directory must ship with the deployment.',
  );
}

function readJournal(migrationsFolder: string): JournalEntry[] {
  const raw = fs.readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8');
  return JSON.parse(raw).entries as JournalEntry[];
}

async function tableExists(qualifiedName: string): Promise<boolean> {
  const result = await db.execute(sql`select to_regclass(${qualifiedName}) as tbl`);
  return Boolean((result.rows[0] as { tbl: unknown } | undefined)?.tbl);
}

async function probe(existsSql: SQL): Promise<boolean> {
  const result = await db.execute(existsSql);
  return Boolean((result.rows[0] as Record<string, unknown> | undefined)?.ok);
}

/**
 * Per-migration "is this already in the database?" probes, used only for the
 * one-time baseline of databases that were built with `drizzle-kit push`
 * (they match the schema but have no drizzle.__drizzle_migrations history).
 * A migration is stamped as applied only when its probe passes; migrations
 * without a probe (e.g. data-only backfills, which must be idempotent) are
 * left for migrate() to run.
 */
const BASELINE_PROBES: Record<string, () => Promise<boolean>> = {
  '0000_smiling_gauntlet': () => tableExists('public.users'),
  '0001_add_company_settings': () => tableExists('public.company_settings'),
  '0002_fixed_hulk': () => tableExists('public.jobs'),
  '0003_spotty_magma': () =>
    probe(sql`select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'jobs' and column_name = 'running_late'`),
  '0004_orange_proemial_gods': () =>
    probe(sql`select 1 as ok from information_schema.columns where table_schema = 'public' and table_name = 'jobs' and column_name = 'ready_at'`),
};

/**
 * Databases created before boot-time migrations existed (via `drizzle-kit push`)
 * already match (part of) the schema but have no drizzle.__drizzle_migrations
 * rows. Stamp each already-present migration as applied so migrate() only runs
 * what is actually missing. Fresh databases receive every migration in order.
 */
async function baselineExistingDatabase(migrationsFolder: string): Promise<void> {
  const hasUsers = await tableExists('public.users');
  const hasMigrationTable = await tableExists('drizzle.__drizzle_migrations');
  if (!hasUsers || hasMigrationTable) {
    return;
  }

  const journal = readJournal(migrationsFolder);
  console.log('Baseline: existing database without migration history detected — checking migrations...');

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  let stamped = 0;
  for (const entry of journal) {
    const check = BASELINE_PROBES[entry.tag];
    if (!check || !(await check())) {
      // First migration not yet in the database (or unprobed data migration):
      // stop here and let migrate() apply it and everything after it.
      break;
    }
    const filePath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const content = fs.readFileSync(filePath, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    await db.execute(
      sql`insert into drizzle.__drizzle_migrations ("hash", "created_at") values (${hash}, ${entry.when})`,
    );
    stamped += 1;
  }
  console.log(`Baseline: stamped ${stamped} already-applied migration(s); the rest will be applied now.`);
}

export async function runMigrations(): Promise<void> {
  const migrationsFolder = resolveMigrationsFolder();
  await baselineExistingDatabase(migrationsFolder);
  await migrate(db, { migrationsFolder });
}
