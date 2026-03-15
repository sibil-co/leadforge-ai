import { Router } from 'express';
import { triggerScrape, scrapeWebhook, getScrapeJobs, getScrapeJobStatus, webhookGroups, webhookPosts, webhookComments, cancelScrapeJob } from '../controllers/scrapeController.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/trigger', authMiddleware, triggerScrape);
router.post('/webhook', optionalAuth, scrapeWebhook);
router.post('/webhook/groups', optionalAuth, webhookGroups);
router.post('/webhook/posts', optionalAuth, webhookPosts);
router.post('/webhook/comments', optionalAuth, webhookComments);
router.get('/jobs', authMiddleware, getScrapeJobs);
router.get('/jobs/:id', authMiddleware, getScrapeJobStatus);
router.post('/jobs/:id/cancel', authMiddleware, cancelScrapeJob);

export default router;
