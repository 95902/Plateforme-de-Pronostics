import pool from './config/database.js';
import { createApp } from './app.js';
import settlementService from './services/settlement.service.js';
import strategyService from './services/strategy.service.js';

const app = createApp();
const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '0.0.0.0';
const BACKGROUND_JOBS_INTERVAL_MS = 60_000;

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

    // Let active strategies bet on races starting soon
    const runActiveStrategies = async () => {
      try {
        const { placed, skipped } = await strategyService.runActiveStrategies();
        if (placed + skipped > 0) {
          console.log(`🤖 Strategies placed ${placed} bet(s), skipped ${skipped}`);
        }
      } catch (error) {
        console.error('Strategy runner error:', error);
      }
    };

    // Run the jobs one after the other and never let two runs overlap
    let jobsRunning = false;
    const runBackgroundJobs = async () => {
      if (jobsRunning) return;
      jobsRunning = true;
      try {
        await settlePendingBets();
        await runActiveStrategies();
      } finally {
        jobsRunning = false;
      }
    };
    await runBackgroundJobs();
    setInterval(runBackgroundJobs, BACKGROUND_JOBS_INTERVAL_MS);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
