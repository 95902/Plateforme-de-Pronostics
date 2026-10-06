import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import pool from '../src/config/database.js';
import { createApp } from '../src/app.js';
import type { AppOptions } from '../src/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export { pool };

let hippodromeId: number | null = null;

export const query = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await pool.query(sql, params)).rows;

/**
 * Recreate the schema and empty every table. Refuses to run on a database whose name
 * does not contain "test", so a misconfigured run cannot wipe real data.
 */
export async function resetDatabase() {
  const database = process.env.DB_DATABASE ?? '';
  if (!database.includes('test')) {
    throw new Error(`Refusing to reset database "${database}": integration tests need a *test* database`);
  }

  const migration = readFileSync(join(__dirname, '../src/database/migrations/001_create_tables.sql'), 'utf-8');
  await pool.query(migration);
  hippodromeId = null;
  await pool.query(
    `TRUNCATE users, horses, jockeys, trainers, hippodromes, races, runners, results,
              strategies, bets, transactions, simulations RESTART IDENTITY CASCADE`
  );
}

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(options: AppOptions = {}): Promise<TestServer> {
  const app = createApp({ logRequests: false, authRateLimit: 10_000, ...options });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/** Minimal JSON client bound to a base URL and an optional bearer token */
export function client(baseUrl: string, token?: string) {
  const call = async <T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  return {
    get: <T = any>(path: string) => call<T>('GET', path),
    post: <T = any>(path: string, body?: unknown) => call<T>('POST', path, body ?? {}),
    put: <T = any>(path: string, body?: unknown) => call<T>('PUT', path, body ?? {}),
    del: <T = any>(path: string) => call<T>('DELETE', path)
  };
}

export type Client = ReturnType<typeof client>;

let userCounter = 0;

/** Register a user through the API, then adjust role/bankroll directly in the database */
export async function createUser(
  baseUrl: string,
  { role = 'user', bankroll = 1000 }: { role?: 'user' | 'admin'; bankroll?: number } = {}
) {
  userCounter++;
  const email = `user${userCounter}-${Date.now()}@test.local`;
  const password = 'Password123!';
  const registered = await client(baseUrl).post('/auth/register', {
    email,
    username: `user${userCounter}_${Date.now()}`,
    password
  });
  if (registered.status !== 201) {
    throw new Error(`Registration failed: ${JSON.stringify(registered.body)}`);
  }

  const id: number = registered.body.user.id;
  await query('UPDATE users SET role = $1, bankroll = $2 WHERE id = $3', [role, bankroll, id]);

  return { id, email, password, token: registered.body.token as string, api: client(baseUrl, registered.body.token) };
}

export async function getBankroll(userId: number): Promise<number> {
  const [user] = await query<{ bankroll: number }>('SELECT bankroll FROM users WHERE id = $1', [userId]);
  return user.bankroll;
}

let raceCounter = 0;

export interface RaceFixture {
  raceId: number;
  /** Runner ids, in the order of the odds passed in */
  runnerIds: number[];
}

/**
 * Create a race with one runner per odds value. All horses, jockeys and trainers have the
 * same statistics, so the prediction ranking depends only on the odds (lowest = best).
 *
 * `startsInMinutes` places the race relative to the database clock; otherwise `date` is used.
 */
export async function createRace({
  odds,
  status = 'scheduled',
  date = '2030-01-01',
  startsInMinutes
}: {
  odds: number[];
  status?: 'scheduled' | 'running' | 'finished' | 'cancelled';
  date?: string;
  startsInMinutes?: number;
}): Promise<RaceFixture> {
  if (hippodromeId === null) {
    const [hippodrome] = await query<{ id: number }>(
      `INSERT INTO hippodromes (name, city, country, track_type, surface)
       VALUES ('Test Park', 'Paris', 'France', 'Plat', 'Gazon') RETURNING id`
    );
    hippodromeId = hippodrome.id;
  }

  raceCounter++;
  const [race] = await query<{ id: number }>(
    startsInMinutes === undefined
      ? `INSERT INTO races (hippodrome_id, race_number, date, time, name, race_type, distance, status)
         VALUES ($1, $2, $3::date, '15:00', $4, 'Plat', 2000, $5) RETURNING id`
      : `INSERT INTO races (hippodrome_id, race_number, date, time, name, race_type, distance, status)
         VALUES ($1, $2, (LOCALTIMESTAMP + make_interval(mins => $3))::date,
                 (LOCALTIMESTAMP + make_interval(mins => $3))::time, $4, 'Plat', 2000, $5) RETURNING id`,
    startsInMinutes === undefined
      ? [hippodromeId, raceCounter, date, `Test race ${raceCounter}`, status]
      : [hippodromeId, raceCounter, startsInMinutes, `Test race ${raceCounter}`, status]
  );

  const runnerIds: number[] = [];
  for (const [index, value] of odds.entries()) {
    const [horse] = await query<{ id: number }>(
      `INSERT INTO horses (name, age, sex, career_total_races, career_wins, optimal_distance)
       VALUES ($1, 5, 'M', 20, 4, 2000) RETURNING id`,
      [`Horse ${raceCounter}-${index + 1}`]
    );
    const [jockey] = await query<{ id: number }>(
      `INSERT INTO jockeys (name, career_win_rate) VALUES ($1, 0.15) RETURNING id`,
      [`Jockey ${raceCounter}-${index + 1}`]
    );
    const [trainer] = await query<{ id: number }>(
      `INSERT INTO trainers (name, career_win_rate) VALUES ($1, 0.15) RETURNING id`,
      [`Trainer ${raceCounter}-${index + 1}`]
    );
    const [runner] = await query<{ id: number }>(
      `INSERT INTO runners (race_id, horse_id, jockey_id, trainer_id, saddle_number, morning_odds, final_odds)
       VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
      [race.id, horse.id, jockey.id, trainer.id, index + 1, value]
    );
    runnerIds.push(runner.id);
  }

  return { raceId: race.id, runnerIds };
}

/** Insert the finishing order of a race directly (runner ids, winner first) */
export async function insertResults(raceId: number, finishOrder: number[]) {
  for (const [index, runnerId] of finishOrder.entries()) {
    await query('INSERT INTO results (race_id, runner_id, finish_position) VALUES ($1, $2, $3)', [
      raceId,
      runnerId,
      index + 1
    ]);
  }
}

export const near = (actual: number, expected: number, epsilon = 0.005) => Math.abs(actual - expected) < epsilon;
