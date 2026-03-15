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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

  if (!country || !keywords || !keywords.length) {
    return res.status(400).json({ error: 'Country and keywords are required' });
  }

  try {
    const jobResult = await query(
      `INSERT INTO scrape_jobs (user_id, country, city, keywords, status) 
       VALUES ($1, $2, $3, $4, 'running') RETURNING *`,
      [userId, country, city, keywords]
    );

    const job = jobResult.rows[0];

    const apiToken = process.env.APIFY_API_TOKEN;
    const actorId = process.env.APIFY_ACTOR_ID || 'apify/facebook-groups-scraper';

    if (apiToken) {
      try {
        const input = {
          country,
          city: city || '',
          keywords,
          limit: 50,
          proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL']
          }
        };

        const response = await axios.post(
          `https://api.apify.com/v2/acts/${actorId}/runs`,
          input,
          {
            params: {
              token: apiToken,
              webhooks: [
                {
                  event: 'RUN.SUCCEEDED',
                  url: `https://leadforge-ai-psi.vercel.app/api/scrape/webhook`
                }
              ]
            }
          }
        );

        await query(
          'UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2',
          [response.data.data.runId, job.id]
        );

        job.apify_run_id = response.data.data.runId;
      } catch (apifyError) {
        console.error('Apify error:', apifyError.message);
        await query(
          'UPDATE scrape_jobs SET status = $1 WHERE id = $2',
          ['failed', job.id]
        );
      }
    }

    res.status(201).json({
      job,
      message: 'Scraper triggered successfully'
    });
  } catch (error) {
    console.error('TriggerScrape error:', error);
    res.status(500).json({ error: 'Failed to trigger scraper' });
  }
}
