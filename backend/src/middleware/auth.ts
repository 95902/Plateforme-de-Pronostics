import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    username: string;
    role: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'Authentication required',
          status: 401
        }
      });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

    const decoded = jwt.verify(token, jwtSecret) as any;

    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role
    };

    next();
  } catch (error) {
    return res.status(401).json({
      error: {
        message: 'Invalid or expired token',
        status: 401
      }
    });
  }
};

/**
 * Must run after authMiddleware. The role is read from the database so that a
 * demoted user cannot keep using an older token that still says "admin".
 */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user?.id]);

    if (result.rows[0]?.role !== 'admin') {
      return res.status(403).json({
        error: {
          message: 'Admin access required',
          status: 403
        }
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
