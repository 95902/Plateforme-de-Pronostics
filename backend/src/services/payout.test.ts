import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinedOdds, impliedProbabilities, topPlacesProbability, TAKEOUT_BY_BET_TYPE } from './payout.js';

const near = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≈ ${expected}`);

// 4 equally fancied runners
const equal = new Map([[1, 4], [2, 4], [3, 4], [4, 4]]);

test('implied probabilities are normalized', () => {
  const probabilities = impliedProbabilities(new Map([[1, 2], [2, 4], [3, 4]]));
  near(probabilities.get(1)!, 0.5);
  near(probabilities.get(2)!, 0.25);
});

test('Harville: equal runners give 1 / C(n, k) for any set of k', () => {
  const probabilities = impliedProbabilities(equal);
  near(topPlacesProbability(probabilities, [1, 2]), 1 / 6);
  near(topPlacesProbability(probabilities, [1, 2, 3]), 1 / 4);
  near(topPlacesProbability(probabilities, [1, 2, 3, 4]), 1);
});

test('Harville: probabilities over every pair sum to 1, and the order of the selection does not matter', () => {
  const probabilities = impliedProbabilities(new Map([[1, 2], [2, 3], [3, 6], [4, 12]]));
  const pairs = [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
  near(pairs.reduce((sum, pair) => sum + topPlacesProbability(probabilities, pair), 0), 1);
  near(topPlacesProbability(probabilities, [2, 1]), topPlacesProbability(probabilities, [1, 2]));
});

test('combined odds = (1 - takeout) / probability, simple keeps the win odds', () => {
  assert.equal(combinedOdds('simple', equal, [3]), 4);
  // 0.75 × 6 = 4.5
  assert.equal(combinedOdds('couple', equal, [1, 2]), Math.round((1 - TAKEOUT_BY_BET_TYPE.couple) * 6 * 100) / 100);
});

test('combined odds are far below the product of the win odds, and favorites pay less', () => {
  const race = new Map([[1, 2.5], [2, 4], [3, 6], [4, 9], [5, 15], [6, 30], [7, 40], [8, 60]]);
  const favorites = combinedOdds('quinte', race, [1, 2, 3, 4, 5]);
  const product = [2.5, 4, 6, 9, 15].reduce((a, b) => a * b, 1);
  assert.ok(favorites < product / 5, `${favorites} vs product ${product}`);
  assert.ok(combinedOdds('couple', race, [1, 2]) < combinedOdds('couple', race, [7, 8]));
});

test('unknown runner throws', () => {
  assert.throws(() => combinedOdds('couple', equal, [1, 99]), /No odds/);
});
