import { Router } from 'express';
import predictionsController from '../controllers/predictions.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Heavy query over many races: signed-in users only
router.get('/evaluation', authMiddleware, predictionsController.getEvaluation.bind(predictionsController));
router.get('/race/:raceId', predictionsController.getRacePredictions.bind(predictionsController));
router.get('/race/:raceId/value-bets', predictionsController.getValueBets.bind(predictionsController));

export default router;
