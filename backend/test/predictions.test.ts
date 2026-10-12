import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRunnersWithFeatures } from '../src/services/runner-features.service.js';
import { client, createRace, createUser, insertResults, pool, resetDatabase, startServer } from './helpers.js';
import type { RaceFixture, TestServer } from './helpers.js';

let server: TestServer;

before(async () => {
  await resetDatabase();
  server = await startServer();
});

after(async () => {
  await server.close();
  await pool.end();
});

/** Finished race on `date`; `winnerIndex` wins, the others follow in order */
async function finished(date: string, options: Parameters<typeof createRace>[0], winnerIndex = 0): Promise<RaceFixture> {
  const race = await createRace({ ...options, status: 'finished', date });
  await insertResults(race.raceId, [race.runnerIds[winnerIndex], ...race.runnerIds.filter((_, index) => index !== winnerIndex)]);
  return race;
}

const featuresOf = async (race: RaceFixture, index: number) =>
  (await loadRunnersWithFeatures([race.raceId])).find((runner) => runner.runner_id === race.runnerIds[index])!.features;

describe('statistics only use races finished before the race', () => {
  test('a later win does not change the prediction of an earlier race', async () => {
    // The same horse (index 0) and jockey run in March, in April (wins), then in May
    // March: runner 3 wins, so the tracked horse (runner 1) finishes 2nd
    const march = await finished('2028-03-01', { odds: [4, 4, 4] }, 2);
    const people = [{ horseId: march.horseIds[0], jockeyId: march.jockeyIds[0] }];
    const april = await finished('2028-04-01', { odds: [4, 4, 4], people }, 0);
    const may = await createRace({ odds: [4, 4, 4], date: '2028-05-01', people });

    const inMarch = await featuresOf(march, 0);
    assert.equal(inMarch.horse_starts, 0, 'nothing known before its first race');
    assert.equal(inMarch.jockey_rides, 0);

    const inApril = await featuresOf(april, 0);
    assert.deepEqual([inApril.horse_starts, inApril.horse_wins, inApril.recent_positions], [1, 0, [2]]);

    const inMay = await featuresOf(may, 0);
    assert.deepEqual([inMay.horse_starts, inMay.horse_wins, inMay.horse_places], [2, 1, 2]);
    assert.deepEqual(inMay.recent_positions, [1, 2], 'most recent first');
    assert.deepEqual([inMay.jockey_rides, inMay.jockey_wins], [2, 1]);
  });

  test('scheduled, cancelled and future races do not count; disqualification is not a win', async () => {
    const first = await finished('2027-01-10', { odds: [3, 3] }, 0);
    const people = [{ horseId: first.horseIds[0] }];
    await createRace({ odds: [3, 3], date: '2027-02-01', status: 'cancelled', people });
    const target = await createRace({ odds: [3, 3], date: '2027-03-01', people });
    await finished('2027-04-01', { odds: [3, 3], people }, 0);

    await pool.query('UPDATE results SET disqualified = true WHERE runner_id = $1', [first.runnerIds[0]]);
    const features = await featuresOf(target, 0);
    assert.deepEqual([features.horse_starts, features.horse_wins, features.horse_places], [1, 0, 0]);
    assert.deepEqual(features.recent_positions, [null]);
  });

  test('jockey and trainer statistics cover the previous 365 days only', async () => {
    const old = await finished('2026-01-01', { odds: [3, 3] }, 0);
    const recent = await finished('2026-11-01', { odds: [3, 3], people: [{ jockeyId: old.jockeyIds[0] }] }, 0);
    const target = await createRace({ odds: [3, 3], date: '2027-02-01', people: [{ jockeyId: old.jockeyIds[0] }] });
    assert.ok(recent);

    const features = await featuresOf(target, 0);
    assert.deepEqual([features.jockey_rides, features.jockey_wins], [1, 1], 'the ride 13 months earlier is ignored');
  });

  test('distance statistics count runs in the same 200 m band', async () => {
    const mile = await finished('2025-05-01', { odds: [3, 3], distance: 1600 }, 0);
    await finished('2025-06-01', { odds: [3, 3], distance: 2400, people: [{ horseId: mile.horseIds[0] }] }, 0);
    const target = await createRace({ odds: [3, 3], date: '2025-07-01', distance: 1650, people: [{ horseId: mile.horseIds[0] }] });

    const features = await featuresOf(target, 0);
    assert.deepEqual([features.horse_starts, features.distance_starts, features.distance_places], [2, 1, 1]);
  });
});

describe('predictions API', () => {
  test('a horse with a winning record ranks first at equal odds, and its form is shown', async () => {
    const past = await finished('2024-03-01', { odds: [5, 5, 5] }, 1);
    const pastAgain = await finished('2024-04-01', { odds: [5, 5, 5], people: [{}, { horseId: past.horseIds[1] }] }, 1);
    const race = await createRace({ odds: [5, 5, 5], date: '2030-01-01', people: [{}, { horseId: past.horseIds[1] }] });
    assert.ok(pastAgain);

    const response = await client(server.url).get(`/predictions/race/${race.raceId}`);
    const [top] = response.body.predictions;
    assert.equal(top.runner_id, race.runnerIds[1]);
    assert.equal(top.form, '1-1');
    assert.deepEqual([top.horse_starts, top.horse_wins], [2, 2]);
  });

  test('a backtest gives the same result before and after later races are added', async () => {
    const user = await createUser(server.url);
    const strategy = await user.api.post('/strategies', {
      name: 'Top pick', type: 'FIXED_PERCENTAGE', parameters: { percentageBankroll: 5 }
    });
    const run = () => user.api.post(`/strategies/${strategy.body.id}/backtest`, { from: '2023-01-01', to: '2023-12-31', initial_bankroll: 100 });

    const january = await finished('2023-01-15', { odds: [3, 4, 6] }, 1);
    await finished('2023-02-15', { odds: [3, 4, 6], people: [{ horseId: january.horseIds[0] }, { horseId: january.horseIds[1] }] }, 2);
    const before = (await run()).body.results;

    // Results after the backtest period, involving the same horses
    await finished('2024-01-15', { odds: [3, 4, 6], people: [{ horseId: january.horseIds[0] }, { horseId: january.horseIds[1] }] }, 0);
    const afterResults = (await run()).body.results;

    assert.deepEqual(afterResults.summary, before.summary);
    assert.deepEqual(afterResults.recent_bets, before.recent_bets);
  });
});
