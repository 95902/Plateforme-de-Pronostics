import { Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import { parseAmount, parseId } from '../utils/validation.js';

const SELECTIONS_BY_BET_TYPE: Record<string, number> = {
  simple: 1,
  couple: 2,
  trio: 3,
  quarte: 4,
  quinte: 5
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ error: { message, status: 400 } });

export class BetsController {
  async getBets(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { status, limit = '20', offset = '0' } = req.query;

      let query = `
        SELECT b.*, r.name as race_name, r.date as race_date
        FROM bets b
        JOIN races r ON b.race_id = r.id
        WHERE b.user_id = $1
      `;
      const params: any[] = [req.user.id];
      let paramCount = 1;

      if (status) {
        params.push(status);
        query += ` AND b.status = $${++paramCount}`;
      }

      query += ` ORDER BY b.placed_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await pool.query(query, params);

      res.json(result.rows);
    } catch (error) {
      console.error('Get bets error:', error);
      res.status(500).json({ error: { message: 'Failed to fetch bets', status: 500 } });
    }
  }

  async placeBet(req: AuthRequest, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    }

    const { race_id, bet_type, selections, stake, strategy_id } = req.body;

    const raceId = parseId(race_id);
    const amount = parseAmount(stake);
    const requiredSelections = SELECTIONS_BY_BET_TYPE[bet_type as string];

    if (!raceId) return badRequest(res, 'Invalid race_id');
    if (!amount) return badRequest(res, 'Invalid stake');
    if (!requiredSelections) return badRequest(res, 'Invalid bet_type');
    if (strategy_id != null && !parseId(strategy_id)) return badRequest(res, 'Invalid strategy_id');

    if (!Array.isArray(selections) || selections.length !== requiredSelections) {
      return badRequest(res, `A ${bet_type} bet requires exactly ${requiredSelections} selection(s)`);
    }

    // Only runner ids are taken from the client; odds always come from the database
    const runnerIds = selections.map((sel: any) => parseId(sel?.runner_id));
    if (runnerIds.some((id) => id === null) || new Set(runnerIds).size !== runnerIds.length) {
      return badRequest(res, 'Selections must be distinct valid runner_id values');
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
          [parseId(strategy_id), req.user.id]
        );
        if (strategyResult.rows.length === 0) {
          throw new HttpError(404, 'Strategy not found');
        }
      }

      // Lock the user row so concurrent requests cannot spend the same funds twice
      const userResult = await client.query(
        'SELECT bankroll FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
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
        [req.user.id, raceId, strategy_id ?? null, bet_type, JSON.stringify(betSelections), amount, potential_payout, 'pending']
      );

      const newBankroll = Math.round((currentBankroll - amount) * 100) / 100;
      await client.query(
        'UPDATE users SET bankroll = $1 WHERE id = $2',
        [newBankroll, req.user.id]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, bet_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.user.id, 'BET_PLACED', amount, currentBankroll, newBankroll, betResult.rows[0].id, `Bet placed on race ${raceId}`]
      );

      await client.query('COMMIT');

      res.status(201).json({
        bet: betResult.rows[0],
        new_bankroll: newBankroll
      });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: { message: error.message, status: error.status } });
      }
      console.error('Place bet error:', error);
      res.status(500).json({ error: { message: 'Failed to place bet', status: 500 } });
    } finally {
      client.release();
    }
  }

  async cancelBet(req: AuthRequest, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    }

    const betId = parseId(req.params.id);
    if (!betId) return badRequest(res, 'Invalid bet id');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the bet row so the same bet cannot be refunded twice
      const betResult = await client.query(
        `SELECT b.*, r.status as race_status
         FROM bets b
         JOIN races r ON b.race_id = r.id
         WHERE b.id = $1 AND b.user_id = $2
         FOR UPDATE OF b`,
        [betId, req.user.id]
      );

      if (betResult.rows.length === 0) {
        throw new HttpError(404, 'Bet not found');
      }

      const bet = betResult.rows[0];

      if (bet.status !== 'pending') {
        throw new HttpError(400, 'Can only cancel pending bets');
      }
      if (bet.race_status !== 'scheduled') {
        throw new HttpError(400, 'Cannot cancel a bet once the race has started');
      }

      await client.query(
        'UPDATE bets SET status = $1, settled_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['cancelled', betId]
      );

      const userResult = await client.query(
        'SELECT bankroll FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const currentBankroll: number = userResult.rows[0].bankroll;
      const newBankroll = Math.round((currentBankroll + bet.stake) * 100) / 100;

      await client.query(
        'UPDATE users SET bankroll = $1 WHERE id = $2',
        [newBankroll, req.user.id]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, bet_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.user.id, 'DEPOSIT', bet.stake, currentBankroll, newBankroll, betId, 'Bet cancelled - refund']
      );

      await client.query('COMMIT');

      res.json({ message: 'Bet cancelled successfully', new_bankroll: newBankroll });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: { message: error.message, status: error.status } });
      }
      console.error('Cancel bet error:', error);
      res.status(500).json({ error: { message: 'Failed to cancel bet', status: 500 } });
    } finally {
      client.release();
    }
  }
}

export default new BetsController();
