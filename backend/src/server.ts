import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/database.js';
import settlementService from './services/settlement.service.js';

// Routes
import authRoutes from './routes/auth.js';
import racesRoutes from './routes/races.js';
import horsesRoutes from './routes/horses.js';
import strategiesRoutes from './routes/strategies.js';
import betsRoutes from './routes/bets.js';
import bankrollRoutes from './routes/bankroll.js';
import predictionsRoutes from './routes/predictions.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '0.0.0.0';
const SETTLEMENT_INTERVAL_MS = 60_000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/races', racesRoutes);
app.use('/api/horses', horsesRoutes);
app.use('/api/strategies', strategiesRoutes);
app.use('/api/bets', betsRoutes);
app.use('/api/bankroll', bankrollRoutes);
app.use('/api/predictions', predictionsRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404
    }
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully');

    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://${HOST}:${PORT}`);
      console.log(`   Health check: http://${HOST}:${PORT}/health`);
      console.log(`   API base: http://${HOST}:${PORT}/api\n`);
    });

    // Settle bets of finished/cancelled races that still have pending bets
    // (e.g. results imported directly into the database)
    const settlePendingBets = async () => {
      try {
        const summaries = await settlementService.settlePendingRaces();
        for (const summary of summaries) {
          console.log(`💰 Race ${summary.race_id} settled: ${summary.won} won, ${summary.lost} lost, ${summary.refunded} refunded`);
        }
      } catch (error) {
        console.error('Settlement job error:', error);
      }
    };
    await settlePendingBets();
    setInterval(settlePendingBets, SETTLEMENT_INTERVAL_MS);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
