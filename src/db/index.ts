import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

type PoolConfigSource = 'supabase' | 'legacy';

function resolvePoolConfig(): { source: PoolConfigSource; config: ConstructorParameters<typeof Pool>[0] } {
  const supabaseHost = process.env.SUPABASE_HOST?.trim();

  if (supabaseHost) {
    const port = Number(process.env.SUPABASE_PORT) || 5432;
    return {
      source: 'supabase',
      config: {
        host: supabaseHost,
        port,
        user: process.env.SUPABASE_USER,
        password: process.env.SUPABASE_DB_PASSWORD,
        database: process.env.SUPABASE_DATABASE || 'postgres',
        max: 10,
        connectionTimeoutMillis: 15000,
        // Supabase Postgres requires SSL (direct 5432 and pooler 6543 alike).
        ssl: { rejectUnauthorized: false },
      },
    };
  }

  // Legacy Google Cloud SQL path (AI Studio / pre-migration deploys).
  return {
    source: 'legacy',
    config: {
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    },
  };
}

export const createPool = () => {
  if (!global._postgresPool) {
    const { config } = resolvePoolConfig();

    if (!config.host || !config.user || !config.password || !config.database) {
      throw new Error(
        'No database configuration found. Set SUPABASE_HOST/SUPABASE_PORT/SUPABASE_DATABASE/SUPABASE_USER/SUPABASE_DB_PASSWORD ' +
          'or legacy SQL_HOST/SQL_USER/SQL_PASSWORD/SQL_DB_NAME.',
      );
    }

    global._postgresPool = new Pool(config);

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
