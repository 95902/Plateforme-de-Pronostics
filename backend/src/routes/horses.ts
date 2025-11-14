import { Router } from 'express';
import horsesController from '../controllers/horses.controller.js';

const router = Router();

router.get('/', horsesController.getHorses.bind(horsesController));
router.get('/:id', horsesController.getHorseById.bind(horsesController));

export default router;
