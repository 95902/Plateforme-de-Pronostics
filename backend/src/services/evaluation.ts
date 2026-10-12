/**
 * Evaluation of the prediction model against the market (the odds), on finished races.
 *
 * - log-loss: average of −ln(probability given to the actual winner); lower is better.
 *   A model that does not beat the market's log-loss has no edge, whatever its backtests say.
 * - Brier score: average squared error of the probabilities over all runners of a race; lower is better.
 * - calibration: within each band of predicted probability, the share of runners that actually won.
 * - betting: flat 1€ win bets on the model's value bets, compared with 1€ on every favorite.
 */

export interface EvaluatedRunner {
  runner_id: number;
  odds: number;
  /** Prediction score (0-100) */
  score: number;
  won: boolean;
}

export interface EvaluatedRace {
  race_id: number;
  runners: EvaluatedRunner[];
}

export interface CalibrationBand {
  from: number;
  to: number;
  runners: number;
  /** Average predicted win probability in the band */
  predicted: number;
  /** Share of the band's runners that won */
  actual: number;
}

export interface ProbabilityMetrics {
  log_loss: number;
  brier: number;
  /** Share of races won by the runner given the highest probability */
  top_pick_win_rate: number;
  calibration: CalibrationBand[];
}

export interface BettingResult {
  bets: number;
  wins: number;
  staked: number;
  returned: number;
  roi: number;
}

export interface EvaluationReport {
  races: number;
  /** Races left out: no single winner among runners with odds, or a runner without odds */
  skipped_races: number;
  runners: number;
  model: ProbabilityMetrics;
  market: ProbabilityMetrics;
  /** Log-linear mix of model and market: p ∝ p_model^w × p_market^(1−w) */
  blend: ProbabilityMetrics & { model_weight: number };
  best: 'model' | 'market' | 'blend';
  betting: { value_bets: BettingResult & { min_edge: number }; favorites: BettingResult };
}

const CALIBRATION_EDGES = [0, 0.05, 0.1, 0.2, 0.35, 1];
const MIN_PROBABILITY = 1e-6;
const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

const normalize = (values: number[]) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => (total > 0 ? value / total : 1 / values.length));
};

/** Win probabilities implied by the odds, without the bookmaker's margin */
export const marketProbabilities = (race: EvaluatedRace) => normalize(race.runners.map((runner) => 1 / runner.odds));

/** Win probabilities of the model: each runner's share of the race's total score */
export const modelProbabilities = (race: EvaluatedRace) => normalize(race.runners.map((runner) => Math.max(runner.score, 0)));

export function blendProbabilities(model: number[], market: number[], modelWeight: number): number[] {
  return normalize(
    model.map((p, index) => Math.max(p, MIN_PROBABILITY) ** modelWeight * Math.max(market[index], MIN_PROBABILITY) ** (1 - modelWeight))
  );
}

/** Races usable for evaluation: every runner has odds and exactly one runner won */
export function usableRaces(races: EvaluatedRace[]): EvaluatedRace[] {
  return races.filter(
    (race) =>
      race.runners.length >= 2 &&
      race.runners.every((runner) => runner.odds > 1) &&
      race.runners.filter((runner) => runner.won).length === 1
  );
}

export function probabilityMetrics(races: EvaluatedRace[], probabilitiesOf: (race: EvaluatedRace) => number[]): ProbabilityMetrics {
  let logLoss = 0;
  let brier = 0;
  let topPickWins = 0;
  const bands = CALIBRATION_EDGES.slice(0, -1).map((from, index) => ({ from, to: CALIBRATION_EDGES[index + 1], runners: 0, predicted: 0, wins: 0 }));

  for (const race of races) {
    const probabilities = probabilitiesOf(race);
    const winnerIndex = race.runners.findIndex((runner) => runner.won);

    logLoss += -Math.log(Math.max(probabilities[winnerIndex], MIN_PROBABILITY));
    brier += race.runners.reduce((sum, runner, index) => sum + (probabilities[index] - (runner.won ? 1 : 0)) ** 2, 0);
    if (probabilities.indexOf(Math.max(...probabilities)) === winnerIndex) topPickWins++;

    race.runners.forEach((runner, index) => {
      const band = bands.find((b) => probabilities[index] >= b.from && probabilities[index] < b.to) ?? bands[bands.length - 1];
      band.runners++;
      band.predicted += probabilities[index];
      if (runner.won) band.wins++;
    });
  }

  const count = Math.max(races.length, 1);
  return {
    log_loss: round(logLoss / count),
    brier: round(brier / count),
    top_pick_win_rate: round(topPickWins / count),
    calibration: bands.map((band) => ({
      from: band.from,
      to: band.to,
      runners: band.runners,
      predicted: band.runners > 0 ? round(band.predicted / band.runners) : 0,
      actual: band.runners > 0 ? round(band.wins / band.runners) : 0
    }))
  };
}

function betting(bets: { odds: number; won: boolean }[]): BettingResult {
  const wins = bets.filter((bet) => bet.won).length;
  const returned = bets.reduce((sum, bet) => sum + (bet.won ? bet.odds : 0), 0);
  return {
    bets: bets.length,
    wins,
    staked: bets.length,
    returned: round(returned, 2),
    roi: bets.length > 0 ? round((returned - bets.length) / bets.length) : 0
  };
}

export function evaluate(allRaces: EvaluatedRace[], { modelWeight = 0.5, minEdge = 0.1 } = {}): EvaluationReport {
  const races = usableRaces(allRaces);

  const model = probabilityMetrics(races, modelProbabilities);
  const market = probabilityMetrics(races, marketProbabilities);
  const blend = probabilityMetrics(races, (race) => blendProbabilities(modelProbabilities(race), marketProbabilities(race), modelWeight));

  const candidates = { model: model.log_loss, market: market.log_loss, blend: blend.log_loss };
  const best = (Object.keys(candidates) as (keyof typeof candidates)[]).reduce((a, b) => (candidates[b] < candidates[a] ? b : a));

  const valueBets = races.flatMap((race) => {
    const probabilities = modelProbabilities(race);
    return race.runners.filter((runner, index) => probabilities[index] * runner.odds - 1 >= minEdge);
  });
  const favorites = races.map((race) => race.runners.reduce((a, b) => (b.odds < a.odds ? b : a)));

  return {
    races: races.length,
    skipped_races: allRaces.length - races.length,
    runners: races.reduce((sum, race) => sum + race.runners.length, 0),
    model,
    market,
    blend: { ...blend, model_weight: modelWeight },
    best,
    betting: { value_bets: { ...betting(valueBets), min_edge: minEdge }, favorites: betting(favorites) }
  };
}
