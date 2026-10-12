import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import raceService from '../src/services/race.service.js';
import strategyService from '../src/services/strategy.service.js';
import { RACE_TIMEZONE } from '../src/config/env.js';
import { client, createRace, createUser, getBankroll, pool, query, resetDatabase, startServer } from './helpers.js';
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

describe('betting closes when the race starts', () => {
  test('no bet once the start time has passed, even before the race is marked running', async () => {
    const user = await createUser(server.url);
    const started = await createRace({ odds: [2, 3], startsInMinutes: -1 });

    const response = await user.api.post('/bets', {
      race_id: started.raceId,
      bet_type: 'simple',
      stake: 10,
      selections: [{ runner_id: started.runnerIds[0] }]
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.message, 'Betting is closed for this race');
    assert.equal(await getBankroll(user.id), 1000);
  });

  test('a bet cannot be cancelled once the race has started', async () => {
    const user = await createUser(server.url);
    const race = await createRace({ odds: [2, 3], startsInMinutes: 30 });
    const bet = await user.api.post('/bets', {
      race_id: race.raceId,
      bet_type: 'simple',
      stake: 10,
      selections: [{ runner_id: race.runnerIds[0] }]
    });
    assert.equal(bet.status, 201);

    // The start time passes
    await query(
      `UPDATE races SET date = (now() AT TIME ZONE $2 - interval '1 minute')::date,
                        time = (now() AT TIME ZONE $2 - interval '1 minute')::time
       WHERE id = $1`,
      [race.raceId, RACE_TIMEZONE]
    );

    assert.equal((await user.api.del(`/bets/${bet.body.bet.id}`)).status, 400);
    assert.equal(await getBankroll(user.id), 990);
  });

  test('startDueRaces marks only races whose start time has passed as running', async () => {
    const due = await createRace({ odds: [2, 3], startsInMinutes: -5 });
    const soon = await createRace({ odds: [2, 3], startsInMinutes: 5 });
    const finished = await createRace({ odds: [2, 3], status: 'finished', date: '2020-01-01' });

    const started = await raceService.startDueRaces();

    assert.ok(started.includes(due.raceId));
    assert.ok(!started.includes(soon.raceId));
    const statuses = new Map(
      (await query('SELECT id, status FROM races WHERE id = ANY($1)', [[due.raceId, soon.raceId, finished.raceId]])).map((race) => [race.id, race.status])
    );
    assert.equal(statuses.get(due.raceId), 'running');
    assert.equal(statuses.get(soon.raceId), 'scheduled');
    assert.equal(statuses.get(finished.raceId), 'finished');

    // Idempotent
    assert.deepEqual(await raceService.startDueRaces(), []);
  });

  test('upcoming races exclude races that have already started', async () => {
    const started = await createRace({ odds: [2, 3], startsInMinutes: -2 });
    const upcoming = await createRace({ odds: [2, 3], startsInMinutes: 10 });

    const response = await client(server.url).get('/races/upcoming?limit=100');
    const ids = response.body.map((race: { id: number }) => race.id);

    assert.ok(ids.includes(upcoming.raceId));
    assert.ok(!ids.includes(started.raceId));
  });

  test('strategies do not bet on races that have already started', async () => {
    const user = await createUser(server.url);
    await createRace({ odds: [2, 3], startsInMinutes: -1 });
    await user.api.post('/strategies', { name: 'Fav', type: 'FAVORITE', parameters: { baseStake: 10, maxOdds: 100 }, is_active: true });

    const { placed } = await strategyService.runActiveStrategies();
    const [{ count }] = await query('SELECT COUNT(*)::int as count FROM bets WHERE user_id = $1', [user.id]);

    // Only the race starting in 10 minutes from the previous test is in the window
    assert.equal(placed, count);
    const betRaces = await query(
      `SELECT (r.date + r.time) > (now() AT TIME ZONE $2) as in_future FROM bets b JOIN races r ON r.id = b.race_id WHERE b.user_id = $1`,
      [user.id, RACE_TIMEZONE]
    );
    assert.ok(betRaces.every((race) => race.in_future));
  });
});
