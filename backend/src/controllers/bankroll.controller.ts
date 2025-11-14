import { Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';

export class BankrollController {
  async getBankroll(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const result = await pool.query(
        'SELECT bankroll FROM users WHERE id = $1',
        [req.user.id]
      );

      res.json({
        user_id: req.user.id,
        bankroll: parseFloat(result.rows[0].bankroll)
      });
    } catch (error) {
      console.error('Get bankroll error:', error);
      res.status(500).json({ error: { message: 'Failed to fetch bankroll', status: 500 } });
    }
  }

  async getTransactions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { limit = '20', offset = '0' } = req.query;

      const result = await pool.query(
        `SELECT * FROM transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, parseInt(limit as string), parseInt(offset as string)]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ error: { message: 'Failed to fetch transactions', status: 500 } });
    }
  }

  async deposit(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: { message: 'Invalid amount', status: 400 } });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get current bankroll
        const userResult = await client.query(
          'SELECT bankroll FROM users WHERE id = $1',
          [req.user.id]
        );
        const currentBankroll = parseFloat(userResult.rows[0].bankroll);
        const newBankroll = currentBankroll + parseFloat(amount);

        // Update bankroll
        await client.query(
          'UPDATE users SET bankroll = $1 WHERE id = $2',
          [newBankroll, req.user.id]
        );

        // Create transaction
        const transactionResult = await client.query(
          `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, description)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [req.user.id, 'DEPOSIT', amount, currentBankroll, newBankroll, 'Deposit']
        );

        await client.query('COMMIT');

        res.json({
          transaction: transactionResult.rows[0],
          new_bankroll: newBankroll
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Deposit error:', error);
      res.status(500).json({ error: { message: 'Deposit failed', status: 500 } });
    }
  }

  async withdraw(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: { message: 'Invalid amount', status: 400 } });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get current bankroll
        const userResult = await client.query(
          'SELECT bankroll FROM users WHERE id = $1',
          [req.user.id]
        );
        const currentBankroll = parseFloat(userResult.rows[0].bankroll);

        if (currentBankroll < parseFloat(amount)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: { message: 'Insufficient funds', status: 400 } });
        }

        const newBankroll = currentBankroll - parseFloat(amount);

        // Update bankroll
        await client.query(
          'UPDATE users SET bankroll = $1 WHERE id = $2',
          [newBankroll, req.user.id]
        );

        // Create transaction
        const transactionResult = await client.query(
          `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, description)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [req.user.id, 'WITHDRAWAL', amount, currentBankroll, newBankroll, 'Withdrawal']
        );

        await client.query('COMMIT');

        res.json({
          transaction: transactionResult.rows[0],
          new_bankroll: newBankroll
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Withdraw error:', error);
      res.status(500).json({ error: { message: 'Withdrawal failed', status: 500 } });
    }
  }

  async getStatistics(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      // Get current bankroll
      const bankrollResult = await pool.query(
        'SELECT bankroll FROM users WHERE id = $1',
        [req.user.id]
      );

      // Get total deposits and withdrawals
      const transactionsResult = await pool.query(
        `SELECT
          SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE 0 END) as total_deposits,
          SUM(CASE WHEN type = 'WITHDRAWAL' THEN amount ELSE 0 END) as total_withdrawals,
          SUM(CASE WHEN type = 'BET_WON' THEN amount ELSE 0 END) as total_winnings,
          SUM(CASE WHEN type = 'BET_PLACED' THEN amount ELSE 0 END) as total_staked
         FROM transactions
         WHERE user_id = $1`,
        [req.user.id]
      );

      // Get bet statistics
      const betsResult = await pool.query(
        `SELECT
          COUNT(*) as total_bets,
          SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as winning_bets,
          SUM(stake) as total_staked,
          SUM(actual_payout) as total_returned
         FROM bets
         WHERE user_id = $1`,
        [req.user.id]
      );

      const stats = transactionsResult.rows[0];
      const bets = betsResult.rows[0];

      const totalStaked = parseFloat(bets.total_staked || 0);
      const totalReturned = parseFloat(bets.total_returned || 0);
      const netProfit = totalReturned - totalStaked;
      const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : 0;

      res.json({
        current_bankroll: parseFloat(bankrollResult.rows[0].bankroll),
        total_deposits: parseFloat(stats.total_deposits || 0),
        total_withdrawals: parseFloat(stats.total_withdrawals || 0),
        total_bets: parseInt(bets.total_bets || 0),
        winning_bets: parseInt(bets.winning_bets || 0),
        win_rate: parseInt(bets.total_bets) > 0 ? (parseInt(bets.winning_bets) / parseInt(bets.total_bets)) * 100 : 0,
        total_staked: totalStaked,
        total_returned: totalReturned,
        net_profit: netProfit,
        roi: roi
      });
    } catch (error) {
      console.error('Get statistics error:', error);
      res.status(500).json({ error: { message: 'Failed to fetch statistics', status: 500 } });
    }
  }
}

export default new BankrollController();
