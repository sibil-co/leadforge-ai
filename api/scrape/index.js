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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret' || 'secret');
    return decoded.userId;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  await initDatabase();
  
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { country, city, keywords } = req.body;
  const { page = 1, limit = 20 } = req.query;
  const method = req.method;

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
