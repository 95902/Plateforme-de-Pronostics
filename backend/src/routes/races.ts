import { Router } from 'express';
import racesController from '../controllers/races.controller.js';

const router = Router();

router.get('/', racesController.getRaces.bind(racesController));
router.get('/upcoming', racesController.getUpcomingRaces.bind(racesController));
router.get('/today', racesController.getTodayRaces.bind(racesController));
router.get('/:id', racesController.getRaceById.bind(racesController));

export default router;
