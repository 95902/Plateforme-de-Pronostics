import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, createRace, createUser, insertResults, pool, resetDatabase, startServer } from './helpers.js';
import type { TestServer } from './helpers.js';

let server: TestServer;

before(async () => {
  await resetDatabase();
  server = await startServer();
});

after(async () => {
  await server.close();
  await pool.end();
});

test('evaluates the model against the odds on finished races of the period', async () => {
  // 4 races at odds 4/3 vs 4: the favorite wins 3 of them (market says 75%)
  for (const [day, favoriteWins] of [['02', true], ['03', true], ['04', true], ['05', false]] as const) {
    const race = await createRace({ odds: [4 / 3, 4], status: 'finished', date: `2022-06-${day}` });
    await insertResults(race.raceId, favoriteWins ? race.runnerIds : [...race.runnerIds].reverse());
  }
  // Outside the period, and a race without results: both ignored
  const outside = await createRace({ odds: [2, 2], status: 'finished', date: '2022-08-01' });
  await insertResults(outside.raceId, outside.runnerIds);
  await createRace({ odds: [2, 2], status: 'finished', date: '2022-06-10' });

  const user = await createUser(server.url);
  const response = await user.api.get('/predictions/evaluation?from=2022-06-01&to=2022-06-30');

  assert.equal(response.status, 200, JSON.stringify(response.body));
  const report = response.body;
  assert.deepEqual([report.races, report.skipped_races, report.runners], [4, 1, 8]);
  // Market log-loss: (3 × −ln 0.75 − ln 0.25) / 4
  assert.ok(Math.abs(report.market.log_loss - (3 * -Math.log(0.75) - Math.log(0.25)) / 4) < 0.001);
  assert.deepEqual([report.betting.favorites.bets, report.betting.favorites.wins], [4, 3]);
  assert.ok(['model', 'market', 'blend'].includes(report.best));
});

test('needs authentication and valid dates', async () => {
  assert.equal((await client(server.url).get('/predictions/evaluation')).status, 401);
  const user = await createUser(server.url);
  assert.equal((await user.api.get('/predictions/evaluation?from=2022-13-01')).status, 400);
  assert.equal((await user.api.get('/predictions/evaluation?from=2022-06-30&to=2022-06-01')).status, 400);
  const empty = await user.api.get('/predictions/evaluation?from=2001-01-01&to=2001-12-31');
  assert.deepEqual([empty.status, empty.body.races], [200, 0]);
});
