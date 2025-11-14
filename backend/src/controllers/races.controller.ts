import { Request, Response } from 'express';
import pool from '../config/database.js';

export class RacesController {
  async getRaces(req: Request, res: Response) {
    try {
      const {
        status = 'all',
        hippodrome_id,
        date,
        limit = '20',
        offset = '0'
      } = req.query;

      let query = `
        SELECT r.*, h.name as hippodrome_name, h.city, h.country, h.track_type
        FROM races r
        JOIN hippodromes h ON r.hippodrome_id = h.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 0;

      if (status !== 'all') {
        params.push(status);
        query += ` AND r.status = $${++paramCount}`;
      }

      if (hippodrome_id) {
        params.push(hippodrome_id);
        query += ` AND r.hippodrome_id = $${++paramCount}`;
      }

      if (date) {
        params.push(date);
        query += ` AND r.date = $${++paramCount}`;
      }

      query += ` ORDER BY r.date DESC, r.race_number ASC`;

      params.push(parseInt(limit as string));
      query += ` LIMIT $${++paramCount}`;

      params.push(parseInt(offset as string));
      query += ` OFFSET $${++paramCount}`;

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM races r WHERE 1=1';
      const countParams: any[] = [];
      let countParamCount = 0;

      if (status !== 'all') {
        countParams.push(status);
        countQuery += ` AND r.status = $${++countParamCount}`;
      }

      if (hippodrome_id) {
        countParams.push(hippodrome_id);
        countQuery += ` AND r.hippodrome_id = $${++countParamCount}`;
      }

      if (date) {
        countParams.push(date);
        countQuery += ` AND r.date = $${++countParamCount}`;
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      res.json({
        data: result.rows,
        meta: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      });
    } catch (error) {
      console.error('Get races error:', error);
      res.status(500).json({
        error: { message: 'Failed to fetch races', status: 500 }
      });
    }
  }

  async getRaceById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const raceResult = await pool.query(
        `SELECT r.*, h.name as hippodrome_name, h.city, h.country, h.track_type, h.surface, h.configuration
         FROM races r
         JOIN hippodromes h ON r.hippodrome_id = h.id
         WHERE r.id = $1`,
        [id]
      );

      if (raceResult.rows.length === 0) {
        return res.status(404).json({
          error: { message: 'Race not found', status: 404 }
        });
      }

      const race = raceResult.rows[0];

      // Get runners with horse, jockey, trainer details
      const runnersResult = await pool.query(
        `SELECT
          r.id, r.saddle_number, r.barrier_draw, r.weight_carried, r.handicap,
          r.morning_odds, r.final_odds, r.prediction_score, r.confidence_level,
          h.id as horse_id, h.name as horse_name, h.age as horse_age, h.sex as horse_sex,
          h.career_total_races, h.career_wins, h.career_win_rate,
          j.id as jockey_id, j.name as jockey_name, j.weight as jockey_weight,
          j.career_win_rate as jockey_win_rate,
          t.id as trainer_id, t.name as trainer_name, t.stable_name,
          t.career_win_rate as trainer_win_rate
         FROM runners r
         JOIN horses h ON r.horse_id = h.id
         JOIN jockeys j ON r.jockey_id = j.id
         JOIN trainers t ON r.trainer_id = t.id
         WHERE r.race_id = $1
         ORDER BY r.saddle_number`,
        [id]
      );

      // Get results if race is finished
      let results = [];
      if (race.status === 'finished') {
        const resultsResult = await pool.query(
          `SELECT res.*, r.saddle_number, h.name as horse_name
           FROM results res
           JOIN runners r ON res.runner_id = r.id
           JOIN horses h ON r.horse_id = h.id
           WHERE res.race_id = $1
           ORDER BY res.finish_position`,
          [id]
        );
        results = resultsResult.rows;
      }

      res.json({
        ...race,
        runners: runnersResult.rows,
        results
      });
    } catch (error) {
      console.error('Get race by ID error:', error);
      res.status(500).json({
        error: { message: 'Failed to fetch race', status: 500 }
      });
    }
  }

  async getUpcomingRaces(req: Request, res: Response) {
    try {
      const { limit = '10' } = req.query;

      const result = await pool.query(
        `SELECT r.*, h.name as hippodrome_name, h.city, h.country
         FROM races r
         JOIN hippodromes h ON r.hippodrome_id = h.id
         WHERE r.status = 'scheduled' AND r.date >= CURRENT_DATE
         ORDER BY r.date ASC, r.time ASC
         LIMIT $1`,
        [parseInt(limit as string)]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Get upcoming races error:', error);
      res.status(500).json({
        error: { message: 'Failed to fetch upcoming races', status: 500 }
      });
    }
  }

  async getTodayRaces(req: Request, res: Response) {
    try {
      const result = await pool.query(
        `SELECT r.*, h.name as hippodrome_name, h.city, h.country, h.track_type
         FROM races r
         JOIN hippodromes h ON r.hippodrome_id = h.id
         WHERE r.date = CURRENT_DATE
         ORDER BY r.time ASC`,
        []
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Get today races error:', error);
      res.status(500).json({
        error: { message: 'Failed to fetch today races', status: 500 }
      });
    }
  }
}

export default new RacesController();
