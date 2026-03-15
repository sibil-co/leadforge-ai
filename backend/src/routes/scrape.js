import { Router } from 'express';
import { triggerScrape, scrapeWebhook, getScrapeJobs, getScrapeJobStatus } from '../controllers/scrapeController.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/trigger', authMiddleware, triggerScrape);
router.post('/webhook', optionalAuth, scrapeWebhook);
router.get('/jobs', authMiddleware, getScrapeJobs);
router.get('/jobs/:id', authMiddleware, getScrapeJobStatus);

export default router;
