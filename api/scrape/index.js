import jwt from 'jsonwebtoken';
import axios from 'axios';
import { query, initDatabase } from './db.js';

const getUserId = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    return decoded.userId;
  } catch {
    return null;
  }
};

const abortApifyRun = async (runId) => {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken || !runId) return;
  try {
    await axios.post(
      `https://api.apify.com/v2/actor-runs/${runId}/abort`,
      {},
      { params: { token: apiToken } }
    );
  } catch (error) {
    console.error('Abort error:', error.message);
  }
};

export default async function handler(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const method = req.method;
  const pathname = req.url || '';

  if (pathname.startsWith('/webhook')) {
    if (method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(200).end();
    }

    await initDatabase();
    const { runId, status, items } = req.body || {};

    if (!runId) {
      return res.status(400).json({ error: 'Missing runId' });
    }

    try {
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

      return res.json({ success: true });
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  if (pathname.startsWith('/jobs/') && pathname.endsWith('/cancel')) {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const jobId = pathname.split('/')[2];

    if (method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const jobResult = await query(
        'SELECT * FROM scrape_jobs WHERE id = $1 AND user_id = $2',
        [jobId, userId]
      );

      if (jobResult.rows.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const job = jobResult.rows[0];

      if (job.status !== 'running') {
        return res.status(400).json({ error: 'Job is not running' });
      }

      if (job.apify_run_id) {
        await abortApifyRun(job.apify_run_id);
      }

      await query(
        'UPDATE scrape_jobs SET status = $1, completed_at = NOW() WHERE id = $2',
        ['cancelled', jobId]
      );

      return res.json({ success: true, message: 'Crawl cancelled' });
    } catch (error) {
      console.error('Cancel error:', error);
      return res.status(500).json({ error: 'Failed to cancel job' });
    }
  }

  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await initDatabase();
  } catch (e) {
    console.error('DB init error:', e);
  }

  const { country, city, keywords } = req.body || {};

  try {
    if (method === 'POST') {
      if (!country || !keywords || !keywords.length) {
        return res.status(400).json({ error: 'Country and keywords are required' });
      }

      const jobResult = await query(
        `INSERT INTO scrape_jobs (user_id, country, city, keywords, status) 
         VALUES ($1, $2, $3, $4, 'running') RETURNING *`,
        [userId, country, city, keywords]
      );

      const job = jobResult.rows[0];
      const apiToken = process.env.APIFY_API_TOKEN;

      if (apiToken) {
        try {
          const response = await axios.post(
            `https://api.apify.com/v2/acts/apify/facebook-groups-scraper/runs`,
            { country, city: city || '', keywords, limit: 50 },
            { params: { token: apiToken } }
          );

          await query(
            'UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2',
            [response.data.data.runId, job.id]
          );
        } catch (apifyError) {
          console.error('Apify error:', apifyError.message);
        }
      }

      return res.status(201).json({ job, message: 'Scraper triggered successfully' });
    }

    if (method === 'GET') {
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const result = await query(
        `SELECT * FROM scrape_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, parseInt(limit), offset]
      );

      const countResult = await query(
        'SELECT COUNT(*) FROM scrape_jobs WHERE user_id = $1',
        [userId]
      );

      return res.json({
        jobs: result.rows,
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        totalPages: Math.ceil(countResult.rows[0].count / limit)
      });
    }

    res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({ error: 'Scrape failed' });
  }
}
