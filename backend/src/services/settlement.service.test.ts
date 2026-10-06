import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWinningBet } from './settlement.service.js';

// Runner ids in finish order: 11 won, 12 second, 13 third, ...
const finishOrder = [11, 12, 13, 14, 15, 16];

test('simple wins only with the winner', () => {
  assert.equal(isWinningBet('simple', [11], finishOrder), true);
  assert.equal(isWinningBet('simple', [12], finishOrder), false);
});

test('combined bets win with the top N in any order', () => {
  assert.equal(isWinningBet('couple', [12, 11], finishOrder), true);
  assert.equal(isWinningBet('trio', [13, 11, 12], finishOrder), true);
  assert.equal(isWinningBet('quarte', [14, 13, 12, 11], finishOrder), true);
  assert.equal(isWinningBet('quinte', [15, 11, 14, 12, 13], finishOrder), true);
});

test('combined bets lose if one selection is outside the top N', () => {
  assert.equal(isWinningBet('couple', [11, 13], finishOrder), false);
  assert.equal(isWinningBet('trio', [11, 12, 14], finishOrder), false);
  assert.equal(isWinningBet('quinte', [11, 12, 13, 14, 16], finishOrder), false);
});

test('wrong number of selections or unknown bet type never wins', () => {
  assert.equal(isWinningBet('couple', [11], finishOrder), false);
  assert.equal(isWinningBet('simple', [11, 12], finishOrder), false);
  assert.equal(isWinningBet('lotto', [11], finishOrder), false);
});

test('not enough classified finishers never wins', () => {
  assert.equal(isWinningBet('trio', [11, 12, 13], [11, 12]), false);
  assert.equal(isWinningBet('simple', [11], []), false);
});
