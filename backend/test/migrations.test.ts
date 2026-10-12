import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { listMigrations, runMigrations } from '../src/database/migrator.js';
import { createRace, pool, query, resetDatabase } from './helpers.js';

before(resetDatabase);
after(() => pool.end());

test('every migration is applied once and recorded', async () => {
  const recorded = await query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
  assert.deepEqual(recorded.map((row) => row.name), listMigrations());

  // Running again is a no-op
  assert.deepEqual(await runMigrations(pool), []);
});

test('a database created before migration tracking is upgraded without data loss', async () => {
  // Simulate a pre-tracking install: tables from 001 exist, but no schema_migrations table,
  // with a real deposit and a bet refund recorded the old way (as a DEPOSIT tied to a bet)
  const [user] = await query(`INSERT INTO users (email, username, password, bankroll) VALUES ('old@test.local', 'old', 'x', 50) RETURNING id`);
  const race = await createRace({ odds: [2, 3] });
  const [bet] = await query(
    `INSERT INTO bets (user_id, race_id, bet_type, selections, stake, potential_payout, status)
     VALUES ($1, $2, 'simple', '[]', 5, 10, 'cancelled') RETURNING id`,
    [user.id, race.raceId]
  );
  await query(
    `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, bet_id, description) VALUES
     ($1, 'DEPOSIT', 45, 0, 45, NULL, 'Deposit'),
     ($1, 'DEPOSIT', 5, 45, 50, $2, 'Bet cancelled - refund')`,
    [user.id, bet.id]
  );
  await query('DROP TABLE schema_migrations');

  const applied = await runMigrations(pool);

  assert.deepEqual(applied, listMigrations());
  const [after] = await query('SELECT bankroll FROM users WHERE id = $1', [user.id]);
  assert.equal(after.bankroll, 50);
  const types = await query('SELECT type, bet_id FROM transactions WHERE user_id = $1 ORDER BY id', [user.id]);
  assert.deepEqual(types.map((t) => t.type), ['DEPOSIT', 'BET_REFUND']);
});

test('concurrent runs do not apply a migration twice', async () => {
  await query('DELETE FROM schema_migrations');
  const results = await Promise.all([runMigrations(pool), runMigrations(pool), runMigrations(pool)]);
  assert.equal(results.flat().length, listMigrations().length);
});
