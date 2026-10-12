/**
 * Prediction score of a runner (0-100), computed only from what was known before the race.
 *
 * Criteria and weights:
 *   - historical performance (40): horse's win and place rates
 *   - recent form (25): last 5 runs, most recent weighted most
 *   - jockey & trainer (15): win rates over the previous 12 months
 *   - race conditions (10): horse's place rate at a similar distance (same 200 m band)
 *   - odds (10): the market's opinion
 *
 * Rates are smoothed towards a typical value when the history is short, so that a horse with
 * 1 win out of 1 run is not rated like a champion.
 */

/** Statistics of a runner computed from the races finished before the race being predicted */
export interface RunnerFeatures {
  horse_starts: number;
  horse_wins: number;
  horse_places: number;
  /** Finishing positions of the last runs, most recent first (null = not placed / disqualified) */
  recent_positions: (number | null)[];
  distance_starts: number;
  distance_places: number;
  jockey_rides: number;
  jockey_wins: number;
  trainer_runs: number;
  trainer_wins: number;
}

export const WEIGHTS = { history: 40, form: 25, connections: 15, conditions: 10, odds: 10 } as const;

const TYPICAL_WIN_RATE = 0.1;
const TYPICAL_PLACE_RATE = 0.3;

/** Rate pulled towards `prior` as if `priorWeight` extra runs had that rate */
export function smoothedRate(successes: number, trials: number, prior: number, priorWeight: number): number {
  return (successes + prior * priorWeight) / (trials + priorWeight);
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Points per finishing position in the recent form */
const FORM_POINTS: Record<number, number> = { 1: 1, 2: 0.7, 3: 0.5, 4: 0.3, 5: 0.2 };
const RECENCY_WEIGHTS = [1, 0.8, 0.6, 0.4, 0.2];
/** Form of a horse without any previous run */
const NEUTRAL_FORM = 0.2;

export function formScore(recentPositions: (number | null)[]): number {
  const runs = recentPositions.slice(0, RECENCY_WEIGHTS.length);
  if (runs.length === 0) return NEUTRAL_FORM;
  let points = 0;
  let weights = 0;
  runs.forEach((position, index) => {
    points += RECENCY_WEIGHTS[index] * (position === null ? 0 : FORM_POINTS[position] ?? 0);
    weights += RECENCY_WEIGHTS[index];
  });
  return points / weights;
}

/** Components of the score, each between 0 and 1 */
export function scoreComponents(features: RunnerFeatures, odds: number | null) {
  const winRate = smoothedRate(features.horse_wins, features.horse_starts, TYPICAL_WIN_RATE, 5);
  const placeRate = smoothedRate(features.horse_places, features.horse_starts, TYPICAL_PLACE_RATE, 5);
  const jockeyRate = smoothedRate(features.jockey_wins, features.jockey_rides, TYPICAL_WIN_RATE, 20);
  const trainerRate = smoothedRate(features.trainer_wins, features.trainer_runs, TYPICAL_WIN_RATE, 20);
  const distanceRate = smoothedRate(features.distance_places, features.distance_starts, TYPICAL_PLACE_RATE, 3);

  return {
    // A 40% win rate and an 80% place rate are top-level
    history: clamp01(0.6 * (winRate / 0.4) + 0.4 * (placeRate / 0.8)),
    form: formScore(features.recent_positions),
    // 30% wins over a year is top-level for a jockey or a trainer
    connections: clamp01((0.6 * jockeyRate + 0.4 * trainerRate) / 0.3),
    conditions: clamp01(distanceRate / 0.8),
    // Implied probability, an even-money favorite (odds 2) scoring full marks
    odds: odds && odds > 1 ? clamp01(1 / odds / 0.5) : 0.5
  };
}

export function predictionScore(features: RunnerFeatures, odds: number | null): number {
  const components = scoreComponents(features, odds);
  const score =
    components.history * WEIGHTS.history +
    components.form * WEIGHTS.form +
    components.connections * WEIGHTS.connections +
    components.conditions * WEIGHTS.conditions +
    components.odds * WEIGHTS.odds;
  return Math.round(score * 100) / 100;
}

/** Recent form as usually written: "1-4-0-2", 0 = not placed, most recent first */
export function formatForm(recentPositions: (number | null)[]): string {
  return recentPositions.map((position) => (position === null || position > 9 ? '0' : String(position))).join('-');
}
