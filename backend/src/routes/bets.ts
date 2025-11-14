import { Router } from 'express';
import betsController from '../controllers/bets.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', betsController.getBets.bind(betsController));
router.post('/', betsController.placeBet.bind(betsController));
router.delete('/:id', betsController.cancelBet.bind(betsController));

export default router;
