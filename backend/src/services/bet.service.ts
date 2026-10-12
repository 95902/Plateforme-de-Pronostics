import type { PoolClient } from 'pg';
import pool from '../config/database.js';
import { parseAmount, parseId } from '../utils/validation.js';
import { HttpError } from '../utils/http-error.js';
import { RACE_TIMEZONE } from '../config/env.js';
import { combinedOdds, PLACES_BY_BET_TYPE } from './payout.js';
import type { BetType } from './payout.js';

interface BetSelection {
  runner_id: number;
  saddle_number: number;
  odds: number;
}

interface PricedSelection {
  selections: BetSelection[];
  /** Odds of the whole bet: stake × odds is paid if it wins */
  odds: number;
}

export interface PlaceBetInput {
  race_id?: unknown;
  bet_type?: unknown;
  selections?: unknown;
  stake?: unknown;
  strategy_id?: unknown;
}

/** Validate the race, bet type and selection of a bet or quote (not the stake) */
function parseSelection(input: PlaceBetInput): { raceId: number; betType: BetType; runnerIds: number[] } {
  const { race_id, bet_type, selections } = input;

  const raceId = parseId(race_id);
  const requiredSelections = PLACES_BY_BET_TYPE[bet_type as BetType];

  if (!raceId) throw new HttpError(400, 'Invalid race_id');
  if (!requiredSelections) throw new HttpError(400, 'Invalid bet_type');

  if (!Array.isArray(selections) || selections.length !== requiredSelections) {
    throw new HttpError(400, `A ${bet_type} bet requires exactly ${requiredSelections} selection(s)`);
  }

  // Only runner ids are taken from the client; odds always come from the database
  const runnerIds = selections.map((sel: { runner_id?: unknown }) => parseId(sel?.runner_id));
  if (runnerIds.some((id) => id === null) || new Set(runnerIds).size !== runnerIds.length) {
    throw new HttpError(400, 'Selections must be distinct valid runner_id values');
  }

  return { raceId, betType: bet_type as BetType, runnerIds: runnerIds as number[] };
}

/**
 * Check that betting is open on the race and price the selection from the database odds.
 * With `lock`, the race row is locked so its status cannot change until the transaction ends.
 */
async function priceSelection(
  db: PoolClient | typeof pool,
  raceId: number,
  betType: BetType,
  runnerIds: number[],
  lock = false
): Promise<PricedSelection> {
  const raceResult = await db.query(
    `SELECT id, status, (date + time) <= (now() AT TIME ZONE $2) as started
     FROM races WHERE id = $1 ${lock ? 'FOR SHARE' : ''}`,
    [raceId, RACE_TIMEZONE]
  );
  if (raceResult.rows.length === 0) {
    throw new HttpError(404, 'Race not found');
  }
  // Closed as soon as the race starts, even before the background job marks it running
  if (raceResult.rows[0].status !== 'scheduled' || raceResult.rows[0].started) {
    throw new HttpError(400, 'Betting is closed for this race');
  }

  // Every runner of the race: combined odds depend on the whole field
  const runnersResult = await db.query(
    `SELECT id, saddle_number, COALESCE(final_odds, morning_odds) as odds, non_runner FROM runners WHERE race_id = $1`,
    [raceId]
  );
  const runnersById = new Map(runnersResult.rows.map((runner) => [runner.id as number, runner]));

  if (runnerIds.some((id) => !runnersById.has(id))) {
    throw new HttpError(400, 'All selected runners must belong to this race');
  }
  if (runnerIds.some((id) => runnersById.get(id).non_runner)) {
    throw new HttpError(400, 'A selected horse is a non-runner');
  }
  if (runnerIds.some((id) => !(runnersById.get(id).odds > 1))) {
    throw new HttpError(400, 'Odds are not available for a selected runner');
  }

  const oddsByRunner = new Map(
    runnersResult.rows.filter((runner) => runner.odds > 1 && !runner.non_runner).map((runner) => [runner.id as number, runner.odds as number])
  );

  return {
    // Keep the selection order chosen by the user and snapshot the odds at bet time
    selections: runnerIds.map((id) => {
      const runner = runnersById.get(id);
      return { runner_id: runner.id, saddle_number: runner.saddle_number, odds: runner.odds };
    }),
    odds: combinedOdds(betType, oddsByRunner, runnerIds)
  };
}

export class BetService {
  /**
   * Odds of a bet without placing it, computed exactly as placeBet does.
   */
  async quote(input: PlaceBetInput) {
    const { raceId, betType, runnerIds } = parseSelection(input);
    const priced = await priceSelection(pool, raceId, betType, runnerIds);
    return { race_id: raceId, bet_type: betType, ...priced };
  }

  /**
   * Validate and place a bet for a user, in its own transaction.
   * Used by the API and by the strategy runner. Throws HttpError on invalid input.
   */
  async placeBet(userId: number, input: PlaceBetInput) {
    const { stake, strategy_id } = input;
    const { raceId, betType, runnerIds } = parseSelection(input);
    const amount = parseAmount(stake);

    if (!amount) throw new HttpError(400, 'Invalid stake');
    if (strategy_id != null && !parseId(strategy_id)) throw new HttpError(400, 'Invalid strategy_id');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const priced = await priceSelection(client, raceId, betType, runnerIds, true);

      if (strategy_id != null) {
        const strategyResult = await client.query(
          'SELECT id FROM strategies WHERE id = $1 AND user_id = $2',
          [parseId(strategy_id), userId]
        );
        if (strategyResult.rows.length === 0) {
          throw new HttpError(404, 'Strategy not found');
        }
      }

      // Lock the user row so concurrent requests cannot spend the same funds twice
      const userResult = await client.query(
        'SELECT bankroll FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      const currentBankroll: number = userResult.rows[0].bankroll;

      if (currentBankroll < amount) {
        throw new HttpError(400, 'Insufficient funds');
      }

      const potential_payout = Math.round(amount * priced.odds * 100) / 100;

      const betResult = await client.query(
        `INSERT INTO bets (user_id, race_id, strategy_id, bet_type, selections, stake, potential_payout, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [userId, raceId, strategy_id ?? null, betType, JSON.stringify(priced.selections), amount, potential_payout, 'pending']
      );

      const newBankroll = Math.round((currentBankroll - amount) * 100) / 100;
      await client.query(
        'UPDATE users SET bankroll = $1 WHERE id = $2',
        [newBankroll, userId]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, bet_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, 'BET_PLACED', amount, currentBankroll, newBankroll, betResult.rows[0].id, `Bet placed on race ${raceId}`]
      );

      await client.query('COMMIT');

      return { bet: betResult.rows[0], new_bankroll: newBankroll };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new BetService();
