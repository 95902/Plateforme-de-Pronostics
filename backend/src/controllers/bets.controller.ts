import { Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';

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
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { race_id, bet_type, selections, stake, strategy_id } = req.body;

      if (!race_id || !bet_type || !selections || !stake || stake <= 0) {
        return res.status(400).json({ error: { message: 'Invalid bet data', status: 400 } });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check bankroll
        const userResult = await client.query(
          'SELECT bankroll FROM users WHERE id = $1',
          [req.user.id]
        );
        const currentBankroll = parseFloat(userResult.rows[0].bankroll);

        if (currentBankroll < stake) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: { message: 'Insufficient funds', status: 400 } });
        }

        // Calculate potential payout (simplified)
        const totalOdds = selections.reduce((acc: number, sel: any) => acc * sel.odds, 1);
        const potential_payout = stake * totalOdds;

        // Create bet
        const betResult = await client.query(
          `INSERT INTO bets (user_id, race_id, strategy_id, bet_type, selections, stake, potential_payout, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [req.user.id, race_id, strategy_id || null, bet_type, JSON.stringify(selections), stake, potential_payout, 'pending']
        );

        // Update bankroll
        const newBankroll = currentBankroll - stake;
        await client.query(
          'UPDATE users SET bankroll = $1 WHERE id = $2',
          [newBankroll, req.user.id]
        );

        // Create transaction
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, bet_id, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.user.id, 'BET_PLACED', stake, currentBankroll, newBankroll, betResult.rows[0].id, `Bet placed on race ${race_id}`]
        );

        await client.query('COMMIT');

        res.status(201).json({
          bet: betResult.rows[0],
          new_bankroll: newBankroll
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Place bet error:', error);
      res.status(500).json({ error: { message: 'Failed to place bet', status: 500 } });
    }
  }

  async cancelBet(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { id } = req.params;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get bet
        const betResult = await client.query(
          'SELECT * FROM bets WHERE id = $1 AND user_id = $2',
          [id, req.user.id]
        );

        if (betResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: { message: 'Bet not found', status: 404 } });
        }

        const bet = betResult.rows[0];

        if (bet.status !== 'pending') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: { message: 'Can only cancel pending bets', status: 400 } });
        }

        // Update bet status
        await client.query(
          'UPDATE bets SET status = $1, settled_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['cancelled', id]
        );

        // Refund stake
        const userResult = await client.query(
          'SELECT bankroll FROM users WHERE id = $1',
          [req.user.id]
        );
        const currentBankroll = parseFloat(userResult.rows[0].bankroll);
        const newBankroll = currentBankroll + parseFloat(bet.stake);

        await client.query(
          'UPDATE users SET bankroll = $1 WHERE id = $2',
          [newBankroll, req.user.id]
        );

        // Create refund transaction
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, bet_id, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.user.id, 'DEPOSIT', bet.stake, currentBankroll, newBankroll, id, 'Bet cancelled - refund']
        );

        await client.query('COMMIT');

        res.json({ message: 'Bet cancelled successfully', new_bankroll: newBankroll });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Cancel bet error:', error);
      res.status(500).json({ error: { message: 'Failed to cancel bet', status: 500 } });
    }
  }
}

export default new BetsController();
