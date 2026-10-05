import { Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';
import betService from '../services/bet.service.js';
import { parseId } from '../utils/validation.js';
import { HttpError, sendError } from '../utils/http-error.js';

const badRequest = (res: Response, message: string) => sendError(res, 400, message);

export class BetsController {
  async getBets(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { status, limit = '20', offset = '0' } = req.query;

      let query = `
        SELECT b.*, r.name as race_name, r.date as race_date, r.time as race_time,
               r.status as race_status, h.name as hippodrome_name, s.name as strategy_name
        FROM bets b
        JOIN races r ON b.race_id = r.id
        JOIN hippodromes h ON r.hippodrome_id = h.id
        LEFT JOIN strategies s ON b.strategy_id = s.id
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

    try {
      const result = await betService.placeBet(req.user.id, req.body);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(res, error.status, error.message);
      }
      console.error('Place bet error:', error);
      res.status(500).json({ error: { message: 'Failed to place bet', status: 500 } });
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

      // Lock the race, then the bet (same order as settlement) so the race status
      // cannot change meanwhile and the same bet cannot be refunded twice
      const raceResult = await client.query(
        `SELECT r.status FROM races r
         WHERE r.id = (SELECT race_id FROM bets WHERE id = $1 AND user_id = $2)
         FOR SHARE`,
        [betId, req.user.id]
      );

      const betResult = await client.query(
        'SELECT * FROM bets WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [betId, req.user.id]
      );

      if (raceResult.rows.length === 0 || betResult.rows.length === 0) {
        throw new HttpError(404, 'Bet not found');
      }

      const bet = betResult.rows[0];

      if (bet.status !== 'pending') {
        throw new HttpError(400, 'Can only cancel pending bets');
      }
      if (raceResult.rows[0].status !== 'scheduled') {
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
        return sendError(res, error.status, error.message);
      }
      console.error('Cancel bet error:', error);
      res.status(500).json({ error: { message: 'Failed to cancel bet', status: 500 } });
    } finally {
      client.release();
    }
  }
}

export default new BetsController();
