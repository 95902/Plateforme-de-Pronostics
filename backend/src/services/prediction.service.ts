import pool from '../config/database.js';
import { Prediction } from '../types/index.js';
import { analyzeRace } from './strategy-engine.js';

/** A runner is a value bet when its expected profit is at least 10% of the stake */
const VALUE_BET_MIN_EDGE = 0.1;

export class PredictionService {
  /**
   * Calculate prediction score for a runner
   * Algorithm uses multi-criteria scoring:
   * - Performance historique (40%)
   * - Forme récente (25%)
   * - Jockey/Entraîneur (15%)
   * - Conditions course (10%)
   * - Valeur cote (10%)
   */
  calculatePredictionScore(runner: any, race: any): number {
    let score = 0;

    // 1. Performance historique (40%)
    const careerWinRate = runner.career_total_races > 0
      ? (runner.career_wins / runner.career_total_races)
      : 0;
    score += careerWinRate * 40;

    // 2. Forme récente (25%) - simplified version
    // In production, analyze last 5 races
    const recentFormScore = Math.min(25, careerWinRate * 30);
    score += recentFormScore;

    // 3. Jockey/Entraîneur (15%)
    const jockeyScore = (runner.jockey_win_rate || 0) * 0.6;
    const trainerScore = (runner.trainer_win_rate || 0) * 0.4;
    score += (jockeyScore + trainerScore) * 15;

    // 4. Conditions course (10%)
    // Check if horse's optimal distance matches race distance
    const distanceMatch = runner.optimal_distance === race.distance ? 1 : 0.5;
    score += distanceMatch * 10;

    // 5. Valeur cote (10%)
    // Lower odds = favorite, higher score for favorites
    const oddsScore = runner.final_odds ? Math.max(0, 10 - (runner.final_odds / 2)) : 5;
    score += Math.min(10, oddsScore);

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate confidence level based on score
   */
  getConfidenceLevel(score: number): 'Low' | 'Medium' | 'High' {
    if (score >= 70) return 'High';
    if (score >= 50) return 'Medium';
    return 'Low';
  }

  /**
   * Generate predictions for a race
   */
  async generateRacePredictions(raceId: number): Promise<Prediction[]> {
    try {
      // Get race details
      const raceResult = await pool.query(
        'SELECT * FROM races WHERE id = $1',
        [raceId]
      );

      if (raceResult.rows.length === 0) {
        throw new Error('Race not found');
      }

      const race = raceResult.rows[0];

      // Get runners with full details
      const runnersResult = await pool.query(
        `SELECT
          r.id, r.saddle_number, r.final_odds, r.morning_odds,
          h.id as horse_id, h.name as horse_name, h.career_total_races,
          h.career_wins, h.optimal_distance,
          j.career_win_rate as jockey_win_rate,
          t.career_win_rate as trainer_win_rate
         FROM runners r
         JOIN horses h ON r.horse_id = h.id
         JOIN jockeys j ON r.jockey_id = j.id
         JOIN trainers t ON r.trainer_id = t.id
         WHERE r.race_id = $1`,
        [raceId]
      );

      const scored = runnersResult.rows.map((runner) => ({
        runner,
        odds: runner.final_odds || runner.morning_odds || 0,
        score: this.calculatePredictionScore(runner, race)
      }));

      // Same probability model as the strategy engine: scores normalized over the race
      const analysisByRunner = new Map(
        analyzeRace(
          scored.map(({ runner, odds, score }) => ({
            runner_id: runner.id,
            saddle_number: runner.saddle_number,
            odds,
            score
          }))
        ).map((analysis) => [analysis.runner_id, analysis])
      );

      const predictions: Prediction[] = scored.map(({ runner, odds, score }) => {
        const analysis = analysisByRunner.get(runner.id);
        const isValue = analysis !== undefined && analysis.expected_value >= VALUE_BET_MIN_EDGE;

        return {
          runner_id: runner.id,
          horse_name: runner.horse_name,
          saddle_number: runner.saddle_number,
          odds,
          prediction_score: Math.round(score * 100) / 100,
          confidence_level: this.getConfidenceLevel(score),
          is_value_bet: isValue,
          // Expected profit in % of the stake
          expected_value: isValue ? Math.round(analysis.expected_value * 10000) / 100 : undefined
        };
      });

      // Sort by prediction score descending
      predictions.sort((a, b) => b.prediction_score - a.prediction_score);

      // Update database with prediction scores
      for (const pred of predictions) {
        await pool.query(
          `UPDATE runners
           SET prediction_score = $1, confidence_level = $2
           WHERE id = $3`,
          [pred.prediction_score, pred.confidence_level, pred.runner_id]
        );
      }

      return predictions;
    } catch (error) {
      console.error('Generate predictions error:', error);
      throw error;
    }
  }

  /**
   * Get value bets for a race
   */
  async getValueBets(raceId: number): Promise<Prediction[]> {
    const predictions = await this.generateRacePredictions(raceId);
    return predictions.filter(p => p.is_value_bet);
  }
}

export default new PredictionService();
