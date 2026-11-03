import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
import { findMissingDatabaseTables, requiredDatabaseTables } from "./required-tables";

export async function applyDatabaseMigrations(migrationsFolder: string): Promise<void> {
  await migrate(db, { migrationsFolder });

  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [requiredDatabaseTables],
  );
  const missing = findMissingDatabaseTables(rows.map((row) => row.table_name));
  if (missing.length) {
    throw new Error(`Database migrations finished but required public tables are missing: ${missing.join(", ")}`);
  }
}
