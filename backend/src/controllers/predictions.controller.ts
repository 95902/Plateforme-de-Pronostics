import { Request, Response } from 'express';
import predictionService from '../services/prediction.service.js';
import { parseId } from '../utils/validation.js';
import { HttpError, sendError } from '../utils/http-error.js';

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
}

export default new PredictionsController();
