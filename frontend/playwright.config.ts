import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the real stack: the compiled API (../backend/build) on a migrated and
 * seeded database, and the production build of the frontend (vite preview).
 * Already running servers are reused, e.g. when started by hand.
 *
 * Required: the backend environment (DB_* variables) and E2E_ADMIN_PASSWORD, the password the
 * seed gave the admin account (set SEED_ADMIN_PASSWORD when seeding).
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 3333);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);

export default defineConfig({
  testDir: './e2e',
  // Tests share one database: run them one after the other
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: [
    {
      command: 'node ../backend/build/server.js',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        PORT: String(API_PORT),
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        AUTH_RATE_LIMIT_MAX: '1000',
      },
    },
    {
      command: `npm run preview -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
