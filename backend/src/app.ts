import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { isProduction } from './config/env.js';

// Routes
import authRoutes from './routes/auth.js';
import racesRoutes from './routes/races.js';
import horsesRoutes from './routes/horses.js';
import strategiesRoutes from './routes/strategies.js';
import betsRoutes from './routes/bets.js';
import bankrollRoutes from './routes/bankroll.js';
import predictionsRoutes from './routes/predictions.js';

export interface AppOptions {
  /** Max login/register attempts per IP per 15 minutes */
  authRateLimit?: number;
  /** Log every request (disabled in tests) */
  logRequests?: boolean;
}

/**
 * Build the Express application (no listening, no background jobs),
 * so tests can mount it on an ephemeral port.
 */
export function createApp({
  authRateLimit = Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  logRequests = true
}: AppOptions = {}) {
  const app = express();

  // Number of reverse proxies in front of the API, so req.ip is the client's IP
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  }

  // Middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Logging middleware
  if (logRequests) {
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Slow down password guessing and mass account creation
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts, please try again later', status: 429 } }
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/races', racesRoutes);
  app.use('/api/horses', horsesRoutes);
  app.use('/api/strategies', strategiesRoutes);
  app.use('/api/bets', betsRoutes);
  app.use('/api/bankroll', bankrollRoutes);
  app.use('/api/predictions', predictionsRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: {
        message: 'Route not found',
        status: 404
      }
    });
  });

  // Error handling middleware (e.g. malformed JSON bodies)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
      console.error('Error:', err);
    }
    res.status(status).json({
      error: {
        // Don't leak internal details of unexpected errors in production
        message: status >= 500 && isProduction ? 'Internal server error' : err.message || 'Internal server error',
        status
      }
    });
  });

  return app;
}
