import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import importService from '../src/services/import/import.service.js';
import { validateImport } from '../src/services/import/format.js';
import { createUser, getBankroll, pool, query, resetDatabase, startServer } from './helpers.js';
import type { TestServer } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(readFileSync(join(__dirname, '../../docs/exemple-import.json'), 'utf-8'));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

let server: TestServer;

before(async () => {
  await resetDatabase();
  server = await startServer();
});

after(async () => {
  await server.close();
  await pool.end();
});

const counts = async () =>
  (
    await query(`SELECT
      (SELECT COUNT(*)::int FROM races) as races, (SELECT COUNT(*)::int FROM runners) as runners,
      (SELECT COUNT(*)::int FROM horses) as horses, (SELECT COUNT(*)::int FROM jockeys) as jockeys,
      (SELECT COUNT(*)::int FROM trainers) as trainers, (SELECT COUNT(*)::int FROM hippodromes) as hippodromes,
      (SELECT COUNT(*)::int FROM results) as results, (SELECT COUNT(*)::int FROM race_dividends) as dividends`)
  )[0];

describe('validation', () => {
  test('the documented example is valid', () => {
    const { races, errors } = validateImport(example);
    assert.deepEqual(errors, []);
    assert.equal(races.length, 2);
  });

  test('errors name the exact field and only the invalid race is rejected', () => {
    const document = clone(example);
    document.races[0].runners[1].final_odds = 0.5;
    document.races[0].date = '2026-02-30';
    const { races, errors } = validateImport(document);

    assert.deepEqual(errors, ['races[0].date: YYYY-MM-DD', 'races[0].runners[1].final_odds: decimal odds greater than 1']);
    assert.deepEqual(races.map((race) => race.external_id), ['2030-06-01-R1C2']);
  });

  test('consistency rules', () => {
    const cases: [string, (doc: any) => void, RegExp][] = [
      ['duplicate saddle', (doc) => { doc.races[1].runners[1].saddle_number = 1; }, /saddle numbers must be unique/],
      ['finished without a winner', (doc) => { doc.races[0].runners[1].finish_position = 9; }, /needs the runner in position 1/],
      ['positions on a scheduled race', (doc) => { doc.races[1].runners[0].finish_position = 1; }, /only allowed when status is "finished"/],
      ['non-runner with a position', (doc) => { doc.races[0].runners[3].finish_position = 5; }, /non-runner cannot have a finishing position/],
      ['dividend with an unknown horse', (doc) => { doc.races[0].dividends[1].combination = [1, 9]; }, /combination/],
      ['missing jockey', (doc) => { delete doc.races[1].runners[0].jockey; }, /jockey\.name: required/],
      ['duplicate external_id', (doc) => { doc.races[1].external_id = doc.races[0].external_id; }, /duplicated/],
      ['not a document', (doc) => { delete doc.races; }, /"races" array/]
    ];
    for (const [name, mutate, expected] of cases) {
      const document = clone(example);
      mutate(document);
      const { errors } = validateImport(document);
      assert.ok(errors.some((error) => expected.test(error)), `${name}: ${JSON.stringify(errors)}`);
    }
  });
});

describe('importing', () => {
  test('imports races, runners, results, non-runners and dividends', async () => {
    const summary = await importService.importDocument(example);
    assert.deepEqual(
      { ...summary, errors: summary.errors },
      { source: 'exemple', races_received: 2, created: 2, updated: 0, results_recorded: 1, cancelled: 0, errors: [] }
    );

    const finished = (await query(`SELECT id, status, race_type, distance FROM races WHERE external_id = '2026-10-01-R1C1'`))[0];
    assert.equal(finished.status, 'finished');
    const arrival = await query(
      `SELECT ru.saddle_number FROM results re JOIN runners ru ON ru.id = re.runner_id WHERE re.race_id = $1 ORDER BY re.finish_position`,
      [finished.id]
    );
    assert.deepEqual(arrival.map((row) => row.saddle_number), [2, 1, 3, 5]);
    const [nonRunner] = await query('SELECT non_runner FROM runners WHERE race_id = $1 AND saddle_number = 4', [finished.id]);
    assert.equal(nonRunner.non_runner, true);
    const dividends = await query('SELECT bet_type, combination, payout_per_euro FROM race_dividends WHERE race_id = $1 ORDER BY bet_type', [finished.id]);
    assert.deepEqual(dividends, [
      { bet_type: 'couple', combination: [1, 2], payout_per_euro: 6.8 },
      { bet_type: 'simple', combination: [2], payout_per_euro: 5.1 },
      { bet_type: 'trio', combination: [1, 2, 3], payout_per_euro: 21.4 }
    ]);

    // Shared people are created once (J. Martin rides twice, A. Durand trains twice)
    const before = await counts();
    assert.equal(before.jockeys, 7);
    assert.equal(before.trainers, 5);
    assert.equal(before.hippodromes, 2);
  });

  test('re-importing updates without duplicating anything', async () => {
    const before = await counts();
    const document = clone(example);
    document.races[1].runners[0].morning_odds = 3.4;

    const summary = await importService.importDocument(document);

    assert.equal(summary.created, 0);
    assert.equal(summary.updated, 2);
    assert.deepEqual(summary.errors, []);
    assert.deepEqual(await counts(), before);
    const [runner] = await query(
      `SELECT ru.morning_odds FROM runners ru JOIN races r ON r.id = ru.race_id WHERE r.external_id = '2030-06-01-R1C2' AND ru.saddle_number = 1`
    );
    assert.equal(runner.morning_odds, 3.4);
  });

  test('a different arrival for a finished race is reported, not applied', async () => {
    const document = clone(example);
    document.races[0].runners[0].finish_position = 1;
    document.races[0].runners[1].finish_position = 2;

    const summary = await importService.importDocument(document);

    assert.equal(summary.errors.length, 1);
    assert.match(summary.errors[0], /2026-10-01-R1C1: results differ from those already recorded \(2-1-3-5\)/);
    const arrival = await query(
      `SELECT ru.saddle_number FROM results re JOIN runners ru ON ru.id = re.runner_id JOIN races r ON r.id = re.race_id
       WHERE r.external_id = '2026-10-01-R1C1' ORDER BY re.finish_position`
    );
    assert.deepEqual(arrival.map((row) => row.saddle_number), [2, 1, 3, 5]);
  });

  test('importing the arrival settles bets; a non-runner in a bet is refunded', async () => {
    const user = await createUser(server.url);
    const [race] = await query(`SELECT id FROM races WHERE external_id = '2030-06-01-R1C2'`);
    const runners = new Map(
      (await query('SELECT id, saddle_number FROM runners WHERE race_id = $1', [race.id])).map((row) => [row.saddle_number, row.id])
    );
    const place = (saddle: number) =>
      user.api.post('/bets', { race_id: race.id, bet_type: 'simple', stake: 10, selections: [{ runner_id: runners.get(saddle) }] });
    const onWinner = (await place(2)).body.bet;
    const onLoser = (await place(1)).body.bet;
    const onNonRunner = (await place(3)).body.bet;
    assert.equal(await getBankroll(user.id), 970);

    // Horse 3 is withdrawn, then the race is run: 2 wins, 1 second
    const document = clone(example);
    document.races = [document.races[1]];
    document.races[0].status = 'finished';
    document.races[0].runners[2].non_runner = true;
    document.races[0].runners[1].finish_position = 1;
    document.races[0].runners[0].finish_position = 2;

    const summary = await importService.importDocument(document);
    assert.deepEqual(summary.errors, []);
    assert.equal(summary.results_recorded, 1);

    const statuses = new Map((await query('SELECT id, status FROM bets WHERE user_id = $1', [user.id])).map((bet) => [bet.id, bet.status]));
    assert.equal(statuses.get(onWinner.id), 'won');
    assert.equal(statuses.get(onLoser.id), 'lost');
    assert.equal(statuses.get(onNonRunner.id), 'cancelled');
    // 970 + winnings + refund of the non-runner bet
    assert.ok(Math.abs((await getBankroll(user.id)) - (970 + onWinner.potential_payout + 10)) < 0.001);
  });

  test('a non-runner cannot be bet on and is left out of predictions', async () => {
    const document = clone(example);
    document.races = [document.races[1]];
    document.races[0].external_id = '2030-06-02-R1C1';
    document.races[0].date = '2030-06-02';
    document.races[0].runners[2].non_runner = true;
    await importService.importDocument(document);

    const user = await createUser(server.url);
    const [race] = await query(`SELECT id FROM races WHERE external_id = '2030-06-02-R1C1'`);
    const [nonRunner] = await query('SELECT id FROM runners WHERE race_id = $1 AND saddle_number = 3', [race.id]);

    const bet = await user.api.post('/bets', { race_id: race.id, bet_type: 'simple', stake: 5, selections: [{ runner_id: nonRunner.id }] });
    assert.equal(bet.status, 400);
    assert.equal(bet.body.error.message, 'A selected horse is a non-runner');

    const predictions = await user.api.get(`/predictions/race/${race.id}`);
    assert.ok(predictions.body.predictions.every((prediction: { runner_id: number }) => prediction.runner_id !== nonRunner.id));
    assert.equal(predictions.body.predictions.length, 2);
  });

  test('a cancelled race refunds pending bets', async () => {
    const user = await createUser(server.url);
    const [race] = await query(`SELECT id FROM races WHERE external_id = '2030-06-02-R1C1'`);
    const [runner] = await query('SELECT id FROM runners WHERE race_id = $1 AND saddle_number = 1', [race.id]);
    await user.api.post('/bets', { race_id: race.id, bet_type: 'simple', stake: 25, selections: [{ runner_id: runner.id }] });

    const document = clone(example);
    document.races = [document.races[1]];
    document.races[0].external_id = '2030-06-02-R1C1';
    document.races[0].date = '2030-06-02';
    document.races[0].status = 'cancelled';
    const summary = await importService.importDocument(document);

    assert.equal(summary.cancelled, 1);
    assert.equal(await getBankroll(user.id), 1000);
  });
});
