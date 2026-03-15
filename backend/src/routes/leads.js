import { Router } from 'express';
import { getLeads, getLead, updateLead, deleteLead, getLeadStats } from '../controllers/leadsController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getLeads);
router.get('/stats', getLeadStats);
router.get('/:id', getLead);
router.put('/:id', updateLead);
router.delete('/:id', deleteLead);

export default router;
