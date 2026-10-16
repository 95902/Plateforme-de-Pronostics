import pool from '../config/database.js';

export interface TipInput {
  tipster: string;
  /** Saddle numbers, in the tipster's order */
  selection: number[];
  is_consensus?: boolean;
}

export class TipsService {
  /**
   * Replace the tips of a race from one source (the latest fetch wins). Returns false when no race
   * has this external id (import the race first).
   */
  async replaceTips(raceExternalId: string, source: string, tips: TipInput[]): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const race = await client.query('SELECT id FROM races WHERE external_id = $1 FOR UPDATE', [raceExternalId]);
      if (race.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const raceId = race.rows[0].id;
      await client.query('DELETE FROM race_tips WHERE race_id = $1 AND source = $2', [raceId, source]);
      for (const tip of tips) {
        await client.query(
          `INSERT INTO race_tips (race_id, source, tipster, selection, is_consensus) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (race_id, source, tipster) DO UPDATE SET selection = EXCLUDED.selection, is_consensus = EXCLUDED.is_consensus`,
          [raceId, source, tip.tipster, tip.selection, tip.is_consensus === true]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Tips of a race, the synthesis of each source last */
  async getRaceTips(raceId: number | string) {
    const result = await pool.query(
      `SELECT source, tipster, selection, is_consensus, fetched_at FROM race_tips
       WHERE race_id = $1 ORDER BY source, is_consensus, id`,
      [raceId]
    );
    return result.rows;
  }
}

export default new TipsService();
