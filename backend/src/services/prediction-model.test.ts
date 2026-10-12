import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatForm, formScore, predictionScore, scoreComponents, smoothedRate } from './prediction-model.js';
import type { RunnerFeatures } from './prediction-model.js';

const newcomer: RunnerFeatures = {
  horse_starts: 0, horse_wins: 0, horse_places: 0, recent_positions: [],
  distance_starts: 0, distance_places: 0, jockey_rides: 0, jockey_wins: 0, trainer_runs: 0, trainer_wins: 0
};
const withHistory = (changes: Partial<RunnerFeatures>): RunnerFeatures => ({ ...newcomer, ...changes });

test('smoothing: short histories stay close to the typical rate', () => {
  assert.equal(smoothedRate(0, 0, 0.1, 5), 0.1);
  // 1 win out of 1 run is far from 100%
  assert.ok(Math.abs(smoothedRate(1, 1, 0.1, 5) - 0.25) < 1e-9);
  // A long history dominates the prior
  assert.ok(smoothedRate(40, 100, 0.1, 5) > 0.38);
});

test('form: recent runs weigh more, unplaced runs count zero, no history is neutral', () => {
  assert.equal(formScore([]), 0.2);
  assert.equal(formScore([1, 1, 1, 1, 1]), 1);
  assert.equal(formScore([null, null]), 0);
  assert.ok(formScore([1, null, null]) > formScore([null, null, 1]));
  // Only the last 5 runs count
  assert.equal(formScore([1, 1, 1, 1, 1, null, null]), 1);
});

test('more wins, better form, better connections and lower odds all raise the score', () => {
  const base = withHistory({ horse_starts: 10, horse_wins: 1, horse_places: 3, recent_positions: [4, 5, null], jockey_rides: 100, jockey_wins: 10, trainer_runs: 100, trainer_wins: 10 });
  const baseScore = predictionScore(base, 6);

  assert.ok(predictionScore({ ...base, horse_wins: 4, horse_places: 6 }, 6) > baseScore);
  assert.ok(predictionScore({ ...base, recent_positions: [1, 2, 1] }, 6) > baseScore);
  assert.ok(predictionScore({ ...base, jockey_wins: 25 }, 6) > baseScore);
  assert.ok(predictionScore({ ...base, distance_starts: 4, distance_places: 4 }, 6) > baseScore);
  assert.ok(predictionScore(base, 2.5) > baseScore);
});

test('scores stay within 0-100 and components within 0-1', () => {
  const champion = withHistory({ horse_starts: 50, horse_wins: 40, horse_places: 50, recent_positions: [1, 1, 1, 1, 1], distance_starts: 20, distance_places: 20, jockey_rides: 500, jockey_wins: 400, trainer_runs: 500, trainer_wins: 400 });
  assert.ok(predictionScore(champion, 1.2) <= 100);
  assert.ok(predictionScore(champion, 1.2) > 90);
  assert.ok(predictionScore(newcomer, null) > 0);
  for (const value of Object.values(scoreComponents(champion, 1.01))) assert.ok(value >= 0 && value <= 1);
});

test('form is written the usual way', () => {
  assert.equal(formatForm([1, null, 3, 12]), '1-0-3-0');
  assert.equal(formatForm([]), '');
});
