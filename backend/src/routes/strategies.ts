import { Router } from 'express';
import strategiesController from '../controllers/strategies.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', strategiesController.getStrategies.bind(strategiesController));
router.get('/:id', strategiesController.getStrategyById.bind(strategiesController));
router.post('/', strategiesController.createStrategy.bind(strategiesController));
router.put('/:id', strategiesController.updateStrategy.bind(strategiesController));
router.delete('/:id', strategiesController.deleteStrategy.bind(strategiesController));

export default router;
