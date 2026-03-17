import jwt from 'jsonwebtoken';
import axios from 'axios';
import OpenAI from 'openai';
import { query, initDatabase } from './db.js';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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

// Facebook Groups Scraper actor ID
const ACTOR_GROUPS = '2chN8UQcH1CfxLRNE';
const MAX_RESULTS = parseInt(process.env.SCRAPE_MAX_RESULTS) || 10;
const APIFY_API_TOKEN = process.env.APIFY_TOKEN_V2 || process.env.APIFY_API_TOKEN;
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL;

// Utility function to convert any error to string safely
function errorToString(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (typeof err === 'object') return JSON.stringify(err);
  return String(err);
}

const triggerApify = async (actor, input) => {
  if (!APIFY_API_TOKEN) {
    throw new Error('APIFY_API_TOKEN not configured');
  }

  console.log('triggerApify called with:', { actor, input, token: APIFY_API_TOKEN ? 'present' : 'missing' });

  const params = { token: APIFY_API_TOKEN };

  // Register webhook so Apify calls us back when done
  if (WEBHOOK_BASE_URL) {
    const webhooks = [{
      eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
      requestUrl: `${WEBHOOK_BASE_URL}/api/scrape?stage=${actor}`
    }];
    params.webhooks = Buffer.from(JSON.stringify(webhooks)).toString('base64');
    console.log('Webhook registered:', `${WEBHOOK_BASE_URL}/api/scrape?stage=${actor}`);
  } else {
    console.warn('WEBHOOK_BASE_URL not set — results will only appear via polling fallback');
  }

  try {
    const response = await axios.post(
      `https://api.apify.com/v2/acts/${actor}/runs`,
      input,
      { params }
    );

    console.log('Apify call succeeded, runId:', response.data.data.id);
    return response.data.data.id;
  } catch (error) {
    const errorStr = errorToString(error.response?.data || error);
    console.error('Apify API error (raw):', error.response?.data);
    console.error('Apify API error (string):', errorStr);
    throw new Error(errorStr);
  }
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
      const numMatch = match[0].match(/[\d,.]+/);
      if (!numMatch) continue;
      let price = numMatch[0].replace(/,/g, '');
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
      const numMatch = match[0].match(/[\d.]+/);
      if (!numMatch) continue;
      let area = parseFloat(numMatch[0]);
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
      return match[0].replace(/^(location|address|area|in|at|near)[:\s]*/i, '').trim();
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
  const lineMatches = [...text.matchAll(linePattern)];
  const lineId = lineMatches.length > 0 ? lineMatches[0][1] : null;

  return {
    phones: [...new Set(phones)].slice(0, 3),
    emails: [...new Set(emails)].slice(0, 2),
    lineId
  };
};

// Shared lead-creation logic used by both the webhook handler and polling fallback
const analyzePostWithAI = async (postText, city, country, keywords) => {
  if (!openai) return null;

  const prompt = `You are analyzing a Facebook post to determine if it is a housing listing matching a search.

Search context:
- Target location: ${city || 'any'}, ${country || 'any'}
- Keywords searched: ${(keywords || []).join(', ') || 'housing'}

Facebook post:
"""
${postText.substring(0, 2000)}
"""

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "is_housing_listing": boolean,
  "is_correct_location": boolean,
  "location_confidence": "high" or "medium" or "low",
  "detected_location": string or null,
  "listing_type": "rental" or "sale" or "unknown",
  "listing_direction": "offering" or "seeking",
  "relevance_score": integer 0-10,

  "property_name": string or null,
  "floor": string or null,
  "room_type": string or null,
  "bedrooms": number or null,
  "bathrooms": number or null,
  "area_sqm": number or null,
  "furnished": boolean or null,
  "available_from": string or null,
  "units_available": number or null,

  "price": number or null,
  "price_period": "month" or "week" or "night" or "total" or null,
  "price_tiers": [{"amount": number, "period": string, "condition": string}],

  "amenities": [string],

  "contact_name": string or null,
  "contact_phone": string or null,
  "contact_email": string or null,
  "contact_line_id": string or null,
  "contact_whatsapp": string or null,
  "all_phones": [string],
  "all_emails": [string],

  "summary": "2-3 sentence summary in plain English — translate Thai or any other language"
}

Rules:
- listing_direction: "offering" = landlord/owner/agent posting property. "seeking" = person looking for place to rent/buy.
- all_phones: extract EVERY phone number found in the post (not just the first one)
- contact_line_id: look for patterns like "LINE ID:", "Line:", "@" followed by an ID
- contact_whatsapp: extract WhatsApp number(s) if mentioned
- price_tiers: if post has multiple prices for different durations (e.g. 30,000/mo for 1-3 months, 25,000/mo for 3-6 months), list each as a separate entry. Empty array if only one price.
- amenities: translate to English and list as clean short phrases (e.g. "Fully furnished", "Ready to move in", "Air conditioning")
- available_from: extract as a human-readable string (e.g. "April", "April 2025", "Immediately")
- summary: always write in plain English, translate if the post is in Thai or other language`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });
    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error('AI analysis failed:', err.message);
    return null; // Fall back to basic housing check
  }
};

// Housing vocabulary used as a broad relevance check
const HOUSING_TERMS = [
  'rent', 'rental', 'lease', 'apartment', 'studio', 'house', 'home', 'room',
  'bedroom', 'property', 'available', 'condo', 'flat', 'townhouse', 'villa',
  'sqm', 'sqft', 'bath', 'garage', 'furnished', 'unfurnished', 'deposit',
  'monthly', 'landlord', 'tenant', 'sublet', 'airbnb', 'short term', 'long term',
  'for sale', 'listing', 'accommodation', 'lodging', 'suite', 'penthouse',
  'move in', 'move-in', 'lease term', 'utilities', 'per month'
];

const processSearchResults = async (job, items) => {
  const jobKeywords = job.keywords || [];
  let seekingCount = 0;
  let offeringCount = 0;
  const errors = [];

  for (const item of items || []) {
    const postText = item.message || item.text || item.postText || '';
    const title = item.user?.name || item.author?.name || item.authorName || item.name || item.userName || 'Unknown';
    const postUrl = item.facebookUrl || item.url || item.postUrl || item.link || '';

    // Skip posts with no text or very short text (ads, reactions, spam)
    if (postText.trim().length < 30) continue;

    const itemText = postText.toLowerCase();

    // Apify already pre-filtered by keyword — use broad housing vocabulary as soft check
    const isHousingRelated = HOUSING_TERMS.some(term => itemText.includes(term));
    const matchedKeywords = jobKeywords.filter(kw => itemText.includes(kw.toLowerCase()));

    // For groups scraping with no filter keywords, rely on housing vocabulary alone
    // (the group itself is already housing-themed). With keywords, require a match.
    const hasNoKeywordFilter = jobKeywords.length === 0;
    if (!isHousingRelated && (hasNoKeywordFilter || matchedKeywords.length === 0)) {
      console.log('Skipping non-housing post:', postText.substring(0, 80));
      continue;
    }

    // AI analysis: verify location, confirm housing, extract structured data
    const aiResult = await analyzePostWithAI(postText, job.city, job.country, jobKeywords);
    if (aiResult) {
      if (!aiResult.is_housing_listing) {
        console.log('AI: not a housing listing, skipping');
        continue;
      }
      if (!aiResult.is_correct_location && aiResult.location_confidence !== 'low') {
        console.log('AI: wrong location (' + aiResult.detected_location + '), skipping');
        continue;
      }
      if (aiResult.relevance_score < 3) {
        console.log('AI: low relevance score ' + aiResult.relevance_score + ', skipping');
        continue;
      }
    }

    const price = (aiResult?.price) ?? extractPrice(postText);
    const area = (aiResult?.area_sqm) ?? extractArea(postText);
    const rentalDuration = extractRentalDuration(postText);
    const location = aiResult?.detected_location || extractLocation(postText, job.city);
    const contacts = extractContact(postText);

    // Skip posts with no contact info — useless as a lead
    const hasContact =
      aiResult?.contact_phone ||
      aiResult?.contact_email ||
      contacts.phones.length > 0 ||
      contacts.emails.length > 0 ||
      contacts.lineId ||
      /whatsapp/i.test(postText);
    if (!hasContact) {
      console.log('AI: no contact info found, skipping');
      continue;
    }

    const likes = item.reactions_count || item.likesCount || item.likes || 0;
    const commentsCount = item.comments_count || item.commentsCount || item.comments || 0;
    const sharesCount = item.reshare_count || item.sharesCount || item.shares || 0;
    const timestamp = item.timestamp || (item.time ? new Date(item.time).getTime() / 1000 : null);

    // Extract photos from groups scraper 'attachments' (filter __typename==='Photo')
    // Fall back to album_preview/images for other scrapers
    const photoAttachments = (item.attachments || []).filter(a => a.__typename === 'Photo');
    const albumPreview = photoAttachments.length > 0 ? photoAttachments : (item.album_preview || item.images || []);
    const imageUrls = albumPreview.map(img => {
      if (typeof img === 'string') return img;
      return img.image?.uri || img.thumbnail || img.image_file_uri || img.url || null;
    }).filter(Boolean);

    const locationMentioned = job.city
      ? itemText.includes(job.city.toLowerCase())
      : false;

    try {
      const existingLead = await query(
        'SELECT id FROM leads WHERE user_id = $1 AND source_url = $2',
        [job.user_id, postUrl]
      );

      if (existingLead.rows.length === 0) {
        await query(
          `INSERT INTO leads (
            user_id, name, price, area, city, source_url, source_type, facebook_id,
            comment_text, metadata, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new')`,
          [
            job.user_id,
            title.substring(0, 255),
            price,
            area,
            location || job.city || '',
            postUrl,
            'post',
            item.user?.id || item.author?.id || item.authorId || item.userId || null,
            postText.substring(0, 5000),
            JSON.stringify({
              rental_duration: rentalDuration,
              contacts: contacts,
              phone: aiResult?.contact_phone || contacts.phones[0] || '',
              email: aiResult?.contact_email || contacts.emails[0] || '',
              // Full album_preview for the gallery UI
              images: albumPreview.slice(0, 10),
              image_urls: imageUrls.slice(0, 10),
              // Author info for display
              profile_picture_url: item.author?.profile_picture_url || null,
              author_url: item.author?.url || null,
              // Engagement metrics
              likes,
              comments_count: commentsCount,
              shares_count: sharesCount,
              // AI-extracted structured data
              ai_summary: aiResult?.summary || null,
              ai_listing_type: aiResult?.listing_type || null,
              ai_listing_direction: aiResult?.listing_direction || 'offering',
              ai_bedrooms: aiResult?.bedrooms || null,
              ai_bathrooms: aiResult?.bathrooms || null,
              ai_price_period: aiResult?.price_period || null,
              ai_price_tiers: aiResult?.price_tiers || [],
              ai_detected_location: aiResult?.detected_location || null,
              ai_relevance_score: aiResult?.relevance_score || null,
              ai_property_name: aiResult?.property_name || null,
              ai_floor: aiResult?.floor || null,
              ai_room_type: aiResult?.room_type || null,
              ai_furnished: aiResult?.furnished ?? null,
              ai_available_from: aiResult?.available_from || null,
              ai_units_available: aiResult?.units_available || null,
              ai_amenities: aiResult?.amenities || [],
              ai_contact_name: aiResult?.contact_name || null,
              ai_contact_line_id: aiResult?.contact_line_id || null,
              ai_contact_whatsapp: aiResult?.contact_whatsapp || null,
              ai_all_phones: aiResult?.all_phones || [],
              ai_all_emails: aiResult?.all_emails || [],
              // Relevance signals
              posted_at: timestamp ? new Date(timestamp * 1000).toISOString() : null,
              is_housing_related: isHousingRelated,
              location_mentioned: locationMentioned,
              keywords_matched: matchedKeywords,
              source: 'groups_scraper',
              group_name: item.groupName || null,
              group_id: item.groupId || null
            })
          ]
        );
        if (aiResult?.listing_direction === 'seeking') seekingCount++;
        else offeringCount++;
      }
    } catch (err) {
      errors.push(errorToString(err));
    }
  }

  return { leadsCreated: seekingCount, propertiesCreated: offeringCount, errors };
};

export default async function handler(req, res) {
  const { page = 1, limit = 20, action, id: jobId, stage } = req.query;
  const method = req.method;

  console.log('Scrape API called:', method, 'stage:', stage, 'action:', action);

  try {
    // Handle test endpoint for debugging
    if (action === 'test') {
      console.log('Test payload:', req.body);
      return res.json({ success: true, message: 'Test received', body: req.body });
    }

    // Webhook from Apify when a run completes
    if (stage) {
      await initDatabase();

      console.log('Webhook POST received!');
      console.log('Method:', method);
      console.log('Stage:', stage);
      console.log('Query params:', req.query);
      console.log('Body:', JSON.stringify(req.body).substring(0, 500));

      const webhookData = req.body || {};
      const resource = webhookData.resource || webhookData;
      const runId = resource?.id || webhookData.id;
      const status = resource?.status || webhookData.status;
      const datasetId = resource?.defaultDatasetId || webhookData.defaultDatasetId;

      console.log('Extracted:', { runId, status, datasetId });

      if (!runId) {
        console.error('Missing runId in webhook. Full body:', JSON.stringify(req.body).substring(0, 500));
        return res.status(400).json({ error: 'Missing runId', received: webhookData });
      }

      console.log('Looking for job with apify_run_id:', runId);

      const jobResult = await query(
        'SELECT * FROM scrape_jobs WHERE apify_run_id = $1',
        [runId]
      );

      if (jobResult.rows.length === 0) {
        console.error('Job not found for runId:', runId);
        const recentJobs = await query(
          'SELECT id, apify_run_id, status, created_at FROM scrape_jobs ORDER BY created_at DESC LIMIT 5'
        );
        console.log('Recent jobs:', recentJobs.rows);
        return res.status(404).json({ error: 'Job not found', runId, recentRuns: recentJobs.rows });
      }

      const job = jobResult.rows[0];

      if (status === 'FAILED' || status === 'ABORTED') {
        await query('UPDATE scrape_jobs SET status = $1 WHERE id = $2', ['failed', job.id]);
        return res.json({ success: true, message: 'Stage failed' });
      }

      // Fetch results from Apify dataset
      let items = [];
      try {
        if (datasetId) {
          console.log('Fetching dataset:', datasetId);
          const datasetResponse = await axios.get(
            `https://api.apify.com/v2/datasets/${datasetId}/items`,
            { params: { token: APIFY_API_TOKEN, limit: 1000 } }
          );
          items = datasetResponse.data || [];
          console.log('Got items from dataset:', items.length);
        } else {
          console.log('No datasetId found, cannot fetch items');
        }
      } catch (fetchError) {
        console.error('Error fetching dataset:', fetchError.message);
      }

      if (stage === ACTOR_GROUPS) {
        console.log('Search complete, processing', items?.length || 0, 'results');

        const { leadsCreated, propertiesCreated } = await processSearchResults(job, items);

        await query(
          `UPDATE scrape_jobs SET
            stage = 'completed',
            status = 'completed',
            leads_count = $1,
            properties_count = $2,
            completed_at = NOW()
          WHERE id = $3`,
          [leadsCreated, propertiesCreated, job.id]
        );

        return res.json({
          success: true,
          message: `Search complete! Created ${leadsCreated} leads + ${propertiesCreated} properties from ${items?.length || 0} results`
        });
      }

      return res.json({ success: true });
    }

    // Simulation endpoint — tests the full pipeline with mock data, no Apify cost
    if (action === 'simulate') {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });


      const jobResult = await query(
        `INSERT INTO scrape_jobs (user_id, country, city, keywords, group_urls, stage, status, apify_run_id)
         VALUES ($1, 'TH', '', $2, $3, 'search', 'running', $4) RETURNING *`,
        [userId, [], ['https://www.facebook.com/groups/1445573419202140/'], 'test-run-' + Date.now()]
      );
      const job = jobResult.rows[0];

      // Mock items using the REAL groups scraper field format (confirmed from apify-dataset.json)
      // Unique suffix per run so duplicate detection doesn't suppress results on repeated tests
      const runSuffix = Date.now();
      const mockItems = [
        {
          text: `Beautiful 2BR condo for rent in Bangkok. 25,000 THB/month. Fully furnished, ready to move in. Contact: LINE @testline, Tel: 0812345678`,
          facebookUrl: `https://www.facebook.com/groups/1445573419202140/posts/mock001_${runSuffix}`,
          user: { id: 'fb_grp_mock_001', name: 'Test Landlord' },
          likesCount: 12, commentsCount: 3,
          attachments: [
            { __typename: 'Photo', image: { uri: 'https://picsum.photos/seed/mock1a/590/443', height: 443, width: 590 }, thumbnail: 'https://picsum.photos/seed/mock1a/200/150', id: 'mock_photo_001' },
            { __typename: 'Photo', image: { uri: 'https://picsum.photos/seed/mock1b/590/443', height: 443, width: 590 }, thumbnail: 'https://picsum.photos/seed/mock1b/200/150', id: 'mock_photo_002' }
          ]
        },
        {
          text: `Studio room available near BTS Asok. 12,000 THB/month. 30sqm. Pool, gym included. Call 0898765432`,
          facebookUrl: `https://www.facebook.com/groups/1445573419202140/posts/mock002_${runSuffix}`,
          user: { id: 'fb_grp_mock_002', name: 'Test Agent' },
          likesCount: 5, commentsCount: 1,
          attachments: []
        },
        {
          text: `Anyone know a good restaurant near Sukhumvit? Looking for Thai food recommendations.`,
          facebookUrl: `https://www.facebook.com/groups/1445573419202140/posts/mock003_${runSuffix}`,
          user: { id: 'fb_grp_mock_003', name: 'Random User' },
          likesCount: 2, commentsCount: 0,
          attachments: []
        }
      ];

      const { leadsCreated, propertiesCreated, errors } = await processSearchResults(job, mockItems);

      await query(
        `UPDATE scrape_jobs SET stage='completed', status='completed', leads_count=$1, properties_count=$2, completed_at=NOW() WHERE id=$3`,
        [leadsCreated, propertiesCreated, job.id]
      );

      return res.json({
        success: true,
        message: `Simulation complete: ${leadsCreated} leads + ${propertiesCreated} properties from ${mockItems.length} mock posts`,
        jobId: job.id,
        leadsCreated,
        totalMockItems: mockItems.length,
        groupUrls: ['https://www.facebook.com/groups/1445573419202140/'],
        errors: errors.length ? errors : undefined
      });
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

    const { country, groupUrls, keywords } = req.body || {};

    console.log('Received scrape request:', { country, groupUrls, keywords, hasToken: !!APIFY_API_TOKEN });

    if (method === 'POST') {
      if (!groupUrls || !groupUrls.length) {
        return res.status(400).json({ error: 'At least one group URL is required' });
      }

      if (!APIFY_API_TOKEN) {
        console.error('APIFY_API_TOKEN is missing!');
        return res.status(500).json({ error: 'APIFY_API_TOKEN not configured' });
      }

      console.log('Creating groups scrape job...');
      const jobResult = await query(
        `INSERT INTO scrape_jobs (user_id, country, city, keywords, group_urls, stage, status)
         VALUES ($1, $2, '', $3, $4, 'search', 'running') RETURNING *`,
        [userId, country || 'TH', keywords || [], groupUrls]
      );
      console.log('Job created:', jobResult.rows[0]?.id);

      const job = jobResult.rows[0];

      try {
        console.log('Starting groups scrape with:', { groupUrls, resultsLimit: MAX_RESULTS });

        const runId = await triggerApify(ACTOR_GROUPS, {
          startUrls: groupUrls.map(u => ({ url: u })),
          resultsLimit: MAX_RESULTS,
          viewOption: 'CHRONOLOGICAL'
        });

        await query('UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2', [runId, job.id]);

        return res.status(201).json({
          job,
          message: `Scraping ${groupUrls.length} group(s)...`
        });
      } catch (scrapeError) {
        const errorMsg = errorToString(scrapeError);
        console.error('Groups actor failed:', errorMsg);
        await query('UPDATE scrape_jobs SET status = $1, stage = $2 WHERE id = $3', ['failed', 'search', job.id]);

        return res.status(400).json({
          error: 'Scrape failed: ' + errorMsg,
          hint: 'Check Vercel logs for details'
        });
      }
    }

    if (method === 'GET') {
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const result = await query(
        `SELECT * FROM scrape_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, parseInt(limit), offset]
      );

      // Polling fallback: for any running real jobs, check Apify status and process if done
      if (APIFY_API_TOKEN) {
        for (const job of result.rows) {
          if (
            job.status === 'running' &&
            job.apify_run_id &&
            !job.apify_run_id.startsWith('test-run-')
          ) {
            try {
              const statusResp = await axios.get(
                `https://api.apify.com/v2/actor-runs/${job.apify_run_id}`,
                { params: { token: APIFY_API_TOKEN } }
              );
              const apifyStatus = statusResp.data?.data?.status;
              const datasetId = statusResp.data?.data?.defaultDatasetId;

              if (apifyStatus === 'SUCCEEDED' && datasetId) {
                // Atomic claim: only one concurrent request should process this job
                const claimed = await query(
                  `UPDATE scrape_jobs SET stage='processing' WHERE id=$1 AND status='running' AND stage<>'processing' RETURNING id`,
                  [job.id]
                );
                if (claimed.rows.length === 0) {
                  console.log('Polling: job', job.id, 'already being processed, skipping');
                  continue;
                }
                console.log('Polling fallback: job', job.id, 'succeeded, processing results');
                const datasetResp = await axios.get(
                  `https://api.apify.com/v2/datasets/${datasetId}/items`,
                  { params: { token: APIFY_API_TOKEN, limit: 1000 } }
                );
                const items = datasetResp.data || [];
                const { leadsCreated, propertiesCreated } = await processSearchResults(job, items);
                await query(
                  `UPDATE scrape_jobs SET stage='completed', status='completed', leads_count=$1, properties_count=$2, completed_at=NOW() WHERE id=$3`,
                  [leadsCreated, propertiesCreated, job.id]
                );
                job.status = 'completed';
                job.stage = 'completed';
                job.leads_count = leadsCreated;
                job.properties_count = propertiesCreated;
                console.log('Polling fallback: created', leadsCreated, 'leads +', propertiesCreated, 'properties for job', job.id);
              } else if (apifyStatus === 'FAILED' || apifyStatus === 'ABORTED') {
                await query('UPDATE scrape_jobs SET status=$1 WHERE id=$2', ['failed', job.id]);
                job.status = 'failed';
              }
            } catch (pollErr) {
              console.error('Polling fallback error for job', job.id, ':', pollErr.message);
              // Non-blocking — don't fail the whole request
            }
          }
        }
      }

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
