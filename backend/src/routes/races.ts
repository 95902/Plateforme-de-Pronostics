import { Router } from 'express';
import racesController from '../controllers/races.controller.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', racesController.getRaces.bind(racesController));
router.get('/upcoming', racesController.getUpcomingRaces.bind(racesController));
router.get('/today', racesController.getTodayRaces.bind(racesController));
router.get('/:id', racesController.getRaceById.bind(racesController));

// Admin
router.post('/:id/results', authMiddleware, requireAdmin, racesController.recordResults.bind(racesController));
router.post('/:id/cancel', authMiddleware, requireAdmin, racesController.cancelRace.bind(racesController));

export default router;
