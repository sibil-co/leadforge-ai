import { query } from '../config/database.js';
import { triggerApifyScraper, getApifyRunStatus, AVAILABLE_ACTORS } from '../services/apifyService.js';
import { startWorkflow, handleGroupsComplete, handlePostsComplete, handleCommentsComplete, handleStageFailure } from '../services/scrapeOrchestrator.js';

export const triggerScrape = async (req, res) => {
  try {
    const userId = req.userId;
    const { country, city, keywords } = req.body;

    if (!country || !keywords || !keywords.length) {
      return res.status(400).json({ error: 'Country and keywords are required' });
    }

    try {
      const { job, apifyRunId } = await startWorkflow(userId, country, city, keywords);

      res.status(201).json({
        job: { ...job, apify_run_id: apifyRunId },
        message: 'Crawl started - Finding Facebook groups...'
      });
    } catch (apifyError) {
      console.error('Apify trigger error:', apifyError);
      res.status(500).json({ error: 'Failed to start crawl: ' + apifyError.message });
    }
  } catch (error) {
    console.error('TriggerScrape error:', error);
    res.status(500).json({ error: 'Failed to trigger scraper' });
  }
};

export const scrapeWebhook = async (req, res) => {
  try {
    const { runId, status, items } = req.body;

    if (!runId) {
      return res.status(400).json({ error: 'Missing runId' });
    }

    const jobResult = await query(
      'SELECT * FROM scrape_jobs WHERE apify_run_id = $1',
      [runId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];

    if (status === 'SUCCEEDED' && items && items.length > 0) {
      const userId = job.user_id;

      for (const item of items) {
        await query(
          `INSERT INTO leads (user_id, name, price, city, source_url, source_type, facebook_id, metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new')`,
          [
            userId,
            item.name || item.authorName || 'Unknown',
            item.price || null,
            item.location || item.city || job.city,
            item.url || item.postUrl || null,
            item.sourceType || 'group',
            item.authorId || item.facebookId || null,
            JSON.stringify(item)
          ]
        );
      }

      await query(
        `UPDATE scrape_jobs SET status = 'completed', leads_count = $1, completed_at = NOW() WHERE id = $2`,
        [items.length, job.id]
      );
    } else if (status === 'FAILED') {
      await query(
        'UPDATE scrape_jobs SET status = $1 WHERE id = $2',
        ['failed', job.id]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('ScrapeWebhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

export const getScrapeJobs = async (req, res) => {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT * FROM scrape_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM scrape_jobs WHERE user_id = $1',
      [userId]
    );

    res.json({
      jobs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    console.error('GetScrapeJobs error:', error);
    res.status(500).json({ error: 'Failed to fetch scrape jobs' });
  }
};

export const getScrapeJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const result = await query(
      'SELECT * FROM scrape_jobs WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = result.rows[0];

    if (job.apify_run_id && job.status === 'running') {
      const apifyStatus = await getApifyRunStatus(job.apify_run_id);
      
      if (apifyStatus.data.status !== 'RUNNING') {
        const newStatus = apifyStatus.data.status === 'SUCCEEDED' ? 'completed' : 'failed';
        await query(
          'UPDATE scrape_jobs SET status = $1 WHERE id = $2',
          [newStatus, job.id]
        );
        job.status = newStatus;
      }
    }

    res.json(job);
  } catch (error) {
    console.error('GetScrapeJobStatus error:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
};

export const webhookGroups = async (req, res) => {
  try {
    const { runId, status, items } = req.body;

    if (!runId) {
      return res.status(400).json({ error: 'Missing runId' });
    }

    if (status === 'FAILED') {
      await handleStageFailure(runId);
      return res.json({ success: true, message: 'Groups scrape failed, triggering retry' });
    }

    const jobResult = await query(
      'SELECT keywords FROM scrape_jobs WHERE apify_run_id = $1',
      [runId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const keywords = jobResult.rows[0].keywords || [];
    await handleGroupsComplete(runId, items, keywords);

    res.json({ success: true, message: 'Groups processed, starting posts scrape' });
  } catch (error) {
    console.error('WebhookGroups error:', error);
    res.status(500).json({ error: 'Groups webhook processing failed' });
  }
};

export const webhookPosts = async (req, res) => {
  try {
    const { runId, status, items } = req.body;

    if (!runId) {
      return res.status(400).json({ error: 'Missing runId' });
    }

    if (status === 'FAILED') {
      await handleStageFailure(runId);
      return res.json({ success: true, message: 'Posts scrape failed, triggering retry' });
    }

    const jobResult = await query(
      'SELECT keywords FROM scrape_jobs WHERE apify_run_id = $1',
      [runId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const keywords = jobResult.rows[0].keywords || [];
    await handlePostsComplete(runId, items, keywords);

    res.json({ success: true, message: 'Posts processed, starting comments scrape' });
  } catch (error) {
    console.error('WebhookPosts error:', error);
    res.status(500).json({ error: 'Posts webhook processing failed' });
  }
};

export const webhookComments = async (req, res) => {
  try {
    const { runId, status, items } = req.body;

    if (!runId) {
      return res.status(400).json({ error: 'Missing runId' });
    }

    if (status === 'FAILED') {
      await handleStageFailure(runId);
      return res.json({ success: true, message: 'Comments scrape failed, triggering retry' });
    }

    const jobResult = await query(
      'SELECT keywords FROM scrape_jobs WHERE apify_run_id = $1',
      [runId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const keywords = jobResult.rows[0].keywords || [];
    await handleCommentsComplete(runId, items, keywords);

    res.json({ success: true, message: 'Crawl completed' });
  } catch (error) {
    console.error('WebhookComments error:', error);
    res.status(500).json({ error: 'Comments webhook processing failed' });
  }
};
