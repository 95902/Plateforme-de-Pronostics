import pool from '../config/database.js';
import predictionService from './prediction.service.js';
import betService from './bet.service.js';
import { analyzeRace, decideBets, nextState, proposeBets, totalStake as sumStakes, INITIAL_STATE } from './strategy-engine.js';
import type { EngineRunner, StrategyState, StrategyType } from './strategy-engine.js';
import { HttpError } from '../utils/http-error.js';

/** Active strategies bet on scheduled races starting within this window */
const LIVE_BETTING_WINDOW = '1 hour';
const MAX_BACKTEST_RACES = 5000;
const RECENT_BETS_KEPT = 50;

interface StrategyRow {
  id: number;
  user_id: number;
  name: string;
  type: StrategyType;
  parameters: Record<string, unknown>;
}

export interface BacktestConfig {
  from: string;
  to: string;
  initial_bankroll: number;
}

export interface BacktestResults {
  summary: {
    races_analyzed: number;
    races_bet: number;
    total_bets: number;
    winning_bets: number;
    win_rate: number;
    total_staked: number;
    total_returned: number;
    net_profit: number;
    roi: number;
    max_drawdown: number;
    initial_bankroll: number;
    final_bankroll: number;
    busted: boolean;
  };
  /** Bankroll at the end of each day with at least one bet */
  equity_curve: { date: string; bankroll: number }[];
  recent_bets: {
    race_id: number;
    date: string;
    saddle_number: number;
    odds: number;
    stake: number;
    won: boolean;
    payout: number;
  }[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round4 = (value: number) => Math.round(value * 10000) / 10000;

/** Format a DATE column (parsed by pg as local midnight) as YYYY-MM-DD */
const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export class StrategyService {
  /**
   * Load the runners of several races with what the prediction model needs,
   * scored and ready for the strategy engine.
   */
  async loadEngineRunners(races: { id: number; distance: number }[]): Promise<Map<number, EngineRunner[]>> {
    const byRace = new Map<number, EngineRunner[]>();
    if (races.length === 0) return byRace;

    const raceById = new Map(races.map((race) => [race.id, race]));
    const result = await pool.query(
      `SELECT
        r.id, r.race_id, r.saddle_number,
        COALESCE(r.final_odds, r.morning_odds) as odds,
        h.career_total_races, h.career_wins, h.optimal_distance,
        j.career_win_rate as jockey_win_rate,
        t.career_win_rate as trainer_win_rate
       FROM runners r
       JOIN horses h ON r.horse_id = h.id
       JOIN jockeys j ON r.jockey_id = j.id
       JOIN trainers t ON r.trainer_id = t.id
       WHERE r.race_id = ANY($1::int[])`,
      [races.map((race) => race.id)]
    );

    for (const row of result.rows) {
      const race = raceById.get(row.race_id)!;
      const score = predictionService.calculatePredictionScore({ ...row, final_odds: row.odds }, race);
      const runners = byRace.get(row.race_id) ?? [];
      runners.push({ runner_id: row.id, saddle_number: row.saddle_number, odds: row.odds, score });
      byRace.set(row.race_id, runners);
    }

    return byRace;
  }

  async getUserStrategy(userId: number, strategyId: number): Promise<StrategyRow> {
    const result = await pool.query(
      'SELECT id, user_id, name, type, parameters FROM strategies WHERE id = $1 AND user_id = $2',
      [strategyId, userId]
    );
    if (result.rows.length === 0) {
      throw new HttpError(404, 'Strategy not found');
    }
    return result.rows[0];
  }

  /**
   * Replay a strategy on finished races with a virtual bankroll and store the run in `simulations`.
   */
  async backtest(userId: number, strategyId: number, config: BacktestConfig) {
    const strategy = await this.getUserStrategy(userId, strategyId);
    if (strategy.type === 'CUSTOM') {
      throw new HttpError(400, 'CUSTOM strategies cannot be backtested yet');
    }

    const racesResult = await pool.query(
      `SELECT id, date, distance FROM races
       WHERE status = 'finished' AND date BETWEEN $1 AND $2
       ORDER BY date, time, id
       LIMIT $3`,
      [config.from, config.to, MAX_BACKTEST_RACES]
    );
    const races: { id: number; date: Date; distance: number }[] = racesResult.rows;
    const raceIds = races.map((race) => race.id);

    const [runnersByRace, winnersResult] = await Promise.all([
      this.loadEngineRunners(races),
      pool.query(
        `SELECT DISTINCT ON (race_id) race_id, runner_id
         FROM results
         WHERE race_id = ANY($1::int[]) AND NOT disqualified
         ORDER BY race_id, finish_position`,
        [raceIds]
      )
    ]);
    const winnerByRace = new Map<number, number>(winnersResult.rows.map((row) => [row.race_id, row.runner_id]));

    let bankroll = config.initial_bankroll;
    let peak = bankroll;
    let maxDrawdown = 0;
    let state: StrategyState = INITIAL_STATE;
    let busted = false;
    let racesAnalyzed = 0;
    let racesBet = 0;
    let totalBets = 0;
    let winningBets = 0;
    let totalStaked = 0;
    let totalReturned = 0;
    const equityByDate = new Map<string, number>();
    const recentBets: BacktestResults['recent_bets'] = [];

    for (const race of races) {
      const winner = winnerByRace.get(race.id);
      if (winner === undefined) continue;
      racesAnalyzed++;

      const analysis = analyzeRace(runnersByRace.get(race.id) ?? []);
      const decisions = proposeBets(strategy.type, strategy.parameters, analysis, bankroll, state);
      if (decisions.length === 0) continue;

      // The strategy wants to bet but cannot cover its stakes anymore: stop here
      if (sumStakes(decisions) > bankroll) {
        busted = true;
        break;
      }

      racesBet++;
      const date = toISODate(race.date);
      let raceWon = false;

      for (const decision of decisions) {
        const won = decision.runner_id === winner;
        const payout = won ? round2(decision.stake * decision.odds) : 0;

        bankroll = round2(bankroll - decision.stake + payout);
        totalBets++;
        totalStaked += decision.stake;
        totalReturned += payout;
        if (won) {
          winningBets++;
          raceWon = true;
        }

        recentBets.push({
          race_id: race.id,
          date,
          saddle_number: decision.saddle_number,
          odds: decision.odds,
          stake: decision.stake,
          won,
          payout
        });
        if (recentBets.length > RECENT_BETS_KEPT) recentBets.shift();
      }

      state = nextState(strategy.type, strategy.parameters, state, raceWon);
      peak = Math.max(peak, bankroll);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - bankroll) / peak : 0);
      equityByDate.set(date, bankroll);
    }

    const results: BacktestResults = {
      summary: {
        races_analyzed: racesAnalyzed,
        races_bet: racesBet,
        total_bets: totalBets,
        winning_bets: winningBets,
        win_rate: totalBets > 0 ? round4(winningBets / totalBets) : 0,
        total_staked: round2(totalStaked),
        total_returned: round2(totalReturned),
        net_profit: round2(totalReturned - totalStaked),
        roi: totalStaked > 0 ? round4((totalReturned - totalStaked) / totalStaked) : 0,
        max_drawdown: round4(maxDrawdown),
        initial_bankroll: config.initial_bankroll,
        final_bankroll: bankroll,
        busted
      },
      equity_curve: [...equityByDate].map(([date, value]) => ({ date, bankroll: value })),
      recent_bets: recentBets.reverse()
    };

    const simulationResult = await pool.query(
      `INSERT INTO simulations (user_id, strategy_id, name, config, results, status, completed_at)
       VALUES ($1, $2, $3, $4, $5, 'completed', CURRENT_TIMESTAMP)
       RETURNING id, created_at`,
      [
        userId,
        strategy.id,
        `${strategy.name} ${config.from} → ${config.to}`,
        JSON.stringify({ ...config, strategy_type: strategy.type, parameters: strategy.parameters }),
        JSON.stringify(results)
      ]
    );

    return { id: simulationResult.rows[0].id, created_at: simulationResult.rows[0].created_at, config, results };
  }

  async listSimulations(userId: number, strategyId: number) {
    await this.getUserStrategy(userId, strategyId);
    const result = await pool.query(
      `SELECT id, name, config, results, created_at
       FROM simulations
       WHERE user_id = $1 AND strategy_id = $2 AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId, strategyId]
    );
    return result.rows;
  }

  /**
   * Rebuild a strategy's progression state (e.g. Martingale losing streak) from its settled bets.
   */
  async computeLiveState(strategy: StrategyRow): Promise<StrategyState> {
    const result = await pool.query(
      `SELECT race_id, bool_or(status = 'won') as won
       FROM bets
       WHERE strategy_id = $1 AND status IN ('won', 'lost')
       GROUP BY race_id
       ORDER BY MAX(settled_at), race_id`,
      [strategy.id]
    );
    return result.rows.reduce(
      (state: StrategyState, row: { won: boolean }) => nextState(strategy.type, strategy.parameters, state, row.won),
      INITIAL_STATE
    );
  }

  /**
   * Place the bets of every active strategy on scheduled races starting soon.
   * A strategy bets at most once per race, so running this repeatedly is safe.
   */
  async runActiveStrategies(): Promise<{ placed: number; skipped: number }> {
    const summary = { placed: 0, skipped: 0 };

    const strategiesResult = await pool.query(
      `SELECT id, user_id, name, type, parameters FROM strategies
       WHERE is_active AND type <> 'CUSTOM'
       ORDER BY id`
    );
    if (strategiesResult.rows.length === 0) return summary;

    const racesResult = await pool.query(
      `SELECT id, distance FROM races
       WHERE status = 'scheduled'
         AND (date + time) BETWEEN LOCALTIMESTAMP AND LOCALTIMESTAMP + $1::interval
       ORDER BY date, time, id`,
      [LIVE_BETTING_WINDOW]
    );
    if (racesResult.rows.length === 0) return summary;

    const runnersByRace = await this.loadEngineRunners(racesResult.rows);

    for (const strategy of strategiesResult.rows as StrategyRow[]) {
      const alreadyBet = await pool.query(
        'SELECT DISTINCT race_id FROM bets WHERE strategy_id = $1 AND race_id = ANY($2::int[])',
        [strategy.id, racesResult.rows.map((race) => race.id)]
      );
      const betRaces = new Set(alreadyBet.rows.map((row) => row.race_id));
      const state = await this.computeLiveState(strategy);

      for (const race of racesResult.rows) {
        if (betRaces.has(race.id)) continue;

        const userResult = await pool.query('SELECT bankroll FROM users WHERE id = $1', [strategy.user_id]);
        const bankroll: number = userResult.rows[0].bankroll;
        const decisions = decideBets(
          strategy.type,
          strategy.parameters,
          analyzeRace(runnersByRace.get(race.id) ?? []),
          bankroll,
          state
        );

        for (const decision of decisions) {
          try {
            await betService.placeBet(strategy.user_id, {
              race_id: race.id,
              bet_type: 'simple',
              stake: decision.stake,
              selections: [{ runner_id: decision.runner_id }],
              strategy_id: strategy.id
            });
            summary.placed++;
          } catch (error) {
            // e.g. insufficient funds or betting closed meanwhile: skip this bet
            if (!(error instanceof HttpError)) throw error;
            console.warn(`Strategy ${strategy.id} skipped a bet on race ${race.id}: ${error.message}`);
            summary.skipped++;
          }
        }
      }
    }

    return summary;
  }
}

export default new StrategyService();
