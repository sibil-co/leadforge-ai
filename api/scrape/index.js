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

// Facebook Search Scraper actor ID - powerai version (searches posts by keyword, pay per result)
const ACTOR_SEARCH = 'Ew2lyICEnHMcqRo6T';
const MAX_RESULTS = parseInt(process.env.SCRAPE_MAX_RESULTS) || 5;
const WEBHOOK_BASE_URL = (process.env.WEBHOOK_BASE_URL || '').replace(/\/$/, '');
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;

const triggerApify = async (actor, input) => {
  if (!APIFY_API_TOKEN) {
    throw new Error('APIFY_API_TOKEN not configured');
  }

  const webhookUrl = WEBHOOK_BASE_URL ? `${WEBHOOK_BASE_URL}/api/scrape?stage=${actor}` : undefined;
  const webhookConfig = webhookUrl ? {
    webhooks: [
      { event: 'RUN.SUCCEEDED', url: webhookUrl },
      { event: 'RUN.FAILED', url: webhookUrl }
    ]
  } : {};

  const response = await axios.post(
    `https://api.apify.com/v2/acts/${actor}/runs`,
    input,
    {
      params: {
        token: APIFY_API_TOKEN,
        ...webhookConfig
      }
    }
  );

  return response.data.data.id;
};

const abortApifyRun = async (runId) => {
  if (!APIFY_API_TOKEN || !runId) return;
  try {
    await axios.post(
      `https://api.apify.com/v2/actor-runs/${runId}/abort`,
      {},
      { params: { token: APIFY_API_TOKEN } }
    );
  } catch (error) {
    console.error('Abort error:', error.message);
  }
};

const extractPrice = (text) => {
  if (!text) return null;
  const patterns = [
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|THB|EUR|GBP|B|A\$|baht)/gi,
    /(?:USD|THB|EUR|GBP|B|A\$|baht)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
    /(\d+)\s*(?:million|billion|k)/gi,
    /price[:\s]*(\d+[kKmM]?)/gi,
    /rent[:\s]*(\d+[kKmM]?)/gi
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let price = match[1].replace(/,/g, '');
      if (match[0].toLowerCase().includes('million')) price = parseFloat(price) * 1000000;
      else if (match[0].toLowerCase().includes('billion')) price = parseFloat(price) * 1000000000;
      else if (match[0].toLowerCase().includes('k')) price = parseFloat(price) * 1000;
      return parseFloat(price);
    }
  }
  return null;
};

const extractArea = (text) => {
  if (!text) return null;
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:sqm|sq\.?m|m²|sqft|sq\.?ft|ft²)/gi,
    /(\d+)m2/gi,
    /(\d+)\s*(?:sqm|sqm)/gi,
    /area[:\s]*(\d+)/gi,
    /size[:\s]*(\d+)/gi
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let area = parseFloat(match[1]);
      if (match[0].toLowerCase().includes('sqft') || match[0].toLowerCase().includes('ft')) {
        area = area * 0.092903;
      }
      return area;
    }
  }
  return null;
};

const extractRentalDuration = (text) => {
  if (!text) return null;
  const patterns = [
    /(\d+)\s*(?:month|months|mo)/gi,
    /(\d+)\s*(?:year|years|yr)/gi,
    /(\d+)\s*(?:day|days)/gi,
    /(?:lease|duration)[:\s]*(\d+)\s*(?:month|year|day)/gi
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
};

const extractLocation = (text, city) => {
  if (!text) return null;
  const locationPatterns = [
    /(?:location|address|area)[:\s]*([^\n,]+)/gi,
    /(?:in|at|near)[:\s]*([^\n,]+)/gi
  ];
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return city || null;
};

const extractContact = (text) => {
  if (!text) return { phones: [], emails: [], lineId: null };
  
  const phonePattern = /(\+?[\d\s\-()]{8,})/g;
  const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const linePattern = /(?:LINE|Line|line)[\s:]*[@]?([a-zA-Z0-9._]+)/gi;
  
  const phones = text.match(phonePattern) || [];
  const emails = text.match(emailPattern) || [];
  const lineMatch = text.match(linePattern);
  const lineId = lineMatch ? lineMatch[1] : null;
  
  return {
    phones: [...new Set(phones)].slice(0, 3),
    emails: [...new Set(emails)].slice(0, 2),
    lineId
  };
};

export default async function handler(req, res) {
  const { page = 1, limit = 20, action, id: jobId, stage } = req.query;
  const method = req.method;
  
  console.log('Scrape API called:', method, 'stage:', stage, 'action:', action);

  try {
    if (stage) {
      await initDatabase();
      const { runId, status, items } = req.body || {};

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
      const keywords = job.keywords || [];

      if (status === 'FAILED') {
        await query('UPDATE scrape_jobs SET status = $1 WHERE id = $2', ['failed', job.id]);
        return res.json({ success: true, message: 'Stage failed' });
      }

      // STAGE 1: Search results - convert posts to leads
      if (stage === ACTOR_SEARCH) {
        console.log('Search complete, processing', items?.length || 0, 'results');
        
        let leadsCreated = 0;
        const jobKeywords = job.keywords || [];

        for (const item of items || []) {
          // Extract data from search result (post data from powerai actor)
          // powerai returns: message, author {name, id}, url, reactions_count, comments_count, album_preview []
          const postText = item.message || item.text || item.postText || '';
          const title = item.author?.name || item.authorName || item.name || item.userName || 'Unknown';
          const postUrl = item.url || item.postUrl || item.link || '';
          
          // Extract structured data from post text
          const price = extractPrice(postText);
          const area = extractArea(postText);
          const rentalDuration = extractRentalDuration(postText);
          const location = extractLocation(postText, job.city);
          const contacts = extractContact(postText);
          
          // Get engagement metrics - powerai uses reactions_count, comments_count
          const likes = item.reactions_count || item.likesCount || item.likes || 0;
          const commentsCount = item.comments_count || item.commentsCount || 0;
          const sharesCount = item.reshare_count || item.sharesCount || 0;
          
          // Get images - powerai returns album_preview array
          const images = item.album_preview || item.images || [];
          const imageUrls = images.map(img => img.image_file_uri || img.url).filter(Boolean);
          
          // Check if any keywords match the post text
          const itemText = postText.toLowerCase();
          const matchedKeywords = jobKeywords.filter(kw => 
            itemText.includes(kw.toLowerCase())
          );

          // Create lead if keywords match
          if (matchedKeywords.length > 0) {
            // Check for duplicate by post URL
            const existingLead = await query(
              'SELECT id FROM leads WHERE user_id = $1 AND source_url = $2',
              [job.user_id, postUrl]
            );

            if (existingLead.rows.length === 0) {
              await query(
                `INSERT INTO leads (
                  user_id, name, price, area, city, source_url, source_type, facebook_id,
                  comment_text, phone, email, metadata, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'new')`,
                [
                  job.user_id,
                  title.substring(0, 255),
                  price,
                  area,
                  location || job.city || '',
                  postUrl,
                  'post',
                  item.author?.id || item.authorId || item.userId || null,
                  postText.substring(0, 5000),
                  contacts.phones.join(', '),
                  contacts.emails.join(', '),
                  JSON.stringify({
                    rental_duration: rentalDuration,
                    contacts: contacts,
                    images: imageUrls.slice(0, 5),
                    likes,
                    comments_count: commentsCount,
                    shares_count: sharesCount,
                    posted_at: item.timestamp ? new Date(item.timestamp * 1000).toISOString() : null,
                    source: 'powerai_search',
                    keywords_matched: matchedKeywords
                  })
                ]
              );
              leadsCreated++;
            }
          }
        }

        // Update job as completed
        await query(
          `UPDATE scrape_jobs SET 
            stage = 'completed',
            status = 'completed',
            leads_count = $1,
            completed_at = NOW()
          WHERE id = $2`,
          [leadsCreated, job.id]
        );

        return res.json({ 
          success: true, 
          message: `Search complete! Created ${leadsCreated} leads from ${items?.length || 0} results`
        });
      }

      return res.json({ success: true });

    }

    if (action === 'cancel' && jobId) {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

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
    }

    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await initDatabase();

    const { country, city, keywords } = req.body || {};

    if (method === 'POST') {
      if (!keywords || !keywords.length) {
        return res.status(400).json({ error: 'Keywords are required' });
      }

      if (!APIFY_API_TOKEN) {
        return res.status(500).json({ error: 'APIFY_API_TOKEN not configured' });
      }

      // Create job with search-only flow
      const jobResult = await query(
        `INSERT INTO scrape_jobs (user_id, country, city, keywords, stage, status) 
         VALUES ($1, $2, $3, $4, 'search', 'running') RETURNING *`,
        [userId, country || 'TH', city || '', keywords]
      );

      const job = jobResult.rows[0];

      try {
        // Use powerai search actor with keyword + location
        const searchKeyword = Array.isArray(keywords) ? keywords.join(', ') : keywords;
        
        console.log('Starting search with:', { query: searchKeyword, location_uid: city, maxResults: MAX_RESULTS });
        
        const runId = await triggerApify(ACTOR_SEARCH, {
          query: searchKeyword,
          location_uid: city || undefined,
          maxResults: MAX_RESULTS,
          recent_posts: true,
          proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
          maxRequestRetries: 3
        });
        
        await query('UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2', [runId, job.id]);
        
        return res.status(201).json({ 
          job, 
          message: 'Search started! Finding posts matching: ' + searchKeyword
        });
      } catch (searchError) {
        console.log('Search actor failed:', searchError.message);
        await query('UPDATE scrape_jobs SET status = $1, stage = $2 WHERE id = $3', ['failed', 'search', job.id]);
        
        return res.status(400).json({ 
          error: 'Search failed. Please try different keywords.',
          hint: 'Try simpler keywords or fewer words.'
        });
      }
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
    console.error('Scrape API error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
