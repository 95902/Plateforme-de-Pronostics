import pool from '../config/database.js';
import type { RunnerFeatures } from './prediction-model.js';

/** Runs at a distance in the same band (rounded to 200 m) count as "similar distance" */
const DISTANCE_BAND_METERS = 200;
const RECENT_RUNS = 5;

export interface RunnerWithFeatures {
  runner_id: number;
  race_id: number;
  saddle_number: number;
  horse_name: string;
  odds: number | null;
  features: RunnerFeatures;
}

/**
 * Runners of the given races (non-runners excluded) with their statistics computed only from
 * races finished BEFORE the start of the race they run in: no information from the future
 * leaks into predictions or backtests. Horse: all previous runs; jockey and trainer: previous
 * 365 days.
 */
export async function loadRunnersWithFeatures(raceIds: number[]): Promise<RunnerWithFeatures[]> {
  if (raceIds.length === 0) return [];

  // One chronological pass per horse, jockey and trainer (window functions), restricted to the
  // horses and people running in the requested races. "Before" means strictly before the start.
  const result = await pool.query(
    `WITH target AS (
       SELECT r.id AS runner_id, r.race_id, r.saddle_number, r.horse_id, r.jockey_id, r.trainer_id,
              COALESCE(r.final_odds, r.morning_odds) AS odds
       FROM runners r
       WHERE r.race_id = ANY($1::int[]) AND NOT r.non_runner
     ),
     runs AS (
       SELECT r.id AS runner_id, r.horse_id, r.jockey_id, r.trainer_id,
              (ra.date + ra.time) AS start,
              round(ra.distance / ${DISTANCE_BAND_METERS}.0) AS distance_band,
              ra.status = 'finished' AS finished,
              -- Disqualified or unplaced: no position
              CASE WHEN res.disqualified THEN NULL ELSE res.finish_position END AS pos
       FROM runners r
       JOIN races ra ON ra.id = r.race_id
       LEFT JOIN results res ON res.runner_id = r.id
       WHERE NOT r.non_runner
         AND (r.horse_id IN (SELECT horse_id FROM target)
              OR r.jockey_id IN (SELECT jockey_id FROM target)
              OR r.trainer_id IN (SELECT trainer_id FROM target))
     ),
     horse_stats AS (
       SELECT runner_id,
              COUNT(*) FILTER (WHERE finished) OVER w AS starts,
              COUNT(*) FILTER (WHERE finished AND pos = 1) OVER w AS wins,
              COUNT(*) FILTER (WHERE finished AND pos <= 3) OVER w AS places,
              array_agg(pos) FILTER (WHERE finished) OVER w AS positions
       FROM runs WHERE horse_id IN (SELECT horse_id FROM target)
       WINDOW w AS (PARTITION BY horse_id ORDER BY start RANGE BETWEEN UNBOUNDED PRECEDING AND INTERVAL '1 second' PRECEDING)
     ),
     distance_stats AS (
       SELECT runner_id,
              COUNT(*) FILTER (WHERE finished) OVER w AS starts,
              COUNT(*) FILTER (WHERE finished AND pos <= 3) OVER w AS places
       FROM runs WHERE horse_id IN (SELECT horse_id FROM target)
       WINDOW w AS (PARTITION BY horse_id, distance_band ORDER BY start RANGE BETWEEN UNBOUNDED PRECEDING AND INTERVAL '1 second' PRECEDING)
     ),
     jockey_stats AS (
       SELECT runner_id,
              COUNT(*) FILTER (WHERE finished) OVER w AS rides,
              COUNT(*) FILTER (WHERE finished AND pos = 1) OVER w AS wins
       FROM runs WHERE jockey_id IN (SELECT jockey_id FROM target)
       WINDOW w AS (PARTITION BY jockey_id ORDER BY start RANGE BETWEEN INTERVAL '365 days' PRECEDING AND INTERVAL '1 second' PRECEDING)
     ),
     trainer_stats AS (
       SELECT runner_id,
              COUNT(*) FILTER (WHERE finished) OVER w AS runs,
              COUNT(*) FILTER (WHERE finished AND pos = 1) OVER w AS wins
       FROM runs WHERE trainer_id IN (SELECT trainer_id FROM target)
       WINDOW w AS (PARTITION BY trainer_id ORDER BY start RANGE BETWEEN INTERVAL '365 days' PRECEDING AND INTERVAL '1 second' PRECEDING)
     )
     SELECT t.runner_id, t.race_id, t.saddle_number, h.name AS horse_name, t.odds,
            hs.starts, hs.wins, hs.places, hs.positions,
            ds.starts AS distance_starts, ds.places AS distance_places,
            js.rides AS jockey_rides, js.wins AS jockey_wins,
            ts.runs AS trainer_runs, ts.wins AS trainer_wins
     FROM target t
     JOIN horses h ON h.id = t.horse_id
     JOIN horse_stats hs ON hs.runner_id = t.runner_id
     JOIN distance_stats ds ON ds.runner_id = t.runner_id
     JOIN jockey_stats js ON js.runner_id = t.runner_id
     JOIN trainer_stats ts ON ts.runner_id = t.runner_id
     ORDER BY t.race_id, t.saddle_number`,
    [raceIds]
  );

  return result.rows.map((row) => ({
    runner_id: row.runner_id,
    race_id: row.race_id,
    saddle_number: row.saddle_number,
    horse_name: row.horse_name,
    odds: row.odds,
    features: {
      horse_starts: Number(row.starts),
      horse_wins: Number(row.wins),
      horse_places: Number(row.places),
      // Chronological positions → the last 5, most recent first
      recent_positions: ((row.positions ?? []) as (number | null)[]).slice(-RECENT_RUNS).reverse(),
      distance_starts: Number(row.distance_starts),
      distance_places: Number(row.distance_places),
      jockey_rides: Number(row.jockey_rides),
      jockey_wins: Number(row.jockey_wins),
      trainer_runs: Number(row.trainer_runs),
      trainer_wins: Number(row.trainer_wins)
    }
  }));
}
