import { Response } from 'express';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';

const STRATEGY_TYPES = [
  'FAVORITE',
  'VALUE_BETTING',
  'MARTINGALE',
  'FIBONACCI',
  'KELLY_CRITERION',
  'DUTCHING',
  'FIXED_PERCENTAGE',
  'CUSTOM'
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class StrategiesController {
  async getStrategies(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const result = await pool.query(
        'SELECT * FROM strategies WHERE user_id = $1 ORDER BY created_at DESC',
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Get strategies error:', error);
      res.status(500).json({ error: { message: 'Failed to fetch strategies', status: 500 } });
    }
  }

  async getStrategyById(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM strategies WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: { message: 'Strategy not found', status: 404 } });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Get strategy error:', error);
      res.status(500).json({ error: { message: 'Failed to fetch strategy', status: 500 } });
    }
  }

  async createStrategy(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { name, type, description, parameters, is_active } = req.body;

      if (typeof name !== 'string' || name.trim() === '' || name.length > 255) {
        return res.status(400).json({ error: { message: 'Name is required (max 255 characters)', status: 400 } });
      }
      if (!STRATEGY_TYPES.includes(type)) {
        return res.status(400).json({ error: { message: `Type must be one of ${STRATEGY_TYPES.join(', ')}`, status: 400 } });
      }
      if (!isPlainObject(parameters)) {
        return res.status(400).json({ error: { message: 'Parameters must be a JSON object', status: 400 } });
      }

      const result = await pool.query(
        `INSERT INTO strategies (user_id, name, type, description, parameters, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.user.id, name.trim(), type, description || '', JSON.stringify(parameters), is_active === true]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create strategy error:', error);
      res.status(500).json({ error: { message: 'Failed to create strategy', status: 500 } });
    }
  }

  async updateStrategy(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { id } = req.params;
      const { name, description, parameters, is_active } = req.body;

      if (name !== undefined && (typeof name !== 'string' || name.trim() === '' || name.length > 255)) {
        return res.status(400).json({ error: { message: 'Name must be a non-empty string (max 255 characters)', status: 400 } });
      }
      if (parameters !== undefined && !isPlainObject(parameters)) {
        return res.status(400).json({ error: { message: 'Parameters must be a JSON object', status: 400 } });
      }
      if (is_active !== undefined && typeof is_active !== 'boolean') {
        return res.status(400).json({ error: { message: 'is_active must be a boolean', status: 400 } });
      }

      const result = await pool.query(
        `UPDATE strategies
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             parameters = COALESCE($3, parameters),
             is_active = COALESCE($4, is_active),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 AND user_id = $6
         RETURNING *`,
        [name, description, parameters ? JSON.stringify(parameters) : null, is_active, id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: { message: 'Strategy not found', status: 404 } });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Update strategy error:', error);
      res.status(500).json({ error: { message: 'Failed to update strategy', status: 500 } });
    }
  }

  async deleteStrategy(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      }

      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM strategies WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: { message: 'Strategy not found', status: 404 } });
      }

      res.json({ message: 'Strategy deleted successfully' });
    } catch (error) {
      console.error('Delete strategy error:', error);
      res.status(500).json({ error: { message: 'Failed to delete strategy', status: 500 } });
    }
  }
}

export default new StrategiesController();
