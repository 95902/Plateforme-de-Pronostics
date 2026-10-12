import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { listMigrations, runMigrations } from '../src/database/migrator.js';
import { pool, query, resetDatabase } from './helpers.js';

before(resetDatabase);
after(() => pool.end());

test('every migration is applied once and recorded', async () => {
  const recorded = await query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
  assert.deepEqual(recorded.map((row) => row.name), listMigrations());

  // Running again is a no-op
  assert.deepEqual(await runMigrations(pool), []);
});

test('a database created before migration tracking is upgraded without data loss', async () => {
  // Simulate a pre-tracking install: tables from 001 exist, but no schema_migrations table
  await query(`INSERT INTO users (email, username, password, bankroll) VALUES ('old@test.local', 'old', 'x', 50)`);
  await query('DROP TABLE schema_migrations');

  const applied = await runMigrations(pool);

  assert.deepEqual(applied, listMigrations());
  const [user] = await query('SELECT bankroll FROM users WHERE email = $1', ['old@test.local']);
  assert.equal(user.bankroll, 50);
});

test('concurrent runs do not apply a migration twice', async () => {
  await query('DELETE FROM schema_migrations');
  const results = await Promise.all([runMigrations(pool), runMigrations(pool), runMigrations(pool)]);
  assert.equal(results.flat().length, listMigrations().length);
});
