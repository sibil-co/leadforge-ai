import jwt from 'jsonwebtoken';
import axios from 'axios';
import { query } from '../db.js';

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
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const jobResult = await query(
      'SELECT * FROM scrape_jobs WHERE id = $1 AND user_id = $2',
      [id, userId]
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
      ['cancelled', id]
    );

    return res.json({ success: true, message: 'Crawl cancelled' });
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
}
