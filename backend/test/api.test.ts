import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, createRace, createUser, pool, resetDatabase, startServer } from './helpers.js';
import type { TestServer } from './helpers.js';

let server: TestServer;

before(async () => {
  await resetDatabase();
  server = await startServer();
});

after(async () => {
  await server.close();
  await pool.end();
});

describe('authentication', () => {
  test('register validates input and rejects duplicates', async () => {
    const api = client(server.url);
    assert.equal((await api.post('/auth/register', { email: 'a@test.local', username: 'a' })).status, 400);
    assert.equal((await api.post('/auth/register', { email: 'a@test.local', username: 'a', password: '123' })).status, 400);

    const created = await api.post('/auth/register', { email: 'a@test.local', username: 'a', password: 'Password1' });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.bankroll, 1000);
    assert.equal(created.body.user.password, undefined);

    assert.equal((await api.post('/auth/register', { email: 'a@test.local', username: 'b', password: 'Password1' })).status, 409);
  });

  test('login and protected routes', async () => {
    const user = await createUser(server.url);
    const api = client(server.url);

    assert.equal((await api.post('/auth/login', { email: user.email, password: 'wrong' })).status, 401);
    const login = await api.post('/auth/login', { email: user.email, password: user.password });
    assert.equal(login.status, 200);

    assert.equal((await client(server.url, login.body.token).get('/auth/me')).body.email, user.email);
    assert.equal((await api.get('/auth/me')).status, 401);
    assert.equal((await client(server.url, 'not-a-jwt').get('/bets')).status, 401);
  });

  test('login and register are rate limited', async () => {
    const limited = await startServer({ authRateLimit: 3 });
    try {
      const api = client(limited.url);
      const statuses = [];
      for (let i = 0; i < 4; i++) {
        statuses.push((await api.post('/auth/login', { email: 'nobody@test.local', password: 'x' })).status);
      }
      assert.deepEqual(statuses, [401, 401, 401, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('API hardening', () => {
  test('sends security headers', async () => {
    const response = await fetch(server.url.replace('/api', '/health'));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  test('unknown routes and malformed JSON return clean errors', async () => {
    assert.equal((await client(server.url).get('/nope')).status, 404);

    const response = await fetch(`${server.url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email":'
    });
    assert.equal(response.status, 400);
  });

  test('predictions: 400 on invalid id, 404 on unknown race, read-only', async () => {
    const api = client(server.url);
    assert.equal((await api.get('/predictions/race/abc')).status, 400);
    assert.equal((await api.get('/predictions/race/99999999')).status, 404);

    const race = await createRace({ odds: [2, 4, 8] });
    const response = await api.get(`/predictions/race/${race.raceId}`);
    assert.equal(response.status, 200);
    // Same stats for every horse: the ranking follows the odds
    assert.deepEqual(
      response.body.predictions.map((prediction: { runner_id: number }) => prediction.runner_id),
      race.runnerIds
    );

    const [{ count }] = (await pool.query('SELECT COUNT(*)::int as count FROM runners WHERE prediction_score IS NOT NULL')).rows;
    assert.equal(count, 0, 'GET /predictions must not write to the database');
  });
});
