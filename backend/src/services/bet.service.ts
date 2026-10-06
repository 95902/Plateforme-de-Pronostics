import pool from '../config/database.js';
import { parseAmount, parseId } from '../utils/validation.js';
import { HttpError } from '../utils/http-error.js';

const SELECTIONS_BY_BET_TYPE: Record<string, number> = {
  simple: 1,
  couple: 2,
  trio: 3,
  quarte: 4,
  quinte: 5
};

export interface PlaceBetInput {
  race_id?: unknown;
  bet_type?: unknown;
  selections?: unknown;
  stake?: unknown;
  strategy_id?: unknown;
}

export class BetService {
  /**
   * Validate and place a bet for a user, in its own transaction.
   * Used by the API and by the strategy runner. Throws HttpError on invalid input.
   */
  async placeBet(userId: number, input: PlaceBetInput) {
    const { race_id, bet_type, selections, stake, strategy_id } = input;

    const raceId = parseId(race_id);
    const amount = parseAmount(stake);
    const requiredSelections = SELECTIONS_BY_BET_TYPE[bet_type as string];

    if (!raceId) throw new HttpError(400, 'Invalid race_id');
    if (!amount) throw new HttpError(400, 'Invalid stake');
    if (!requiredSelections) throw new HttpError(400, 'Invalid bet_type');
    if (strategy_id != null && !parseId(strategy_id)) throw new HttpError(400, 'Invalid strategy_id');

    if (!Array.isArray(selections) || selections.length !== requiredSelections) {
      throw new HttpError(400, `A ${bet_type} bet requires exactly ${requiredSelections} selection(s)`);
    }

    // Only runner ids are taken from the client; odds always come from the database
    const runnerIds = selections.map((sel: { runner_id?: unknown }) => parseId(sel?.runner_id));
    if (runnerIds.some((id) => id === null) || new Set(runnerIds).size !== runnerIds.length) {
      throw new HttpError(400, 'Selections must be distinct valid runner_id values');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the race row so its status cannot change while the bet is placed
      const raceResult = await client.query(
        'SELECT id, status FROM races WHERE id = $1 FOR SHARE',
        [raceId]
      );
      if (raceResult.rows.length === 0) {
        throw new HttpError(404, 'Race not found');
      }
      if (raceResult.rows[0].status !== 'scheduled') {
        throw new HttpError(400, 'Betting is closed for this race');
      }

      const runnersResult = await client.query(
        `SELECT id, saddle_number, COALESCE(final_odds, morning_odds) as odds
         FROM runners
         WHERE race_id = $1 AND id = ANY($2::int[])`,
        [raceId, runnerIds]
      );
      if (runnersResult.rows.length !== runnerIds.length) {
        throw new HttpError(400, 'All selected runners must belong to this race');
      }
      if (runnersResult.rows.some((runner) => !runner.odds || runner.odds <= 1)) {
        throw new HttpError(400, 'Odds are not available for a selected runner');
      }

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

      // Keep the selection order chosen by the user and snapshot the odds at bet time
      const runnersById = new Map(runnersResult.rows.map((runner) => [runner.id, runner]));
      const betSelections = runnerIds.map((id) => {
        const runner = runnersById.get(id)!;
        return { runner_id: runner.id, saddle_number: runner.saddle_number, odds: runner.odds };
      });

      // Calculate potential payout (simplified: product of the selected odds)
      const totalOdds = betSelections.reduce((acc, sel) => acc * sel.odds, 1);
      const potential_payout = Math.round(amount * totalOdds * 100) / 100;

      const betResult = await client.query(
        `INSERT INTO bets (user_id, race_id, strategy_id, bet_type, selections, stake, potential_payout, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [userId, raceId, strategy_id ?? null, bet_type, JSON.stringify(betSelections), amount, potential_payout, 'pending']
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
