import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import strategyService from '../src/services/strategy.service.js';
import { createRace, createUser, getBankroll, insertResults, near, pool, query, resetDatabase, startServer } from './helpers.js';
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

/** A finished race; `winnerIndex` is the index (in `odds`) of the winning runner */
async function finishedRace(date: string, odds: number[], winnerIndex: number) {
  const race = await createRace({ odds, status: 'finished', date });
  const order = [race.runnerIds[winnerIndex], ...race.runnerIds.filter((_, index) => index !== winnerIndex)];
  await insertResults(race.raceId, order);
  return race;
}

describe('strategy CRUD validation', () => {
  test('rejects invalid input and hides other users\' strategies', async () => {
    const user = await createUser(server.url);
    const other = await createUser(server.url);

    assert.equal((await user.api.post('/strategies', { name: 'x', type: 'BOGUS', parameters: {} })).status, 400);
    assert.equal((await user.api.post('/strategies', { name: ' ', type: 'FAVORITE', parameters: {} })).status, 400);
    assert.equal((await user.api.post('/strategies', { name: 'x', type: 'FAVORITE', parameters: [1] })).status, 400);

    const created = await user.api.post('/strategies', { name: 'Mine', type: 'FAVORITE', parameters: { baseStake: 5 } });
    assert.equal(created.status, 201);
    assert.equal(created.body.is_active, false);
    const id = created.body.id;

    assert.equal((await user.api.put(`/strategies/${id}`, { is_active: 'yes' })).status, 400);
    assert.equal((await user.api.put(`/strategies/${id}`, { is_active: true })).body.is_active, true);

    assert.equal((await other.api.get(`/strategies/${id}`)).status, 404);
    assert.equal((await other.api.put(`/strategies/${id}`, { name: 'Stolen' })).status, 404);
    assert.equal((await other.api.post(`/strategies/${id}/backtest`, {})).status, 404);
    assert.equal((await other.api.del(`/strategies/${id}`)).status, 404);
    assert.equal((await user.api.del(`/strategies/${id}`)).status, 200);
  });
});

describe('backtest', () => {
  test('replays FAVORITE with exact accounting and stores the run', async () => {
    const user = await createUser(server.url);
    await finishedRace('2029-01-01', [2, 5, 8], 0); // favorite (2.0) wins: +10
    await finishedRace('2029-01-02', [3, 4, 6], 2); // favorite (3.0) loses: -10
    await finishedRace('2029-01-03', [5, 6, 7], 0); // favorite odds 5 > maxOdds: no bet
    const strategy = await user.api.post('/strategies', { name: 'Fav', type: 'FAVORITE', parameters: { baseStake: 10, maxOdds: 4 } });

    const response = await user.api.post(`/strategies/${strategy.body.id}/backtest`, {
      from: '2029-01-01',
      to: '2029-01-31',
      initial_bankroll: 100
    });

    assert.equal(response.status, 201);
    const { summary, equity_curve, recent_bets } = response.body.results;
    assert.deepEqual(
      { ...summary, max_drawdown: undefined },
      {
        races_analyzed: 3,
        races_bet: 2,
        total_bets: 2,
        winning_bets: 1,
        win_rate: 0.5,
        total_staked: 20,
        total_returned: 20,
        net_profit: 0,
        roi: 0,
        max_drawdown: undefined,
        initial_bankroll: 100,
        final_bankroll: 100,
        busted: false
      }
    );
    assert.ok(near(summary.max_drawdown, 10 / 110, 0.0001));
    assert.deepEqual(equity_curve, [
      { date: '2029-01-01', bankroll: 110 },
      { date: '2029-01-02', bankroll: 100 }
    ]);
    assert.deepEqual(recent_bets.map((bet: { won: boolean; payout: number }) => [bet.won, bet.payout]), [[false, 0], [true, 20]]);

    // Stored in simulations, and the real bankroll is untouched
    const simulations = await user.api.get(`/strategies/${strategy.body.id}/simulations`);
    assert.equal(simulations.body.length, 1);
    assert.equal(simulations.body[0].results.summary.total_bets, 2);
    assert.equal(await getBankroll(user.id), 1000);
  });

  test('stops and reports a bust when the stake can no longer be covered', async () => {
    const user = await createUser(server.url);
    await finishedRace('2029-02-01', [2, 5], 0); // 100 - 40 + 80 = 140
    await finishedRace('2029-02-02', [2, 5], 1); // 140 - 40 = 100
    await finishedRace('2029-02-03', [2, 5], 1); // 100 - 80 = 20
    await finishedRace('2029-02-04', [2, 5], 0); // next stake 160 > 20: bust
    const strategy = await user.api.post('/strategies', {
      name: 'Martingale',
      type: 'MARTINGALE',
      parameters: { baseStake: 40, maxStake: 1000, maxConsecutiveLosses: 10 }
    });

    const response = await user.api.post(`/strategies/${strategy.body.id}/backtest`, {
      from: '2029-02-01',
      to: '2029-02-28',
      initial_bankroll: 100
    });

    const { summary } = response.body.results;
    assert.equal(summary.busted, true);
    assert.equal(summary.final_bankroll, 20);
    assert.equal(summary.races_bet, 3);
    assert.deepEqual(response.body.results.recent_bets.map((bet: { stake: number }) => bet.stake), [80, 40, 40]);
  });

  test('validates its input', async () => {
    const user = await createUser(server.url);
    const strategy = await user.api.post('/strategies', { name: 'Fav', type: 'FAVORITE', parameters: {} });
    const custom = await user.api.post('/strategies', { name: 'Custom', type: 'CUSTOM', parameters: {} });
    const url = `/strategies/${strategy.body.id}/backtest`;

    assert.equal((await user.api.post(url, { from: '2026-13-45', to: '2026-12-31' })).status, 400);
    assert.equal((await user.api.post(url, { from: '2026-05-01', to: '2026-01-01' })).status, 400);
    assert.equal((await user.api.post(url, { initial_bankroll: 'abc' })).status, 400);
    assert.equal((await user.api.post(`/strategies/${custom.body.id}/backtest`, {})).status, 400);

    const empty = await user.api.post(url, { from: '2001-01-01', to: '2001-12-31' });
    assert.equal(empty.status, 201);
    assert.equal(empty.body.results.summary.total_bets, 0);
  });
});

describe('live strategy runner', () => {
  test('active strategies bet once on races starting within the hour', async () => {
    const user = await createUser(server.url);
    const soon = await createRace({ odds: [2, 3, 5, 9], startsInMinutes: 30 });
    const later = await createRace({ odds: [2, 3, 5, 9], startsInMinutes: 180 });

    const create = async (type: string, parameters: object, is_active = true) =>
      (await user.api.post('/strategies', { name: type, type, parameters, is_active })).body.id as number;
    const favorite = await create('FAVORITE', { baseStake: 15, maxOdds: 100 });
    const martingale = await create('MARTINGALE', { baseStake: 5, maxStake: 160, maxConsecutiveLosses: 5 });
    const dutching = await create('DUTCHING', { horses: 3, totalStake: 30 });
    const inactive = await create('FIXED_PERCENTAGE', { percentageBankroll: 2 }, false);
    const custom = await create('CUSTOM', {});

    // Martingale history: a win, then two losses in a row -> next stake 5 × 2² = 20
    for (const [index, status] of ['won', 'lost', 'lost'].entries()) {
      const past = await createRace({ odds: [2, 3], status: 'finished', date: '2029-03-01' });
      await query(
        `INSERT INTO bets (user_id, race_id, strategy_id, bet_type, selections, stake, potential_payout, status, settled_at)
         VALUES ($1, $2, $3, 'simple', '[]', 5, 10, $4, NOW() - make_interval(hours => $5))`,
        [user.id, past.raceId, martingale, status, 10 - index]
      );
    }

    const first = await strategyService.runActiveStrategies();
    assert.deepEqual(first, { placed: 5, skipped: 0 });

    const bets = await query(
      `SELECT strategy_id, race_id, stake, selections FROM bets WHERE race_id = ANY($1) ORDER BY id`,
      [[soon.raceId, later.raceId]]
    );
    const byStrategy = (id: number) => bets.filter((bet) => bet.strategy_id === id);

    assert.ok(bets.every((bet) => bet.race_id === soon.raceId), 'no bet outside the 1 hour window');
    assert.deepEqual(byStrategy(favorite).map((bet) => [bet.stake, bet.selections[0].runner_id]), [[15, soon.runnerIds[0]]]);
    assert.deepEqual(byStrategy(martingale).map((bet) => bet.stake), [20]);
    assert.equal(byStrategy(dutching).length, 3);
    assert.ok(near(byStrategy(dutching).reduce((sum, bet) => sum + bet.stake, 0), 30, 0.05));
    assert.equal(byStrategy(inactive).length, 0);
    assert.equal(byStrategy(custom).length, 0);

    const staked = bets.reduce((sum, bet) => sum + bet.stake, 0);
    assert.ok(near(await getBankroll(user.id), 1000 - staked));

    // Running again does not bet twice on the same race
    assert.deepEqual(await strategyService.runActiveStrategies(), { placed: 0, skipped: 0 });
  });
});
