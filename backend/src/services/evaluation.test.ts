import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendProbabilities, evaluate, marketProbabilities, probabilityMetrics, usableRaces } from './evaluation.js';
import type { EvaluatedRace } from './evaluation.js';

const near = (actual: number, expected: number, epsilon = 1e-3) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`);

/** Two-runner race: the market says 75/25, the model says 50/50 (equal scores) */
const race = (id: number, favoriteWins: boolean): EvaluatedRace => ({
  race_id: id,
  runners: [
    { runner_id: id * 10 + 1, odds: 4 / 3, score: 30, won: favoriteWins },
    { runner_id: id * 10 + 2, odds: 4, score: 30, won: !favoriteWins }
  ]
});

test('market probabilities remove the margin', () => {
  const probabilities = marketProbabilities({ race_id: 1, runners: [{ runner_id: 1, odds: 2, score: 0, won: true }, { runner_id: 2, odds: 2, score: 0, won: false }] });
  assert.deepEqual(probabilities, [0.5, 0.5]);
});

test('log-loss, Brier and top pick on a known case', () => {
  const metrics = probabilityMetrics([race(1, true)], marketProbabilities);
  near(metrics.log_loss, -Math.log(0.75));
  near(metrics.brier, 0.25 ** 2 + 0.25 ** 2);
  assert.equal(metrics.top_pick_win_rate, 1);
});

test('when favorites win 3 times out of 4, the market (75%) beats a 50/50 model', () => {
  const races = [race(1, true), race(2, true), race(3, true), race(4, false)];
  const report = evaluate(races);

  assert.equal(report.races, 4);
  assert.equal(report.best, 'market');
  assert.ok(report.market.log_loss < report.model.log_loss);
  // Calibration: the 75% band won 3 times out of 4
  const band = report.market.calibration.find((b) => b.from === 0.35)!;
  assert.deepEqual([band.runners, band.predicted, band.actual], [4, 0.75, 0.75]);
  // 1€ on each favorite at 4/3: 3 wins → returned 4, ROI 0
  assert.deepEqual([report.betting.favorites.bets, report.betting.favorites.wins, report.betting.favorites.roi], [4, 3, 0]);
  // Model's value bets: 50% × 4 − 1 = +100% on each outsider
  assert.deepEqual([report.betting.value_bets.bets, report.betting.value_bets.wins], [4, 1]);
});

test('blend sits between model and market', () => {
  const blended = blendProbabilities([0.5, 0.5], [0.75, 0.25], 0.5);
  assert.ok(blended[0] > 0.5 && blended[0] < 0.75);
  near(blended[0] + blended[1], 1);
  assert.deepEqual(blendProbabilities([0.5, 0.5], [0.75, 0.25], 0), [0.75, 0.25]);
});

test('races without a single winner or with missing odds are skipped', () => {
  const noWinner = { ...race(5, true), runners: race(5, true).runners.map((r) => ({ ...r, won: false })) };
  const noOdds = { ...race(6, true), runners: [{ ...race(6, true).runners[0], odds: 0 }, race(6, true).runners[1]] };
  assert.equal(usableRaces([race(1, true), noWinner, noOdds]).length, 1);
  assert.equal(evaluate([race(1, true), noWinner, noOdds]).skipped_races, 2);
});
