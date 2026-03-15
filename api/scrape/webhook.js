import { pool, query, initDatabase } from '../src/config/database.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
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

    res.json({ success: true });
  } catch (error) {
    console.error('ScrapeWebhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
