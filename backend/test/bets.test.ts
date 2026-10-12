import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, createRace, createUser, getBankroll, near, pool, query, resetDatabase, startServer } from './helpers.js';
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

describe('placing bets', () => {
  let user: Awaited<ReturnType<typeof createUser>>;
  let race: Awaited<ReturnType<typeof createRace>>;

  beforeEach(async () => {
    user = await createUser(server.url);
    race = await createRace({ odds: [2.5, 4, 6, 10] });
  });

  test('potential payout uses database odds, not client odds', async () => {
    const response = await user.api.post('/bets', {
      race_id: race.raceId,
      bet_type: 'simple',
      stake: 10,
      selections: [{ runner_id: race.runnerIds[1], odds: 1000 }]
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.bet.potential_payout, 40);
    assert.deepEqual(response.body.bet.selections, [{ runner_id: race.runnerIds[1], saddle_number: 2, odds: 4 }]);
    assert.equal(await getBankroll(user.id), 990);
  });

  test('combined bet payout follows the Harville estimate, not the product of the odds', async () => {
    const response = await user.api.post('/bets', {
      race_id: race.raceId,
      bet_type: 'couple',
      stake: 2,
      selections: [{ runner_id: race.runnerIds[0] }, { runner_id: race.runnerIds[2] }]
    });
    assert.equal(response.status, 201);
    // Normalized win probabilities .436/.273/.182/.109; P(runners 1 and 3 take the first two places)
    // = .2378; odds = (1 - 25% takeout) / .2378 = 3.15 → 2€ × 3.15. The old product of odds paid 30€
    assert.equal(response.body.bet.potential_payout, 6.3);
  });

  test('the quote gives exactly the odds applied when the bet is placed', async () => {
    const field = await createRace({ odds: [2.5, 4, 6, 9, 15, 30, 40] });
    for (const [betType, count] of [['simple', 1], ['couple', 2], ['trio', 3], ['quarte', 4], ['quinte', 5]] as const) {
      const selections = field.runnerIds.slice(0, count).map((runner_id) => ({ runner_id }));
      const quote = await user.api.post('/bets/quote', { race_id: field.raceId, bet_type: betType, selections });
      assert.equal(quote.status, 200, JSON.stringify(quote.body));

      const bet = await user.api.post('/bets', { race_id: field.raceId, bet_type: betType, stake: 10, selections });
      assert.equal(bet.status, 201);
      assert.equal(bet.body.bet.potential_payout, Math.round(10 * quote.body.odds * 100) / 100, betType);
    }

    // Selecting outsiders pays more than selecting favorites
    const favorites = await user.api.post('/bets/quote', {
      race_id: field.raceId, bet_type: 'couple', selections: [{ runner_id: field.runnerIds[0] }, { runner_id: field.runnerIds[1] }]
    });
    const outsiders = await user.api.post('/bets/quote', {
      race_id: field.raceId, bet_type: 'couple', selections: [{ runner_id: field.runnerIds[5] }, { runner_id: field.runnerIds[6] }]
    });
    assert.ok(outsiders.body.odds > favorites.body.odds * 10);
  });

  test('quotes are validated like bets and need authentication', async () => {
    const finished = await createRace({ odds: [3, 3], status: 'finished' });
    const quote = (body: object) => user.api.post('/bets/quote', body);

    assert.equal((await quote({ race_id: finished.raceId, bet_type: 'simple', selections: [{ runner_id: finished.runnerIds[0] }] })).status, 400);
    assert.equal((await quote({ race_id: race.raceId, bet_type: 'trio', selections: [{ runner_id: race.runnerIds[0] }] })).status, 400);
    assert.equal((await quote({ race_id: 99999999, bet_type: 'simple', selections: [{ runner_id: 1 }] })).status, 404);
    assert.equal((await client(server.url).post('/bets/quote', { race_id: race.raceId, bet_type: 'simple', selections: [] })).status, 401);
  });

  test('invalid bets are rejected', async () => {
    const other = await createRace({ odds: [3, 3] });
    const finished = await createRace({ odds: [3, 3], status: 'finished' });
    const base = { race_id: race.raceId, bet_type: 'simple', stake: 5, selections: [{ runner_id: race.runnerIds[0] }] };

    const cases: [string, object, number][] = [
      ['non-numeric stake', { ...base, stake: 'abc' }, 400],
      ['negative stake', { ...base, stake: -5 }, 400],
      ['unknown bet type', { ...base, bet_type: 'lotto' }, 400],
      ['couple with one selection', { ...base, bet_type: 'couple' }, 400],
      ['duplicate selections', { ...base, bet_type: 'couple', selections: [{ runner_id: race.runnerIds[0] }, { runner_id: race.runnerIds[0] }] }, 400],
      ['runner from another race', { ...base, selections: [{ runner_id: other.runnerIds[0] }] }, 400],
      ['finished race', { ...base, race_id: finished.raceId, selections: [{ runner_id: finished.runnerIds[0] }] }, 400],
      ['unknown race', { ...base, race_id: 99999999 }, 404],
      ['unknown strategy', { ...base, strategy_id: 99999999 }, 404],
      ['insufficient funds', { ...base, stake: 5000 }, 400]
    ];

    for (const [name, body, expected] of cases) {
      const response = await user.api.post('/bets', body);
      assert.equal(response.status, expected, `${name}: ${JSON.stringify(response.body)}`);
    }
    assert.equal(await getBankroll(user.id), 1000);
  });

  test("a user cannot bet with another user's strategy", async () => {
    const owner = await createUser(server.url);
    const strategy = await owner.api.post('/strategies', { name: 'Mine', type: 'FAVORITE', parameters: {} });
    const response = await user.api.post('/bets', {
      race_id: race.raceId,
      bet_type: 'simple',
      stake: 5,
      strategy_id: strategy.body.id,
      selections: [{ runner_id: race.runnerIds[0] }]
    });
    assert.equal(response.status, 404);
  });

  test('parallel bets cannot spend the same funds twice', async () => {
    await query('UPDATE users SET bankroll = 10 WHERE id = $1', [user.id]);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 10, selections: [{ runner_id: race.runnerIds[0] }] })
      )
    );
    assert.equal(responses.filter((r) => r.status === 201).length, 1);
    assert.equal(await getBankroll(user.id), 0);
  });
});

describe('cancelling bets', () => {
  test('a bet is refunded once, even with parallel cancellations', async () => {
    const user = await createUser(server.url);
    const race = await createRace({ odds: [2, 3] });
    const bet = await user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 10, selections: [{ runner_id: race.runnerIds[0] }] });

    const responses = await Promise.all(Array.from({ length: 5 }, () => user.api.del(`/bets/${bet.body.bet.id}`)));

    assert.equal(responses.filter((r) => r.status === 200).length, 1);
    assert.equal(await getBankroll(user.id), 1000);

    // The refund is not counted as a deposit
    const refunds = await query(`SELECT type, amount FROM transactions WHERE bet_id = $1 AND type <> 'BET_PLACED'`, [bet.body.bet.id]);
    assert.deepEqual(refunds, [{ type: 'BET_REFUND', amount: 10 }]);
    const stats = await user.api.get('/bankroll/statistics');
    assert.equal(stats.body.total_deposits, 1000);
  });

  test('cannot cancel once the race is running, nor cancel another user\'s bet', async () => {
    const user = await createUser(server.url);
    const intruder = await createUser(server.url);
    const race = await createRace({ odds: [2, 3] });
    const bet = await user.api.post('/bets', { race_id: race.raceId, bet_type: 'simple', stake: 10, selections: [{ runner_id: race.runnerIds[0] }] });

    assert.equal((await intruder.api.del(`/bets/${bet.body.bet.id}`)).status, 404);

    await query(`UPDATE races SET status = 'running' WHERE id = $1`, [race.raceId]);
    assert.equal((await user.api.del(`/bets/${bet.body.bet.id}`)).status, 400);
    assert.equal(await getBankroll(user.id), 990);
  });
});

describe('bankroll', () => {
  test('rejects invalid amounts', async () => {
    const user = await createUser(server.url);
    for (const [path, amount] of [['/bankroll/deposit', 'abc'], ['/bankroll/deposit', -1], ['/bankroll/withdraw', 'abc'], ['/bankroll/deposit', 1e12]] as const) {
      const response = await user.api.post(path, { amount });
      assert.equal(response.status, 400, `${path} ${amount}`);
    }
    assert.equal(await getBankroll(user.id), 1000);
  });

  test('parallel withdrawals cannot overdraw', async () => {
    const user = await createUser(server.url, { bankroll: 10 });
    const responses = await Promise.all(Array.from({ length: 10 }, () => user.api.post('/bankroll/withdraw', { amount: 10 })));
    assert.equal(responses.filter((r) => r.status === 200).length, 1);
    assert.equal(await getBankroll(user.id), 0);
  });

  test('deposit and withdraw are recorded as transactions', async () => {
    const user = await createUser(server.url);
    await user.api.post('/bankroll/deposit', { amount: 50.5 });
    await user.api.post('/bankroll/withdraw', { amount: 20 });
    assert.ok(near(await getBankroll(user.id), 1030.5));

    const transactions = await user.api.get('/bankroll/transactions');
    assert.deepEqual(
      transactions.body.slice(0, 2).map((t: { type: string; amount: number }) => [t.type, t.amount]),
      [['WITHDRAWAL', 20], ['DEPOSIT', 50.5]]
    );
  });
});
