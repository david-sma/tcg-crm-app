import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseHost = process.env.SUPABASE_HOST?.trim();

const sqlHost = supabaseHost || process.env.SQL_HOST;
const sqlDbName = supabaseHost ? process.env.SUPABASE_DATABASE || 'postgres' : process.env.SQL_DB_NAME;
const user = supabaseHost ? process.env.SUPABASE_USER : process.env.SQL_ADMIN_USER;
const password = supabaseHost ? process.env.SUPABASE_DB_PASSWORD : process.env.SQL_ADMIN_PASSWORD;
const port = supabaseHost ? Number(process.env.SUPABASE_PORT) || 5432 : 5432;
const useSsl = Boolean(supabaseHost);

if (!sqlHost) {
  throw new Error("SQL_HOST (legacy) or SUPABASE_HOST must be set in environment variables.");
}
if (!sqlDbName) {
  throw new Error("SQL_DB_NAME (legacy) or SUPABASE_DATABASE must be set in environment variables.");
}
if (!user) {
  throw new Error("SQL_ADMIN_USER (legacy) or SUPABASE_USER must be set in environment variables.");
}
if (!password) {
  throw new Error("SQL_ADMIN_PASSWORD (legacy) or SUPABASE_DB_PASSWORD must be set in environment variables.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    host: sqlHost,
    port,
    user: user,
    password: password,
    database: sqlDbName,
    ssl: useSsl,
  },
  verbose: true,
});
