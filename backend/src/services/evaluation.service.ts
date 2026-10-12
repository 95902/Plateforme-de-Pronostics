import pool from '../config/database.js';
import { predictionScore } from './prediction-model.js';
import { loadRunnersWithFeatures } from './runner-features.service.js';
import { evaluate } from './evaluation.js';
import type { EvaluatedRace, EvaluationReport } from './evaluation.js';

const MAX_RACES = 20000;

/**
 * Evaluate the model against the market on the races finished between `from` and `to`
 * (YYYY-MM-DD), each runner scored with the statistics known before its race.
 */
export async function evaluateModel(from: string, to: string): Promise<EvaluationReport & { from: string; to: string }> {
  const racesResult = await pool.query(
    `SELECT id FROM races WHERE status = 'finished' AND date BETWEEN $1 AND $2 ORDER BY date, time, id LIMIT $3`,
    [from, to, MAX_RACES]
  );
  const raceIds: number[] = racesResult.rows.map((row) => row.id);

  const [runners, winnersResult] = await Promise.all([
    loadRunnersWithFeatures(raceIds),
    pool.query(
      `SELECT runner_id FROM results WHERE race_id = ANY($1::int[]) AND finish_position = 1 AND NOT disqualified`,
      [raceIds]
    )
  ]);
  const winners = new Set<number>(winnersResult.rows.map((row) => row.runner_id));

  const races = new Map<number, EvaluatedRace>();
  for (const runner of runners) {
    const race = races.get(runner.race_id) ?? { race_id: runner.race_id, runners: [] };
    race.runners.push({
      runner_id: runner.runner_id,
      odds: runner.odds ?? 0,
      score: predictionScore(runner.features, runner.odds),
      won: winners.has(runner.runner_id)
    });
    races.set(runner.race_id, race);
  }

  return { from, to, ...evaluate([...races.values()]) };
}
