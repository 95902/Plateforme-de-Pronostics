import pool from '../config/database.js';
import { Prediction } from '../types/index.js';
import { analyzeRace } from './strategy-engine.js';
import { HttpError } from '../utils/http-error.js';
import { formatForm, predictionScore } from './prediction-model.js';
import { loadRunnersWithFeatures } from './runner-features.service.js';

/** A runner is a value bet when its expected profit is at least 10% of the stake */
const VALUE_BET_MIN_EDGE = 0.1;

export class PredictionService {
  /**
   * Calculate confidence level based on score
   */
  getConfidenceLevel(score: number): 'Low' | 'Medium' | 'High' {
    // About the top 3% of runners are High and the next 20% Medium
    if (score >= 40) return 'High';
    if (score >= 30) return 'Medium';
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
        throw new HttpError(404, 'Race not found');
      }

      const race = raceResult.rows[0];

      // Statistics computed only from races finished before this one
      const runners = await loadRunnersWithFeatures([raceId]);
      const scored = runners.map((runner) => ({
        runner,
        odds: runner.odds || 0,
        score: predictionScore(runner.features, runner.odds)
      }));

      // Same probability model as the strategy engine: scores normalized over the race
      const analysisByRunner = new Map(
        analyzeRace(
          scored.map(({ runner, odds, score }) => ({
            runner_id: runner.runner_id,
            saddle_number: runner.saddle_number,
            odds,
            score
          }))
        ).map((analysis) => [analysis.runner_id, analysis])
      );

      const predictions: Prediction[] = scored.map(({ runner, odds, score }) => {
        const analysis = analysisByRunner.get(runner.runner_id);
        const isValue = analysis !== undefined && analysis.expected_value >= VALUE_BET_MIN_EDGE;

        return {
          runner_id: runner.runner_id,
          horse_name: runner.horse_name,
          saddle_number: runner.saddle_number,
          odds,
          prediction_score: Math.round(score * 100) / 100,
          confidence_level: this.getConfidenceLevel(score),
          is_value_bet: isValue,
          // Expected profit in % of the stake
          expected_value: isValue ? Math.round(analysis.expected_value * 10000) / 100 : undefined,
          form: formatForm(runner.features.recent_positions),
          horse_starts: runner.features.horse_starts,
          horse_wins: runner.features.horse_wins
        };
      });

      // Sort by prediction score descending
      predictions.sort((a, b) => b.prediction_score - a.prediction_score);

      return predictions;
    } catch (error) {
      if (!(error instanceof HttpError)) {
        console.error('Generate predictions error:', error);
      }
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
