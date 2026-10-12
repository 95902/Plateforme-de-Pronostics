import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS_DIR = join(__dirname, 'migrations');

// Arbitrary key for pg_advisory_lock: two instances starting at once never migrate concurrently
const MIGRATION_LOCK_KEY = 4_280_731;

/** Migration files (NNN_name.sql), in the order they must be applied */
export function listMigrations(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
}

/**
 * Apply every migration not yet recorded in `schema_migrations`, in order,
 * each in its own transaction. Returns the names of the migrations applied.
 */
export async function runMigrations(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const appliedResult = await client.query('SELECT name FROM schema_migrations');
    const alreadyApplied = new Set(appliedResult.rows.map((row) => row.name));

    const applied: string[] = [];
    for (const file of listMigrations(dir)) {
      if (alreadyApplied.has(file)) continue;

      const sql = readFileSync(join(dir, file), 'utf-8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
      applied.push(file);
    }

    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}
