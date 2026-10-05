import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRace, decideBets, nextState, proposeBets, INITIAL_STATE } from './strategy-engine.js';
import type { EngineRunner, StrategyState } from './strategy-engine.js';

// Scores sum to 100, so probabilities are score / 100
const runners: EngineRunner[] = [
  { runner_id: 1, saddle_number: 1, odds: 2.5, score: 40 }, // p=0.40, EV=0.00
  { runner_id: 2, saddle_number: 2, odds: 6, score: 30 }, // p=0.30, EV=0.80
  { runner_id: 3, saddle_number: 3, odds: 4, score: 20 }, // p=0.20, EV=-0.20
  { runner_id: 4, saddle_number: 4, odds: 15, score: 10 }, // p=0.10, EV=0.50
];
const analysis = analyzeRace(runners);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.011, `${actual} ≈ ${expected}`);

test('analyzeRace normalizes scores into probabilities and computes EV', () => {
  const total = analysis.reduce((sum, runner) => sum + runner.probability, 0);
  near(total, 1);
  near(analysis[1].probability, 0.3);
  near(analysis[1].expected_value, 0.8);
  assert.deepEqual(analyzeRace([{ runner_id: 9, saddle_number: 9, odds: 1, score: 50 }]), []);
});

test('FAVORITE bets the base stake on the lowest odds, only below maxOdds', () => {
  assert.deepEqual(decideBets('FAVORITE', { baseStake: 20, maxOdds: 4 }, analysis, 1000, INITIAL_STATE), [
    { runner_id: 1, saddle_number: 1, odds: 2.5, stake: 20 },
  ]);
  assert.deepEqual(decideBets('FAVORITE', { baseStake: 20, maxOdds: 2 }, analysis, 1000, INITIAL_STATE), []);
});

test('VALUE_BETTING picks the best EV within the odds range', () => {
  const [bet] = decideBets('VALUE_BETTING', { minEV: 5, percentageBankroll: 2 }, analysis, 1000, INITIAL_STATE);
  assert.equal(bet.runner_id, 2);
  near(bet.stake, 20);
  const [inRange] = decideBets('VALUE_BETTING', { minEV: 5, percentageBankroll: 2, maxOdds: 5 }, analysis, 1000, INITIAL_STATE);
  assert.equal(inRange, undefined);
  const [longShot] = decideBets('VALUE_BETTING', { minEV: 5, percentageBankroll: 2, minOdds: 10 }, analysis, 1000, INITIAL_STATE);
  assert.equal(longShot.runner_id, 4);
});

test('KELLY_CRITERION stakes a fraction of the Kelly edge, capped', () => {
  // Runner 2: f = 0.8 / 5 = 0.16, half Kelly = 0.08 → 80€ on 1000€
  const [bet] = decideBets('KELLY_CRITERION', { fraction: 0.5, maxStakePercent: 10 }, analysis, 1000, INITIAL_STATE);
  assert.equal(bet.runner_id, 2);
  near(bet.stake, 80);
  const [capped] = decideBets('KELLY_CRITERION', { fraction: 0.5, maxStakePercent: 5 }, analysis, 1000, INITIAL_STATE);
  near(capped.stake, 50);
});

test('MARTINGALE doubles after each loss and resets after maxConsecutiveLosses', () => {
  const params = { baseStake: 5, maxStake: 1000, maxConsecutiveLosses: 3 };
  let state: StrategyState = INITIAL_STATE;
  const stakes: number[] = [];
  for (let i = 0; i < 4; i++) {
    stakes.push(decideBets('MARTINGALE', params, analysis, 1000, state)[0].stake);
    state = nextState('MARTINGALE', params, state, false);
  }
  assert.deepEqual(stakes, [5, 10, 20, 5]);
  state = nextState('MARTINGALE', params, { ...INITIAL_STATE, consecutiveLosses: 2 }, true);
  assert.equal(decideBets('MARTINGALE', params, analysis, 1000, state)[0].stake, 5);
  assert.equal(decideBets('MARTINGALE', { baseStake: 5, maxStake: 15 }, analysis, 1000, { ...INITIAL_STATE, consecutiveLosses: 3 })[0].stake, 15);
});

test('FIBONACCI moves one step up on loss and two steps down on win', () => {
  const params = { baseStake: 5, maxStep: 8 };
  let state: StrategyState = INITIAL_STATE;
  const stakes: number[] = [];
  for (const won of [false, false, false, false, true]) {
    stakes.push(decideBets('FIBONACCI', params, analysis, 1000, state)[0].stake);
    state = nextState('FIBONACCI', params, state, won);
  }
  assert.deepEqual(stakes, [5, 5, 10, 15, 25]);
  assert.equal(state.fibonacciStep, 2);
});

test('DUTCHING spreads the stake so every selected winner returns the same', () => {
  const bets = decideBets('DUTCHING', { horses: 3, totalStake: 30 }, analysis, 1000, INITIAL_STATE);
  assert.deepEqual(bets.map((bet) => bet.runner_id), [1, 2, 3]);
  near(bets.reduce((sum, bet) => sum + bet.stake, 0), 30);
  const returns = bets.map((bet) => bet.stake * bet.odds);
  near(returns[0], returns[1]);
  near(returns[1], returns[2]);
});

test('FIXED_PERCENTAGE bets a share of the bankroll on the top prediction', () => {
  assert.deepEqual(decideBets('FIXED_PERCENTAGE', { percentageBankroll: 2 }, analysis, 500, INITIAL_STATE), [
    { runner_id: 1, saddle_number: 1, odds: 2.5, stake: 10 },
  ]);
});

test('no bet when stakes exceed the bankroll, for CUSTOM, or with invalid parameters', () => {
  assert.deepEqual(decideBets('FAVORITE', { baseStake: 20, maxOdds: 4 }, analysis, 15, INITIAL_STATE), []);
  // proposeBets still reports the wanted bet, so a backtest can detect the bust
  assert.equal(proposeBets('FAVORITE', { baseStake: 20, maxOdds: 4 }, analysis, 15, INITIAL_STATE)[0].stake, 20);
  assert.deepEqual(decideBets('CUSTOM', {}, analysis, 1000, INITIAL_STATE), []);
  // Non-numeric parameters fall back to defaults instead of producing NaN stakes
  const [bet] = decideBets('FAVORITE', { baseStake: 'abc', maxOdds: 4 }, analysis, 1000, INITIAL_STATE);
  assert.equal(bet.stake, 10);
});
