import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { AuthRequest } from '../middleware/auth.js';

export class AuthController {
  async register(req: Request, res: Response) {
    try {
      const { email, username, password } = req.body;

      // Validation
      if (!email || !username || !password) {
        return res.status(400).json({
          error: { message: 'Email, username, and password are required', status: 400 }
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          error: { message: 'Password must be at least 6 characters', status: 400 }
        });
      }

      // Check if user exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: { message: 'User already exists', status: 409 }
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const result = await pool.query(
        `INSERT INTO users (email, username, password, role, bankroll)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, username, role, bankroll, created_at`,
        [email, username, hashedPassword, 'user', 1000]
      );

      const user = result.rows[0];

      // Create initial bankroll transaction
      await pool.query(
        `INSERT INTO transactions (user_id, type, amount, bankroll_before, bankroll_after, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, 'DEPOSIT', 1000, 0, 1000, 'Initial deposit']
      );

      // Generate JWT
      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
      const token = jwt.sign(
        { id: user.id, email: user.email, username: user.username, role: user.role },
        jwtSecret,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          bankroll: parseFloat(user.bankroll),
          created_at: user.created_at
        },
        token
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({
        error: { message: 'Registration failed', status: 500 }
      });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: { message: 'Email and password are required', status: 400 }
        });
      }

      // Find user
      const result = await pool.query(
        'SELECT id, email, username, password, role, bankroll FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: { message: 'Invalid credentials', status: 401 }
        });
      }

      const user = result.rows[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({
          error: { message: 'Invalid credentials', status: 401 }
        });
      }

      // Generate JWT
      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
      const token = jwt.sign(
        { id: user.id, email: user.email, username: user.username, role: user.role },
        jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          bankroll: parseFloat(user.bankroll)
        },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: { message: 'Login failed', status: 500 }
      });
    }
  }

  async me(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { message: 'Authentication required', status: 401 }
        });
      }

      const result = await pool.query(
        'SELECT id, email, username, role, bankroll, preferences, created_at FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: { message: 'User not found', status: 404 }
        });
      }

      const user = result.rows[0];

      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        bankroll: parseFloat(user.bankroll),
        preferences: user.preferences,
        created_at: user.created_at
      });
    } catch (error) {
      console.error('Me error:', error);
      res.status(500).json({
        error: { message: 'Failed to fetch user', status: 500 }
      });
    }
  }
}

export default new AuthController();
