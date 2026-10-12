import { Request, Response } from 'express';
import predictionService from '../services/prediction.service.js';
import { parseId } from '../utils/validation.js';
import { HttpError, sendError } from '../utils/http-error.js';
import { evaluateModel } from '../services/evaluation.service.js';

export class PredictionsController {
  async getRacePredictions(req: Request, res: Response) {
    const raceId = parseId(req.params.raceId);
    if (!raceId) return sendError(res, 400, 'Invalid race id');

    try {
      const predictions = await predictionService.generateRacePredictions(raceId);

      res.json({
        race_id: raceId,
        predictions,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(res, error.status, error.message);
      }
      console.error('Get predictions error:', error);
      sendError(res, 500, 'Failed to generate predictions');
    }
  }

  async getValueBets(req: Request, res: Response) {
    const raceId = parseId(req.params.raceId);
    if (!raceId) return sendError(res, 400, 'Invalid race id');

    try {
      const valueBets = await predictionService.getValueBets(raceId);

      res.json({
        race_id: raceId,
        value_bets: valueBets,
        count: valueBets.length,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return sendError(res, error.status, error.message);
      }
      console.error('Get value bets error:', error);
      sendError(res, 500, 'Failed to get value bets');
    }
  }

  /**
   * Model vs market on the races finished between `from` and `to` (default: the last 12 months)
   */
  async getEvaluation(req: Request, res: Response) {
    const isDate = (value: unknown): value is string =>
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    const today = new Date().toISOString().slice(0, 10);
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { from = oneYearAgo, to = today } = req.query;

    if (!isDate(from) || !isDate(to) || from > to) {
      return sendError(res, 400, 'from and to must be dates (YYYY-MM-DD) with from <= to');
    }

    try {
      res.json(await evaluateModel(from, to));
    } catch (error) {
      console.error('Evaluation error:', error);
      sendError(res, 500, 'Evaluation failed');
    }
  }
}

export default new PredictionsController();
