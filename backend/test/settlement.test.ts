import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import settlementService from '../src/services/settlement.service.js';
import { createRace, createUser, getBankroll, insertResults, near, pool, query, resetDatabase, startServer } from './helpers.js';
import type { TestServer } from './helpers.js';

let server: TestServer;
let admin: Awaited<ReturnType<typeof createUser>>;

before(async () => {
  await resetDatabase();
  server = await startServer();
  admin = await createUser(server.url, { role: 'admin', bankroll: 0 });
});

after(async () => {
  await server.close();
  await pool.end();
});

const finishOrder = (runnerIds: number[]) => runnerIds.map((runner_id, index) => ({ runner_id, finish_position: index + 1 }));

describe('recording results', () => {
  test('settles each bet type and credits the winners', async () => {
    const user = await createUser(server.url);
    const strategy = await user.api.post('/strategies', { name: 'Tracked', type: 'FAVORITE', parameters: {} });
    const race = await createRace({ odds: [2, 3, 5, 8, 13] });
    const [a, b, c, d] = race.runnerIds;

    const place = (bet_type: string, runners: number[], stake: number, strategy_id?: number) =>
      user.api.post('/bets', { race_id: race.raceId, bet_type, stake, strategy_id, selections: runners.map((runner_id) => ({ runner_id })) });

    const simpleWinner = (await place('simple', [a], 10, strategy.body.id)).body.bet;
    const simpleSecond = (await place('simple', [b], 10, strategy.body.id)).body.bet;
    const coupleReversed = (await place('couple', [b, a], 5)).body.bet;
    const trioWithFourth = (await place('trio', [a, b, d], 5)).body.bet;
    assert.equal(await getBankroll(user.id), 970);

    const response = await admin.api.post(`/races/${race.raceId}/results`, { results: finishOrder(race.runnerIds) });
    assert.equal(response.status, 201);
    assert.deepEqual(response.body.settlement, { race_id: race.raceId, won: 2, lost: 2, refunded: 0 });

    const bets = new Map(
      (await query('SELECT id, status, actual_payout FROM bets WHERE race_id = $1', [race.raceId])).map((bet) => [bet.id, bet])
    );
    assert.equal(bets.get(simpleWinner.id).status, 'won');
    assert.equal(bets.get(simpleWinner.id).actual_payout, 20);
    assert.equal(bets.get(simpleSecond.id).status, 'lost');
    assert.equal(bets.get(coupleReversed.id).status, 'won');
    assert.equal(bets.get(trioWithFourth.id).status, 'lost');

    // 970 + 10×2 (simple) + 5×2×3 (couple)
    assert.equal(await getBankroll(user.id), 1020);
    const [{ count }] = await query(`SELECT COUNT(*)::int as count FROM transactions WHERE type = 'BET_WON' AND user_id = $1`, [user.id]);
    assert.equal(count, 2);

    const [stats] = await query('SELECT total_bets, winning_bets, total_staked, total_returned, roi, win_rate FROM strategies WHERE id = $1', [strategy.body.id]);
    assert.deepEqual(stats, { total_bets: 2, winning_bets: 1, total_staked: 20, total_returned: 20, roi: 0, win_rate: 0.5 });

    // Results can only be recorded once
    assert.equal((await admin.api.post(`/races/${race.raceId}/results`, { results: finishOrder(race.runnerIds) })).status, 409);
  });

  test('a disqualified winner loses and the next runner wins', async () => {
    const user = await createUser(server.url);
    const race = await createRace({ odds: [2, 3, 5] });
    const [a, b, c] = race.runnerIds;
    const onA = (await user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 5, selections: [{ runner_id: a }] })).body.bet;
    const onB = (await user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 5, selections: [{ runner_id: b }] })).body.bet;

    await admin.api.post(`/races/${race.raceId}/results`, {
      results: [
        { runner_id: a, finish_position: 1, disqualified: true },
        { runner_id: b, finish_position: 2 },
        { runner_id: c, finish_position: 3 }
      ]
    });

    const statuses = new Map((await query('SELECT id, status FROM bets WHERE race_id = $1', [race.raceId])).map((bet) => [bet.id, bet.status]));
    assert.equal(statuses.get(onA.id), 'lost');
    assert.equal(statuses.get(onB.id), 'won');
  });

  test('only admins can record results, and input is validated', async () => {
    const user = await createUser(server.url);
    const race = await createRace({ odds: [2, 3] });
    const [a, b] = race.runnerIds;
    const other = await createRace({ odds: [2] });

    assert.equal((await user.api.post(`/races/${race.raceId}/results`, { results: finishOrder(race.runnerIds) })).status, 403);
    assert.equal((await admin.api.post(`/races/${race.raceId}/results`, { results: [] })).status, 400);
    assert.equal((await admin.api.post(`/races/${race.raceId}/results`, { results: [{ runner_id: a, finish_position: 1 }, { runner_id: b, finish_position: 1 }] })).status, 400);
    assert.equal((await admin.api.post(`/races/${race.raceId}/results`, { results: [{ runner_id: other.runnerIds[0], finish_position: 1 }] })).status, 400);
    assert.equal((await admin.api.post('/races/99999999/results', { results: finishOrder(race.runnerIds) })).status, 404);
  });

  test('a demoted admin cannot keep using an admin token', async () => {
    const formerAdmin = await createUser(server.url, { role: 'admin' });
    await query(`UPDATE users SET role = 'user' WHERE id = $1`, [formerAdmin.id]);
    const race = await createRace({ odds: [2, 3] });
    assert.equal((await formerAdmin.api.post(`/races/${race.raceId}/cancel`)).status, 403);
  });
});

describe('cancelling a race', () => {
  test('refunds pending bets and closes betting', async () => {
    const user = await createUser(server.url);
    const race = await createRace({ odds: [2, 3] });
    await user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 25, selections: [{ runner_id: race.runnerIds[0] }] });

    const response = await admin.api.post(`/races/${race.raceId}/cancel`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.settlement, { race_id: race.raceId, won: 0, lost: 0, refunded: 1 });
    assert.equal(await getBankroll(user.id), 1000);

    const retry = await user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 5, selections: [{ runner_id: race.runnerIds[0] }] });
    assert.equal(retry.status, 400);
  });
});

describe('concurrency and background settlement', () => {
  test('a cancellation racing a result never credits a bet twice', async () => {
    const user = await createUser(server.url);
    for (let i = 0; i < 5; i++) {
      const race = await createRace({ odds: [2, 3, 4] });
      const bet = (await user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 5, selections: [{ runner_id: race.runnerIds[0] }] })).body.bet;

      await Promise.all([
        user.api.del(`/bets/${bet.id}`),
        admin.api.post(`/races/${race.raceId}/results`, { results: finishOrder(race.runnerIds) })
      ]);

      const credits = await query(`SELECT type FROM transactions WHERE bet_id = $1 AND type <> 'BET_PLACED'`, [bet.id]);
      assert.equal(credits.length, 1, `race ${race.raceId}: ${JSON.stringify(credits)}`);
    }

    // The bankroll always matches the last transaction
    const [last] = await query('SELECT bankroll_after FROM transactions WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [user.id]);
    assert.ok(near(last.bankroll_after, await getBankroll(user.id)));
  });

  test('settlePendingRaces settles results inserted directly in the database, once', async () => {
    const user = await createUser(server.url);
    const race = await createRace({ odds: [2, 3] });
    await user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 10, selections: [{ runner_id: race.runnerIds[0] }] });

    await insertResults(race.raceId, race.runnerIds);
    await query(`UPDATE races SET status = 'finished' WHERE id = $1`, [race.raceId]);

    const summaries = await settlementService.settlePendingRaces();
    assert.deepEqual(summaries, [{ race_id: race.raceId, won: 1, lost: 0, refunded: 0 }]);
    assert.deepEqual(await settlementService.settlePendingRaces(), []);
    assert.equal(await getBankroll(user.id), 1010);
  });
});
