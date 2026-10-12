import type { PoolClient } from 'pg';
import pool from '../../config/database.js';
import settlementService from '../settlement.service.js';
import { validateImport } from './format.js';
import type { ImportRace } from './format.js';

export interface ImportSummary {
  source: string | null;
  races_received: number;
  created: number;
  updated: number;
  results_recorded: number;
  cancelled: number;
  /** Validation errors (the race is skipped) and conflicts (the race is imported, the conflicting part is not) */
  errors: string[];
}

type PersonTable = 'jockeys' | 'trainers';

async function findOrCreateHippodrome(client: PoolClient, race: ImportRace): Promise<number> {
  const existing = await client.query('SELECT id FROM hippodromes WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [
    race.racecourse.name
  ]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const created = await client.query(
    `INSERT INTO hippodromes (name, city, country, track_type, surface) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [race.racecourse.name, race.racecourse.city ?? null, race.racecourse.country, race.discipline, race.racecourse.surface ?? null]
  );
  return created.rows[0].id;
}

async function findOrCreatePerson(client: PoolClient, table: PersonTable, name: string): Promise<number> {
  const existing = await client.query(`SELECT id FROM ${table} WHERE lower(name) = lower($1) ORDER BY id LIMIT 1`, [name]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const created = await client.query(`INSERT INTO ${table} (name) VALUES ($1) RETURNING id`, [name]);
  return created.rows[0].id;
}

async function findOrCreateHorse(client: PoolClient, horse: ImportRace['runners'][number]['horse']): Promise<number> {
  const existing = await client.query('SELECT id FROM horses WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [horse.name]);
  if (existing.rows.length > 0) {
    // Keep the latest known age
    if (horse.age !== undefined) {
      await client.query('UPDATE horses SET age = $1 WHERE id = $2', [horse.age, existing.rows[0].id]);
    }
    return existing.rows[0].id;
  }
  const created = await client.query('INSERT INTO horses (name, age, sex) VALUES ($1, $2, $3) RETURNING id', [
    horse.name,
    horse.age ?? null,
    horse.sex ?? null
  ]);
  return created.rows[0].id;
}

export class ImportService {
  /**
   * Validate and import a document. Each race is imported in its own transaction: an invalid
   * race is reported and skipped, the others are imported. Re-importing the same races updates
   * them (odds, runners...) without creating duplicates.
   */
  async importDocument(document: unknown): Promise<ImportSummary> {
    const { races, errors } = validateImport(document);
    const summary: ImportSummary = {
      source: typeof (document as { source?: unknown })?.source === 'string' ? (document as { source: string }).source : null,
      races_received: Array.isArray((document as { races?: unknown })?.races) ? (document as { races: unknown[] }).races.length : 0,
      created: 0,
      updated: 0,
      results_recorded: 0,
      cancelled: 0,
      errors
    };

    for (const race of races) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await this.importRace(client, race, summary);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        summary.errors.push(`${race.external_id}: import failed (${(error as Error).message})`);
      } finally {
        client.release();
      }
    }

    return summary;
  }

  private async importRace(client: PoolClient, race: ImportRace, summary: ImportSummary) {
    const hippodromeId = await findOrCreateHippodrome(client, race);

    const existing = await client.query('SELECT id, status FROM races WHERE external_id = $1 FOR UPDATE', [race.external_id]);
    let raceId: number;
    let currentStatus: string;

    if (existing.rows.length > 0) {
      raceId = existing.rows[0].id;
      currentStatus = existing.rows[0].status;
      await client.query(
        `UPDATE races SET hippodrome_id = $1, race_number = $2, date = $3, time = $4, name = $5, race_type = $6,
                distance = $7, prize_money = $8, track_condition = $9
         WHERE id = $10`,
        [hippodromeId, race.race_number, race.date, race.time, race.name ?? null, race.discipline, race.distance,
          race.prize_money ?? null, race.track_condition ?? null, raceId]
      );
      summary.updated++;
    } else {
      const created = await client.query(
        `INSERT INTO races (external_id, hippodrome_id, race_number, date, time, name, race_type, distance, prize_money, track_condition, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled') RETURNING id`,
        [race.external_id, hippodromeId, race.race_number, race.date, race.time, race.name ?? null, race.discipline,
          race.distance, race.prize_money ?? null, race.track_condition ?? null]
      );
      raceId = created.rows[0].id;
      currentStatus = 'scheduled';
      summary.created++;
    }

    const runnerIdBySaddle = new Map<number, number>();
    for (const runner of race.runners) {
      const horseId = await findOrCreateHorse(client, runner.horse);
      const jockeyId = await findOrCreatePerson(client, 'jockeys', runner.jockey.name);
      const trainerId = await findOrCreatePerson(client, 'trainers', runner.trainer.name);
      const saved = await client.query(
        `INSERT INTO runners (race_id, horse_id, jockey_id, trainer_id, saddle_number, weight_carried, morning_odds, final_odds, non_runner)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (race_id, saddle_number) DO UPDATE SET
           horse_id = EXCLUDED.horse_id, jockey_id = EXCLUDED.jockey_id, trainer_id = EXCLUDED.trainer_id,
           weight_carried = COALESCE(EXCLUDED.weight_carried, runners.weight_carried),
           morning_odds = COALESCE(EXCLUDED.morning_odds, runners.morning_odds),
           final_odds = COALESCE(EXCLUDED.final_odds, runners.final_odds),
           non_runner = EXCLUDED.non_runner
         RETURNING id`,
        [raceId, horseId, jockeyId, trainerId, runner.saddle_number, runner.weight ?? null, runner.morning_odds ?? null,
          runner.final_odds ?? null, runner.non_runner === true]
      );
      runnerIdBySaddle.set(runner.saddle_number, saved.rows[0].id);
    }

    if (race.dividends) {
      await client.query('DELETE FROM race_dividends WHERE race_id = $1', [raceId]);
      for (const dividend of race.dividends) {
        await client.query(
          `INSERT INTO race_dividends (race_id, bet_type, combination, payout_per_euro) VALUES ($1, $2, $3, $4)`,
          [raceId, dividend.bet_type, [...dividend.combination].sort((a, b) => a - b), dividend.payout_per_euro]
        );
      }
    }

    const isOpen = currentStatus === 'scheduled' || currentStatus === 'running';

    if (race.status === 'finished') {
      const finishers = race.runners
        .filter((runner) => runner.finish_position !== undefined)
        .sort((a, b) => a.finish_position! - b.finish_position!);

      if (isOpen) {
        await client.query('DELETE FROM results WHERE race_id = $1', [raceId]);
        for (const runner of finishers) {
          await client.query(
            `INSERT INTO results (race_id, runner_id, finish_position, finish_time, disqualified) VALUES ($1, $2, $3, $4, $5)`,
            [raceId, runnerIdBySaddle.get(runner.saddle_number), runner.finish_position, runner.finish_time ?? null,
              runner.disqualified === true]
          );
        }
        await client.query(`UPDATE races SET status = 'finished' WHERE id = $1`, [raceId]);
        await settlementService.settleRaceInTransaction(client, raceId);
        summary.results_recorded++;
      } else if (currentStatus === 'finished') {
        // Results are never overwritten: report a different arrival instead
        const recorded = await client.query(
          `SELECT ru.saddle_number FROM results re JOIN runners ru ON ru.id = re.runner_id
           WHERE re.race_id = $1 ORDER BY re.finish_position`,
          [raceId]
        );
        const recordedOrder = recorded.rows.map((row) => row.saddle_number).join('-');
        const fileOrder = finishers.map((runner) => runner.saddle_number).join('-');
        if (recordedOrder !== fileOrder) {
          summary.errors.push(`${race.external_id}: results differ from those already recorded (${recordedOrder}); not changed`);
        }
      }
    } else if (race.status === 'cancelled' && isOpen) {
      await client.query(`UPDATE races SET status = 'cancelled' WHERE id = $1`, [raceId]);
      await settlementService.settleRaceInTransaction(client, raceId);
      summary.cancelled++;
    }
  }
}

export default new ImportService();
