import { Router } from 'express';
import predictionsController from '../controllers/predictions.controller.js';

const router = Router();

router.get('/race/:raceId', predictionsController.getRacePredictions.bind(predictionsController));
router.get('/race/:raceId/value-bets', predictionsController.getValueBets.bind(predictionsController));

export default router;
