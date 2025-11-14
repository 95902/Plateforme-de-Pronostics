import { Router } from 'express';
import bankrollController from '../controllers/bankroll.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', bankrollController.getBankroll.bind(bankrollController));
router.get('/transactions', bankrollController.getTransactions.bind(bankrollController));
router.get('/statistics', bankrollController.getStatistics.bind(bankrollController));
router.post('/deposit', bankrollController.deposit.bind(bankrollController));
router.post('/withdraw', bankrollController.withdraw.bind(bankrollController));

export default router;
