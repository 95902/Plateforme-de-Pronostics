/**
 * Pure betting-strategy logic, shared by the backtest and the live runner.
 * No database access here so the rules can be unit-tested.
 *
 * All strategies place "simple" (win) bets.
 */

export type StrategyType =
  | 'FAVORITE'
  | 'VALUE_BETTING'
  | 'KELLY_CRITERION'
  | 'MARTINGALE'
  | 'FIBONACCI'
  | 'DUTCHING'
  | 'FIXED_PERCENTAGE'
  | 'CUSTOM';

export interface EngineRunner {
  runner_id: number;
  saddle_number: number;
  odds: number;
  /** Prediction score (0-100) from the prediction service */
  score: number;
}

export interface RunnerAnalysis extends EngineRunner {
  /** Estimated win probability: the runner's share of the race's total score */
  probability: number;
  /** Expected profit per 1€ staked: probability × odds − 1 */
  expected_value: number;
}

export interface StrategyState {
  consecutiveLosses: number;
  fibonacciStep: number;
}

export interface BetDecision {
  runner_id: number;
  saddle_number: number;
  odds: number;
  stake: number;
}

export const INITIAL_STATE: StrategyState = { consecutiveLosses: 0, fibonacciStep: 0 };

const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];

const roundCents = (value: number) => Math.floor(value * 100) / 100;

/** Read a numeric parameter, falling back to a default and clamping to [min, max] */
function param(params: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const raw = params[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}

/**
 * Turn prediction scores into win probabilities (normalized over the race) and expected values.
 * Runners without usable odds are ignored.
 */
export function analyzeRace(runners: EngineRunner[]): RunnerAnalysis[] {
  const valid = runners.filter((runner) => runner.odds > 1 && runner.score > 0);
  const totalScore = valid.reduce((sum, runner) => sum + runner.score, 0);
  if (totalScore === 0) return [];

  return valid.map((runner) => {
    const probability = runner.score / totalScore;
    return { ...runner, probability, expected_value: probability * runner.odds - 1 };
  });
}

function favorite(analysis: RunnerAnalysis[]): RunnerAnalysis | undefined {
  return [...analysis].sort((a, b) => a.odds - b.odds || b.score - a.score)[0];
}

function topPredicted(analysis: RunnerAnalysis[]): RunnerAnalysis[] {
  return [...analysis].sort((a, b) => b.probability - a.probability || a.odds - b.odds);
}

function single(runner: RunnerAnalysis | undefined, stake: number): BetDecision[] {
  const amount = roundCents(stake);
  if (!runner || !(amount > 0)) return [];
  return [{ runner_id: runner.runner_id, saddle_number: runner.saddle_number, odds: runner.odds, stake: amount }];
}

/**
 * The bets a strategy wants to place on a race, whether or not the bankroll can cover them.
 */
export function proposeBets(
  type: StrategyType,
  params: Record<string, unknown>,
  analysis: RunnerAnalysis[],
  bankroll: number,
  state: StrategyState
): BetDecision[] {
  if (analysis.length === 0 || bankroll <= 0) return [];

  let decisions: BetDecision[] = [];

  switch (type) {
    case 'FAVORITE': {
      const baseStake = param(params, 'baseStake', 10, 0.01, 100000);
      const maxOdds = param(params, 'maxOdds', 4, 1, 1000);
      const fav = favorite(analysis);
      decisions = fav && fav.odds <= maxOdds ? single(fav, baseStake) : [];
      break;
    }

    case 'VALUE_BETTING': {
      const minEV = param(params, 'minEV', 5, -100, 10000) / 100;
      const percentage = param(params, 'percentageBankroll', 2, 0, 100) / 100;
      const minOdds = param(params, 'minOdds', 1, 1, 1000);
      const maxOdds = param(params, 'maxOdds', 1000, 1, 1000);
      const best = analysis
        .filter((runner) => runner.expected_value >= minEV && runner.odds >= minOdds && runner.odds <= maxOdds)
        .sort((a, b) => b.expected_value - a.expected_value)[0];
      decisions = single(best, bankroll * percentage);
      break;
    }

    case 'KELLY_CRITERION': {
      const fraction = param(params, 'fraction', 0.5, 0, 1);
      const maxStake = param(params, 'maxStakePercent', 5, 0, 100) / 100;
      const kelly = (runner: RunnerAnalysis) => runner.expected_value / (runner.odds - 1);
      const best = analysis.filter((runner) => kelly(runner) > 0).sort((a, b) => kelly(b) - kelly(a))[0];
      decisions = best ? single(best, bankroll * Math.min(kelly(best) * fraction, maxStake)) : [];
      break;
    }

    case 'MARTINGALE': {
      const baseStake = param(params, 'baseStake', 5, 0.01, 100000);
      const maxStake = param(params, 'maxStake', baseStake * 32, baseStake, 1000000);
      const stake = Math.min(baseStake * 2 ** state.consecutiveLosses, maxStake);
      decisions = single(favorite(analysis), stake);
      break;
    }

    case 'FIBONACCI': {
      const baseStake = param(params, 'baseStake', 5, 0.01, 100000);
      const maxStep = param(params, 'maxStep', 8, 0, FIBONACCI.length - 1);
      const step = Math.min(state.fibonacciStep, maxStep);
      decisions = single(favorite(analysis), baseStake * FIBONACCI[step]);
      break;
    }

    case 'DUTCHING': {
      // Spread the total stake over the top N predicted runners so that any winner returns the same amount
      const horses = Math.round(param(params, 'horses', 3, 2, 8));
      const totalStake = param(params, 'totalStake', 20, 0.01, 100000);
      const picks = topPredicted(analysis).slice(0, horses);
      const totalWeight = picks.reduce((sum, runner) => sum + 1 / runner.odds, 0);
      decisions = picks.flatMap((runner) => single(runner, (totalStake * (1 / runner.odds)) / totalWeight));
      break;
    }

    case 'FIXED_PERCENTAGE': {
      const percentage = param(params, 'percentageBankroll', 2, 0, 100) / 100;
      decisions = single(topPredicted(analysis)[0], bankroll * percentage);
      break;
    }

    case 'CUSTOM':
      // Custom rules are not executable yet
      decisions = [];
      break;
  }

  return decisions;
}

export const totalStake = (decisions: BetDecision[]) => decisions.reduce((sum, decision) => sum + decision.stake, 0);

/**
 * Decide which bets a strategy places on a race.
 * Returns no bet when nothing qualifies or when the total stake exceeds the bankroll.
 */
export function decideBets(
  type: StrategyType,
  params: Record<string, unknown>,
  analysis: RunnerAnalysis[],
  bankroll: number,
  state: StrategyState
): BetDecision[] {
  const decisions = proposeBets(type, params, analysis, bankroll, state);
  return totalStake(decisions) <= bankroll ? decisions : [];
}

/**
 * Update the progression state after a race on which the strategy placed bets.
 * `won` is true when at least one of the race's bets won.
 */
export function nextState(
  type: StrategyType,
  params: Record<string, unknown>,
  state: StrategyState,
  won: boolean
): StrategyState {
  if (type === 'MARTINGALE') {
    const maxLosses = Math.round(param(params, 'maxConsecutiveLosses', 5, 1, 20));
    const losses = won ? 0 : state.consecutiveLosses + 1;
    // After too many losses in a row, restart from the base stake to cap the damage
    return { ...state, consecutiveLosses: losses >= maxLosses ? 0 : losses };
  }

  if (type === 'FIBONACCI') {
    const maxStep = param(params, 'maxStep', 8, 0, FIBONACCI.length - 1);
    const step = won ? Math.max(0, state.fibonacciStep - 2) : Math.min(state.fibonacciStep + 1, maxStep);
    return { ...state, fibonacciStep: step };
  }

  return { ...state, consecutiveLosses: won ? 0 : state.consecutiveLosses + 1 };
}
