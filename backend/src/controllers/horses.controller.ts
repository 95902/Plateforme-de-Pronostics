import { Request, Response } from 'express';
import pool from '../config/database.js';

export class HorsesController {
  async getHorses(req: Request, res: Response) {
    try {
      const { limit = '20', offset = '0', search } = req.query;

      let query = 'SELECT * FROM horses WHERE 1=1';
      const params: any[] = [];
      let paramCount = 0;

      if (search) {
        params.push(`%${search}%`);
        query += ` AND name ILIKE $${++paramCount}`;
      }

      query += ` ORDER BY career_wins DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await pool.query(query, params);

      res.json(result.rows);
    } catch (error) {
      console.error('Get horses error:', error);
      res.status(500).json({ error: { message: 'Failed to fetch horses', status: 500 } });
    }
  }

  async getHorseById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const horseResult = await pool.query(
        'SELECT * FROM horses WHERE id = $1',
        [id]
      );

      if (horseResult.rows.length === 0) {
        return res.status(404).json({ error: { message: 'Horse not found', status: 404 } });
      }

      // Get recent races
      const racesResult = await pool.query(
        `SELECT r.*, race.name as race_name, race.date, race.distance,
                res.finish_position, res.finish_time
         FROM runners r
         JOIN races race ON r.race_id = race.id
         LEFT JOIN results res ON res.runner_id = r.id
         WHERE r.horse_id = $1 AND race.status = 'finished'
         ORDER BY race.date DESC
         LIMIT 10`,
        [id]
      );

      res.json({
        ...horseResult.rows[0],
        recent_races: racesResult.rows
      });
    } catch (error) {
      console.error('Get horse error:', error);
      res.status(500).json({ error: { message: 'Failed to fetch horse', status: 500 } });
    }
  }
}

export default new HorsesController();
