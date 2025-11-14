import { Request, Response } from 'express';
import predictionService from '../services/prediction.service.js';

export class PredictionsController {
  async getRacePredictions(req: Request, res: Response) {
    try {
      const { raceId } = req.params;

      const predictions = await predictionService.generateRacePredictions(parseInt(raceId));

      res.json({
        race_id: parseInt(raceId),
        predictions,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get predictions error:', error);
      res.status(500).json({
        error: { message: 'Failed to generate predictions', status: 500 }
      });
    }
  }

  async getValueBets(req: Request, res: Response) {
    try {
      const { raceId } = req.params;

      const valueBets = await predictionService.getValueBets(parseInt(raceId));

      res.json({
        race_id: parseInt(raceId),
        value_bets: valueBets,
        count: valueBets.length,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get value bets error:', error);
      res.status(500).json({
        error: { message: 'Failed to get value bets', status: 500 }
      });
    }
  }
}

export default new PredictionsController();
