/**
 * Fixed odds offered on combined bets (couplé, trio, quarté, quinté), estimated from the win odds.
 *
 * Real PMU dividends are only known after the race (pari mutuel: they depend on the pool).
 * Instead, the odds are fixed when the bet is placed:
 *   1. win probabilities are the implied probabilities of the win odds, normalized to sum to 1;
 *   2. the probability that the selected runners take the first N places, in any order, follows
 *      the Harville model: a runner wins a place with its probability renormalized over the
 *      runners not placed yet;
 *   3. odds = (1 − takeout) / probability.
 * Simple bets keep the runner's win odds.
 */

export type BetType = 'simple' | 'couple' | 'trio' | 'quarte' | 'quinte';

export const PLACES_BY_BET_TYPE: Record<BetType, number> = {
  simple: 1,
  couple: 2,
  trio: 3,
  quarte: 4,
  quinte: 5
};

/** Share of the stakes kept by the operator, approximating the PMU pools for these bets */
export const TAKEOUT_BY_BET_TYPE: Record<Exclude<BetType, 'simple'>, number> = {
  couple: 0.25,
  trio: 0.25,
  quarte: 0.3,
  quinte: 0.35
};

/** Combined odds never pay back less than this */
export const MIN_COMBINED_ODDS = 1.1;

/** Win probabilities implied by the odds of every runner of the race, normalized to sum to 1 */
export function impliedProbabilities(oddsByRunner: Map<number, number>): Map<number, number> {
  const total = [...oddsByRunner.values()].reduce((sum, odds) => sum + 1 / odds, 0);
  return new Map([...oddsByRunner].map(([runnerId, odds]) => [runnerId, 1 / odds / total]));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
  );
}

/** Harville probability that `selection` are exactly the first selection.length finishers, any order */
export function topPlacesProbability(probabilities: Map<number, number>, selection: number[]): number {
  return permutations(selection).reduce((total, order) => {
    let probability = 1;
    let alreadyPlaced = 0;
    for (const runnerId of order) {
      const p = probabilities.get(runnerId) ?? 0;
      probability *= p / (1 - alreadyPlaced);
      alreadyPlaced += p;
    }
    return total + probability;
  }, 0);
}

/**
 * Odds of a bet on `selection` given the win odds of every runner of the race.
 * Throws if a selected runner has no odds.
 */
export function combinedOdds(betType: BetType, oddsByRunner: Map<number, number>, selection: number[]): number {
  for (const runnerId of selection) {
    if (!oddsByRunner.has(runnerId)) throw new Error(`No odds for runner ${runnerId}`);
  }

  if (betType === 'simple') {
    return oddsByRunner.get(selection[0])!;
  }

  const probability = topPlacesProbability(impliedProbabilities(oddsByRunner), selection);
  const odds = (1 - TAKEOUT_BY_BET_TYPE[betType]) / probability;
  return Math.max(MIN_COMBINED_ODDS, Math.round(odds * 100) / 100);
}
