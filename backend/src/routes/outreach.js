import { Router } from 'express';
import { startOutreach, sendMessage, getConversation, manualIntervention } from '../controllers/outreachController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.post('/start/:id', startOutreach);
router.post('/message/:id', sendMessage);
router.get('/conversation/:id', getConversation);
router.post('/intervene/:id', manualIntervention);

export default router;
