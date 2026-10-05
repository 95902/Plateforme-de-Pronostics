import type { PoolClient } from 'pg';
import pool from '../config/database.js';

/** Number of top finishers a bet must match, in any order */
const PLACES_BY_BET_TYPE: Record<string, number> = {
  simple: 1,
  couple: 2,
  trio: 3,
  quarte: 4,
  quinte: 5
};

// Upper bounds of the strategies.roi DECIMAL(8,4) and avg_odds DECIMAL(6,2) columns
const MAX_ROI = 9999.9999;
const MAX_AVG_ODDS = 9999.99;

export interface SettlementSummary {
  race_id: number;
  won: number;
  lost: number;
  refunded: number;
}

/**
 * A bet wins when its selections are exactly the first N finishers (any order),
 * N being 1 for simple, 2 for couple, 3 for trio, 4 for quarte and 5 for quinte.
 * finishOrder lists runner ids by finish position, disqualified runners excluded.
 */
export function isWinningBet(betType: string, selectionRunnerIds: number[], finishOrder: number[]): boolean {
  const places = PLACES_BY_BET_TYPE[betType];
  if (!places || selectionRunnerIds.length !== places || finishOrder.length < places) {
    return false;
  }

  const topFinishers = new Set(finishOrder.slice(0, places));
  return selectionRunnerIds.every((id) => topFinishers.has(id));
}

export class SettlementService {
  /**
   * Settle every pending bet of a finished or cancelled race.
   * Safe to call repeatedly: only pending bets are touched.
   * Returns null if the race does not exist.
   */
  async settleRace(raceId: number): Promise<SettlementSummary | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const summary = await this.settleRaceInTransaction(client, raceId);
      await client.query('COMMIT');
      return summary;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Settle a race inside a transaction opened by the caller.
   * Lock order (race, then bets, then users) matches bet placement and cancellation.
   */
  async settleRaceInTransaction(client: PoolClient, raceId: number): Promise<SettlementSummary | null> {
    const summary: SettlementSummary = { race_id: raceId, won: 0, lost: 0, refunded: 0 };

    const raceResult = await client.query(
      'SELECT id, status FROM races WHERE id = $1 FOR UPDATE',
      [raceId]
    );
    if (raceResult.rows.length === 0) return null;

    const raceStatus: string = raceResult.rows[0].status;
    if (raceStatus !== 'finished' && raceStatus !== 'cancelled') return summary;

    let finishOrder: number[] = [];
    if (raceStatus === 'finished') {
      const resultsResult = await client.query(
        `SELECT runner_id FROM results
         WHERE race_id = $1 AND NOT disqualified
         ORDER BY finish_position`,
        [raceId]
      );
      finishOrder = resultsResult.rows.map((row) => row.runner_id);

      // Results not recorded yet: leave the bets pending
      if (finishOrder.length === 0) return summary;
    }

    const betsResult = await client.query(
      `SELECT * FROM bets WHERE race_id = $1 AND status = 'pending' ORDER BY id FOR UPDATE`,
      [raceId]
    );

    const strategyIds = new Set<number>();

    for (const bet of betsResult.rows) {
      if (bet.strategy_id) strategyIds.add(bet.strategy_id);

      if (raceStatus === 'cancelled') {
        await client.query(
          `UPDATE bets SET status = 'cancelled', settled_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [bet.id]
        );
        await this.creditUser(client, bet.user_id, bet.stake, 'DEPOSIT', bet.id, `Race ${raceId} cancelled - refund`);
        summary.refunded++;
        continue;
      }

      const selectionRunnerIds = (bet.selections as { runner_id: number }[]).map((sel) => sel.runner_id);

      if (isWinningBet(bet.bet_type, selectionRunnerIds, finishOrder)) {
        await client.query(
          `UPDATE bets SET status = 'won', actual_payout = $1, settled_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [bet.potential_payout, bet.id]
        );
        await this.creditUser(client, bet.user_id, bet.potential_payout, 'BET_WON', bet.id, `Bet won on race ${raceId}`);
        summary.won++;
      } else {
        // The stake was already debited when the bet was placed
        await client.query(
          `UPDATE bets SET status = 'lost', actual_payout = 0, settled_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [bet.id]
        );
        summary.lost++;
      }
    }

    for (const strategyId of strategyIds) {
      await this.updateStrategyStats(client, strategyId);
    }

    return summary;
  }

  /**
   * Settle all finished or cancelled races that still have pending bets.
   */
  async settlePendingRaces(): Promise<SettlementSummary[]> {
    const racesResult = await pool.query(
      `SELECT DISTINCT r.id
       FROM races r
       JOIN bets b ON b.race_id = r.id
       WHERE r.status IN ('finished', 'cancelled') AND b.status = 'pending'
       ORDER BY r.id`
    );

    const summaries: SettlementSummary[] = [];
    for (const { id } of racesResult.rows) {
      const summary = await this.settleRace(id);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  /**
   * Recompute a strategy's performance from its settled bets.
   */
  async updateStrategyStats(client: PoolClient, strategyId: number): Promise<void> {
    const statsResult = await client.query(
      `SELECT
        COUNT(*)::int as total_bets,
        COUNT(*) FILTER (WHERE status = 'won')::int as winning_bets,
        COALESCE(SUM(stake), 0) as total_staked,
        COALESCE(SUM(actual_payout), 0) as total_returned,
        COALESCE(AVG(potential_payout / stake), 0) as avg_odds
       FROM bets
       WHERE strategy_id = $1 AND status IN ('won', 'lost')`,
      [strategyId]
    );
    const stats = statsResult.rows[0];

    const roi = stats.total_staked > 0 ? (stats.total_returned - stats.total_staked) / stats.total_staked : 0;
    const winRate = stats.total_bets > 0 ? stats.winning_bets / stats.total_bets : 0;

    await client.query(
      `UPDATE strategies
       SET total_bets = $1, winning_bets = $2, total_staked = $3, total_returned = $4,
           roi = $5, win_rate = $6, avg_odds = $7
       WHERE id = $8`,
      [
        stats.total_bets,
        stats.winning_bets,
        stats.total_staked,
        stats.total_returned,
        Math.round(Math.min(roi, MAX_ROI) * 10000) / 10000,
        Math.round(winRate * 10000) / 10000,
        Math.round(Math.min(stats.avg_odds, MAX_AVG_ODDS) * 100) / 100,
        strategyId
      ]
    );
  }

  private async creditUser(
    client: PoolClient,
    userId: number,
    amount: number,
    type: 'DEPOSIT' | 'BET_WON',
    betId: number,
    description: string
  ): Promise<void> {
    const userResult = await client.query(
      'SELECT bankroll FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const currentBankroll: number = userResult.rows[0].bankroll;
    const newBankroll = Math.round((currentBankroll + amount) * 100) / 100;

    await client.query('UPDATE users SET bankroll = $1 WHERE id = $2', [newBankroll, userId]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, bet_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, amount, currentBankroll, newBankroll, betId, description]
    );
  }
}

export default new SettlementService();
