import pool from '../config/database.js';
import { RACE_TIMEZONE } from '../config/env.js';

export class RaceService {
  /**
   * Mark scheduled races whose start time has passed as running, which closes betting.
   * Returns the ids of the races that were started.
   */
  async startDueRaces(): Promise<number[]> {
    const result = await pool.query(
      `UPDATE races SET status = 'running'
       WHERE status = 'scheduled' AND (date + time) <= (now() AT TIME ZONE $1)
       RETURNING id`,
      [RACE_TIMEZONE]
    );
    return result.rows.map((row) => row.id);
  }
}

export default new RaceService();
