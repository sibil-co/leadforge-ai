import jwt from 'jsonwebtoken';
import axios from 'axios';
import OpenAI from 'openai';
import { query, initDatabase } from './db.js';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-nano';

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
const ACTOR_GROUPS = 'p19D7QPHvMaHVBXU5'; // custom facebook-group-housing-scraper
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
const analyzePostWithAI = async (postText, city, country, keywords, imageUrls = []) => {
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
  "is_from_owner": boolean,

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

  "google_maps_query": string or null,

  "title": string or null,
  "summary": "2-3 sentence summary in plain English — translate Thai or any other language"
}

Rules:
- title: generate a short 4-8 word title in English. MUST include the building/condo name if mentioned. Format: "[bedrooms] [room type] at [building name/location]". Examples: "1BR Duplex at Park Origin Thonglor", "Studio near BTS Asok", "2BR Condo at Ideo Sukhumvit 93". Null only if there is truly no location or property info.
- listing_direction: "offering" = landlord/owner/agent posting property. "seeking" = person looking for place to rent/buy.
- bedrooms: extract from text like "1 bed", "2 bedrooms", "1BR", "1 ห้องนอน". Must be a number, not null if clearly stated.
- bathrooms: extract from text like "1 bath", "2 bathrooms", "1 ห้องน้ำ". Must be a number, not null if clearly stated.
- floor: extract floor number from text like "Floor 40", "ชั้น 15", "40th floor". Return as string e.g. "40".
- room_type: extract from text like "duplex", "studio", "1 bed", "penthouse", "loft". Return in English.
- area_sqm: extract number from "46sqm", "46 sqm", "46 ตร.ม", "46m²".
- price_tiers: parse ALL price/duration combinations. Common formats:
  * "1 year = 45000 / 6 months = 48000 / 3 months = 55000" → tiers with condition "1 year", "6 months", "3 months"
  * "45000/mo (12m) · 48000/mo (6m) · 55000/mo (3m)" → same
  * Multiple lines each with price and duration → parse each line
  Set price_period to "month" for all monthly rental tiers. Empty array if truly only one price.
- price: if price_tiers is non-empty, set to the lowest amount (best long-term deal). Otherwise extract the single price.
- all_phones: extract EVERY phone number found in the post (not just the first one)
- contact_line_id: look for patterns like "LINE ID:", "Line:", "@" followed by an ID
- contact_whatsapp: extract WhatsApp number(s) if mentioned
- amenities: translate to English and list as clean short phrases (e.g. "Fully furnished", "Ready to move in", "Air conditioning")
- available_from: extract as a human-readable string (e.g. "April", "April 2025", "Immediately")
- google_maps_query: format the most specific searchable address for Google Maps — include building/condo name, street/soi, neighbourhood, city, country in English (e.g. "Park Origin Thonglor, Sukhumvit 55, Bangkok, Thailand"). Null only if the post has zero location information.
- summary: always write in plain English, translate if the post is in Thai or other language
- relevance_score: score 0-10 based on four factors: (1) listing clarity — is it clearly offering or seeking housing? (2) information completeness — does it include price, area, or room type? (3) location relevance — does it match the target location? (4) actionability — is there contact info? Missing price should noticeably reduce the score (cap at 7 if no price or price range is found). A post with no price AND no contact info should score ≤5.
- is_from_owner: true if the post explicitly mentions the poster is the owner, property owner, condo owner, landlord, landlady, or direct owner. Look for phrases like "owner post", "from owner", "ของเจ้าของ", "เจ้าของปล่อย", "owner renting", "we own", "I own", etc. False if it seems to be an agent, property company, middleman, or no clear owner mention. Null is not allowed — always return true or false.`;

  // Try to download images as base64 so GPT can analyze them
  // (OpenAI can't fetch scontent URLs directly — Facebook returns 400)
  const fetchAsBase64 = async (url) => {
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
      const mimeType = resp.headers['content-type'] || 'image/jpeg';
      const b64 = Buffer.from(resp.data).toString('base64');
      return `data:${mimeType};base64,${b64}`;
    } catch {
      return null;
    }
  };

  try {
    const base64Urls = (await Promise.all(imageUrls.slice(0, 4).map(fetchAsBase64))).filter(Boolean);
    const imageContent = base64Urls.map(url => ({ type: 'image_url', image_url: { url, detail: 'low' } }));
    const userContent = imageContent.length > 0
      ? [{ type: 'text', text: prompt }, ...imageContent]
      : prompt;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: 'user', content: userContent }],
      response_format: { type: 'json_object' },
      reasoning_effort: 'medium',
      store: true,
    });
    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error('AI analysis failed:', err.message);
    return null;
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

// Stage 1: Save raw posts to DB without AI analysis
const saveRawPosts = async (job, items) => {
  const jobKeywords = job.keywords || [];
  let rawSaved = 0;
  const errors = [];

  for (const item of items || []) {
    const postText = item.message || item.text || item.postText || '';
    const title = item.user?.name || item.author?.name || item.authorName || item.name || item.userName || 'Unknown';
    const postUrl = item.facebookUrl || item.url || item.postUrl || item.link || '';

    if (postText.trim().length < 30) continue;

    const itemText = postText.toLowerCase();
    const isHousingRelated = HOUSING_TERMS.some(term => itemText.includes(term));
    const matchedKeywords = jobKeywords.filter(kw => itemText.includes(kw.toLowerCase()));
    const hasNoKeywordFilter = jobKeywords.length === 0;
    if (!isHousingRelated && (hasNoKeywordFilter || matchedKeywords.length === 0)) continue;

    const photoAttachments = (item.attachments || []).filter(a => a.__typename === 'Photo');
    const albumPreview = photoAttachments.length > 0 ? photoAttachments : (item.album_preview || item.images || []);
    const imageUrls = albumPreview.map(img => {
      if (typeof img === 'string') return img;
      return img.image?.uri || img.thumbnail || img.image_file_uri || img.url || null;
    }).filter(Boolean);

    const price = extractPrice(postText);
    const area = extractArea(postText);
    const rentalDuration = extractRentalDuration(postText);
    const location = extractLocation(postText, job.city);
    const contacts = extractContact(postText);

    const likes = item.reactions_count || item.likesCount || item.likes || 0;
    const commentsCount = item.comments_count || item.commentsCount || item.comments || 0;
    const sharesCount = item.reshare_count || item.sharesCount || item.shares || 0;
    const timestamp = item.timestamp || (item.time ? new Date(item.time).getTime() / 1000 : null);
    const locationMentioned = job.city ? itemText.includes(job.city.toLowerCase()) : false;

    try {
      // Dedup by URL when available; fall back to first 300 chars of text.
      // Never dedup by empty string — that would block all URL-less posts after the first.
      let isDuplicate = false;
      if (postUrl) {
        const byUrl = await query(
          'SELECT id FROM leads WHERE user_id = $1 AND source_url = $2',
          [job.user_id, postUrl]
        );
        isDuplicate = byUrl.rows.length > 0;
      } else {
        const byText = await query(
          `SELECT id FROM leads WHERE user_id = $1 AND LEFT(COALESCE(comment_text, ''), 300) = LEFT($2, 300)`,
          [job.user_id, postText]
        );
        isDuplicate = byText.rows.length > 0;
      }
      if (!isDuplicate) {
        await query(
          `INSERT INTO leads (
            user_id, name, price, area, city, source_url, source_type, facebook_id,
            comment_text, metadata, status, is_analyzed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new', false)`,
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
              contacts,
              phone: contacts.phones[0] || '',
              email: contacts.emails[0] || '',
              images: albumPreview.slice(0, 10),
              image_urls: imageUrls.slice(0, 10),
              profile_picture_url: item.author?.profile_picture_url || null,
              author_url: item.author?.url || null,
              likes,
              comments_count: commentsCount,
              shares_count: sharesCount,
              posted_at: timestamp ? new Date(timestamp * 1000).toISOString() : null,
              is_housing_related: isHousingRelated,
              location_mentioned: locationMentioned,
              keywords_matched: matchedKeywords,
              source: 'groups_scraper',
              group_name: item.groupName || null,
              group_id: item.groupId || null,
              scrape_job_id: job.id || null,
            })
          ]
        );
        rawSaved++;
      }
    } catch (err) {
      errors.push(errorToString(err));
    }
  }

  console.log(`saveRawPosts: ${(items || []).length} items → ${rawSaved} saved. ${errors.length} errors.`);
  return { rawSaved, errors };
};

// Stage 2: Run AI analysis on all unanalyzed posts for a job
const analyzeJobPosts = async (jobId, userId, jobCountry, jobCity, jobKeywords) => {
  try {
    await query(
      `UPDATE scrape_jobs SET stage = 'analyzing' WHERE id = $1`,
      [jobId]
    );

    const leadsResult = await query(
      `SELECT id, comment_text, city, metadata FROM leads
       WHERE user_id = $1 AND is_analyzed = false AND metadata->>'scrape_job_id' = $2
       LIMIT 12`,
      [userId, jobId]
    );

    const posts = leadsResult.rows;
    console.log(`analyzeJobPosts: job ${jobId} — analyzing ${posts.length} posts (batch)`);

    let seekingCount = 0;
    let offeringCount = 0;

    for (const lead of posts) {
      const postText = lead.comment_text || '';
      if (postText.length < 20) continue;

      const existingMeta = typeof lead.metadata === 'string' ? JSON.parse(lead.metadata) : (lead.metadata || {});
      const imageUrls = existingMeta.image_urls || [];

      try {
        const aiResult = await analyzePostWithAI(postText, jobCity || lead.city, jobCountry, jobKeywords || [], imageUrls);

        if (!aiResult) {
          // AI call failed — leave as is_analyzed = false so retry can pick it up
          console.log(`analyzeJobPosts: AI returned null for lead ${lead.id} — skipping, will be retried`);
          continue;
        }

        if (!aiResult.is_housing_listing) {
          await query(`DELETE FROM leads WHERE id = $1`, [lead.id]);
          console.log(`analyzeJobPosts: deleted non-housing post ${lead.id}`);
          continue;
        }
        // Only enforce location filter when a specific city was requested
        if (jobCity && !aiResult.is_correct_location && aiResult.location_confidence !== 'low') {
          await query(`DELETE FROM leads WHERE id = $1`, [lead.id]);
          console.log(`analyzeJobPosts: deleted wrong-location post ${lead.id} (${aiResult.detected_location})`);
          continue;
        }
        if (aiResult.relevance_score < 4) {
          await query(`DELETE FROM leads WHERE id = $1`, [lead.id]);
          console.log(`analyzeJobPosts: deleted low-relevance post ${lead.id} (score ${aiResult.relevance_score})`);
          continue;
        }

        const updatedMeta = {
          ...existingMeta,
          phone: aiResult.contact_phone || existingMeta.phone || '',
          email: aiResult.contact_email || existingMeta.email || '',
          ai_title: aiResult.title || null,
          ai_summary: aiResult.summary || null,
          ai_listing_type: aiResult.listing_type || null,
          ai_listing_direction: aiResult.listing_direction || 'offering',
          ai_is_from_owner: aiResult.is_from_owner ?? false,
          ai_bedrooms: aiResult.bedrooms || null,
          ai_bathrooms: aiResult.bathrooms || null,
          ai_price_period: aiResult.price_period || null,
          ai_price_tiers: aiResult.price_tiers || [],
          ai_detected_location: aiResult.detected_location || null,
          ai_relevance_score: aiResult.relevance_score || null,
          ai_property_name: aiResult.property_name || null,
          ai_floor: aiResult.floor || null,
          ai_room_type: aiResult.room_type || null,
          ai_furnished: aiResult.furnished ?? null,
          ai_available_from: aiResult.available_from || null,
          ai_units_available: aiResult.units_available || null,
          ai_amenities: aiResult.amenities || [],
          ai_contact_name: aiResult.contact_name || null,
          ai_contact_line_id: aiResult.contact_line_id || null,
          ai_contact_whatsapp: aiResult.contact_whatsapp || null,
          ai_all_phones: aiResult.all_phones || [],
          ai_all_emails: aiResult.all_emails || [],
          ai_google_maps_query: aiResult.google_maps_query || null,
        };

        await query(
          `UPDATE leads SET
            is_analyzed = true,
            price = COALESCE($1, price),
            area = COALESCE($2, area),
            city = COALESCE($3, city),
            metadata = $4
           WHERE id = $5`,
          [aiResult.price || null, aiResult.area_sqm || null, aiResult.detected_location || null, JSON.stringify(updatedMeta), lead.id]
        );

        if (aiResult.listing_direction === 'seeking') seekingCount++;
        else offeringCount++;
      } catch (err) {
        console.error(`analyzeJobPosts: error on lead ${lead.id}:`, err.message);
      }
    }

    // Check if any posts remain unanalyzed (AI may have failed for all of them)
    const remainingResult = await query(
      `SELECT COUNT(*) FROM leads WHERE user_id = $1 AND is_analyzed = false AND metadata->>'scrape_job_id' = $2`,
      [userId, String(jobId)]
    );
    const remaining = parseInt(remainingResult.rows[0].count);

    if (remaining > 0) {
      // More posts remain — keep as analyzing/running so frontend triggers next batch
      await query(
        `UPDATE scrape_jobs SET stage = 'analyzing', status = 'running' WHERE id = $1`,
        [jobId]
      );
      console.log(`analyzeJobPosts: job ${jobId} — batch done, ${remaining} posts still pending`);
      return;
    }

    await query(
      `UPDATE scrape_jobs SET
        stage = 'completed', status = 'completed',
        leads_count = $1, properties_count = $2, completed_at = NOW()
       WHERE id = $3`,
      [seekingCount, offeringCount, jobId]
    );

    console.log(`analyzeJobPosts: job ${jobId} done — ${seekingCount} leads, ${offeringCount} properties`);
  } catch (err) {
    console.error(`analyzeJobPosts: fatal error for job ${jobId}:`, err.message);
    await query(
      `UPDATE scrape_jobs SET status = 'failed', stage = 'failed' WHERE id = $1`,
      [jobId]
    ).catch(() => {});
  }
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
        return res.status(200).json({ error: 'Missing runId' });
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
        return res.status(200).json({ error: 'Job not found', runId });
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
        console.log('Search complete, saving', items?.length || 0, 'raw posts');

        const { rawSaved } = await saveRawPosts(job, items);

        await query(
          `UPDATE scrape_jobs SET stage = 'scraping_done', posts_count = $1 WHERE id = $2`,
          [rawSaved, job.id]
        );

        // Stage 2: run synchronously before responding — Vercel kills async work after res.json()
        await analyzeJobPosts(job.id, job.user_id, job.country, job.city, job.keywords);
        return res.json({ success: true, message: `Stage 1 done: ${rawSaved} posts saved, analysis complete` });
      }

      return res.json({ success: true });
    }

    // Fetch last job's items, run GPT on each, return lead-shaped objects — no DB write, no filtering
    if (action === 'labanalyze') {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      if (!APIFY_API_TOKEN) return res.status(500).json({ error: 'APIFY_API_TOKEN not configured' });

      const jobResult = await query(
        `SELECT * FROM scrape_jobs WHERE user_id = $1 AND apify_run_id IS NOT NULL AND apify_run_id NOT LIKE 'test-run-%'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (jobResult.rows.length === 0) return res.status(404).json({ error: 'No real Apify jobs found yet' });

      const job = jobResult.rows[0];

      let items = [];
      try {
        const runRes = await axios.get(
          `https://api.apify.com/v2/actor-runs/${job.apify_run_id}`,
          { params: { token: APIFY_API_TOKEN } }
        );
        const datasetId = runRes.data?.data?.defaultDatasetId;
        if (!datasetId) return res.status(404).json({ error: 'No dataset on this run' });

        const dsRes = await axios.get(
          `https://api.apify.com/v2/datasets/${datasetId}/items`,
          { params: { token: APIFY_API_TOKEN, limit: 50 } }
        );
        items = dsRes.data || [];
      } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch Apify dataset: ' + errorToString(err) });
      }

      // Run GPT on each item — no filtering, no DB save
      const results = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const postText = item.text || item.message || item.postText || '';
        const authorName = item.user?.name || item.author?.name || item.authorName || 'Unknown';
        const postUrl = item.facebookUrl || item.url || item.postUrl || '';

        const photoAttachments = (item.attachments || []).filter(a => a.__typename === 'Photo');
        const albumPreview = photoAttachments.length > 0 ? photoAttachments : (item.album_preview || item.images || []);
        const imageUrls = albumPreview.map(img => {
          if (typeof img === 'string') return img;
          return img.image?.uri || img.thumbnail || img.image_file_uri || img.url || null;
        }).filter(Boolean);
        const likes = item.likesCount ?? item.reactions_count ?? 0;
        const commentsCount = item.commentsCount ?? item.comments_count ?? 0;
        const timestamp = item.timestamp || (item.time ? new Date(item.time).getTime() / 1000 : null);

        const aiResult = await analyzePostWithAI(postText, '', job.country || 'TH', [], imageUrls);

        results.push({
          id: `lab-${i}-${Date.now()}`,
          name: aiResult?.title || authorName,
          price: aiResult?.price || null,
          area: aiResult?.area_sqm || null,
          city: aiResult?.detected_location || '',
          source_url: postUrl,
          comment_text: postText,
          status: 'new',
          created_at: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
          metadata: JSON.stringify({
            image_urls: imageUrls,
            images: albumPreview,
            phone: aiResult?.contact_phone || '',
            contacts: {
              phones: aiResult?.all_phones || [],
              emails: aiResult?.all_emails || [],
              lineId: aiResult?.contact_line_id || null
            },
            likes,
            comments_count: commentsCount,
            posted_at: timestamp ? new Date(timestamp * 1000).toISOString() : null,
            ai_title: aiResult?.title || null,
            ai_summary: aiResult?.summary || null,
            ai_listing_type: aiResult?.listing_type || null,
            ai_listing_direction: aiResult?.listing_direction || null,
            ai_bedrooms: aiResult?.bedrooms || null,
            ai_bathrooms: aiResult?.bathrooms || null,
            ai_price_period: aiResult?.price_period || null,
            ai_price_tiers: aiResult?.price_tiers || [],
            ai_detected_location: aiResult?.detected_location || null,
            ai_relevance_score: aiResult?.relevance_score ?? null,
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
            ai_google_maps_query: aiResult?.google_maps_query || null,
            is_housing_listing: aiResult?.is_housing_listing ?? null,
            is_correct_location: aiResult?.is_correct_location ?? null,
            location_confidence: aiResult?.location_confidence || null,
            source: 'lab_analyze',
          }),
          _ai: aiResult,
        });
      }

      return res.json({ job, totalItems: items.length, results });
    }

    // Re-analyze existing leads with GPT to fill missing AI fields (e.g. ai_google_maps_query)
    if (action === 'reanalyze') {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const batchLimit = parseInt(req.query.limit) || 10;

      // Count remaining leads that need re-analysis (missing maps query OR missing owner detection)
      const countResult = await query(
        `SELECT COUNT(*) FROM leads WHERE user_id = $1 AND is_analyzed = true AND (
          metadata->>'ai_google_maps_query' IS NULL OR metadata->>'ai_google_maps_query' = ''
          OR metadata->>'ai_is_from_owner' IS NULL
        )`,
        [userId]
      );
      const totalRemaining = parseInt(countResult.rows[0].count);

      if (totalRemaining === 0) {
        return res.json({ updated: 0, remaining: 0, message: 'All leads already have AI analysis' });
      }

      // Fetch batch of leads missing ai_google_maps_query or ai_is_from_owner
      const leadsResult = await query(
        `SELECT id, comment_text, city, metadata FROM leads WHERE user_id = $1 AND is_analyzed = true AND (
          metadata->>'ai_google_maps_query' IS NULL OR metadata->>'ai_google_maps_query' = ''
          OR metadata->>'ai_is_from_owner' IS NULL
        ) LIMIT $2`,
        [userId, batchLimit]
      );

      let updated = 0;
      for (const lead of leadsResult.rows) {
        const postText = lead.comment_text || '';
        if (postText.length < 20) continue;

        const existingMeta = typeof lead.metadata === 'string' ? JSON.parse(lead.metadata) : (lead.metadata || {});
        const imageUrls = existingMeta.image_urls || [];

        try {
          const aiResult = await analyzePostWithAI(postText, lead.city, '', [], imageUrls);
          if (!aiResult) continue;

          // Merge new AI fields into existing metadata
          const updatedMeta = {
            ...existingMeta,
            ai_title: aiResult.title || existingMeta.ai_title,
            ai_summary: aiResult.summary || existingMeta.ai_summary,
            ai_listing_type: aiResult.listing_type || existingMeta.ai_listing_type,
            ai_listing_direction: aiResult.listing_direction || existingMeta.ai_listing_direction,
            ai_bedrooms: aiResult.bedrooms ?? existingMeta.ai_bedrooms,
            ai_bathrooms: aiResult.bathrooms ?? existingMeta.ai_bathrooms,
            ai_price_period: aiResult.price_period || existingMeta.ai_price_period,
            ai_price_tiers: aiResult.price_tiers?.length ? aiResult.price_tiers : existingMeta.ai_price_tiers,
            ai_detected_location: aiResult.detected_location || existingMeta.ai_detected_location,
            ai_relevance_score: aiResult.relevance_score ?? existingMeta.ai_relevance_score,
            ai_property_name: aiResult.property_name || existingMeta.ai_property_name,
            ai_floor: aiResult.floor || existingMeta.ai_floor,
            ai_room_type: aiResult.room_type || existingMeta.ai_room_type,
            ai_is_from_owner: aiResult.is_from_owner ?? existingMeta.ai_is_from_owner ?? false,
            ai_furnished: aiResult.furnished ?? existingMeta.ai_furnished,
            ai_available_from: aiResult.available_from || existingMeta.ai_available_from,
            ai_google_maps_query: aiResult.google_maps_query || existingMeta.ai_google_maps_query,
            ai_contact_name: aiResult.contact_name || existingMeta.ai_contact_name,
            ai_contact_line_id: aiResult.contact_line_id || existingMeta.ai_contact_line_id,
            ai_contact_whatsapp: aiResult.contact_whatsapp || existingMeta.ai_contact_whatsapp,
            ai_all_phones: aiResult.all_phones?.length ? aiResult.all_phones : existingMeta.ai_all_phones,
            ai_all_emails: aiResult.all_emails?.length ? aiResult.all_emails : existingMeta.ai_all_emails,
            ai_amenities: aiResult.amenities?.length ? aiResult.amenities : existingMeta.ai_amenities,
          };

          // Also update price/area/city if GPT found better values
          const newPrice = aiResult.price || null;
          const newArea = aiResult.area_sqm || null;
          const newCity = aiResult.detected_location || lead.city;

          await query(
            `UPDATE leads SET is_analyzed = true, metadata = $1, price = COALESCE($2, price), area = COALESCE($3, area), city = COALESCE($4, city) WHERE id = $5`,
            [JSON.stringify(updatedMeta), newPrice, newArea, newCity, lead.id]
          );
          updated++;
        } catch (err) {
          console.error(`Reanalyze error for lead ${lead.id}:`, err.message);
        }
      }

      const remaining = totalRemaining - updated;
      console.log(`Reanalyze: updated ${updated} leads, ${remaining} remaining`);
      return res.json({ updated, remaining, message: `Re-analyzed ${updated} leads` });
    }

    // Local scraper: return pending jobs for the local scraper to process
    if (action === 'pending_jobs') {
      const secret = req.headers.authorization?.replace('Bearer ', '');
      if (!secret || secret !== process.env.LOCAL_SCRAPER_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      await initDatabase();

      // Atomically claim pending jobs and mark them running
      const result = await query(
        `UPDATE scrape_jobs SET status = 'running'
         WHERE id IN (
           SELECT id FROM scrape_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 3
         ) RETURNING *`
      );

      return res.json({ jobs: result.rows });
    }

    // Local scraper: receive raw scraped posts, run AI processing, save leads
    if (action === 'submit_results') {
      const secret = req.headers.authorization?.replace('Bearer ', '');
      if (!secret || secret !== process.env.LOCAL_SCRAPER_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      await initDatabase();

      const { jobId, posts, error } = req.body || {};
      if (!jobId) return res.status(400).json({ error: 'jobId is required' });

      const jobResult = await query('SELECT * FROM scrape_jobs WHERE id = $1', [jobId]);
      if (!jobResult.rows.length) return res.status(404).json({ error: 'Job not found' });
      const job = jobResult.rows[0];

      if (error) {
        await query(
          `UPDATE scrape_jobs SET status = 'failed', stage = 'failed', completed_at = NOW() WHERE id = $1`,
          [jobId]
        );
        console.error(`Job ${jobId} failed by local scraper: ${error}`);
        return res.json({ success: true, message: 'Job marked as failed' });
      }

      console.log(`Job ${jobId}: received ${posts?.length || 0} raw posts from local scraper`);
      const { rawSaved } = await saveRawPosts(job, posts || []);

      await query(
        `UPDATE scrape_jobs SET stage = 'scraping_done', posts_count = $1 WHERE id = $2`,
        [rawSaved, jobId]
      );

      console.log(`Job ${jobId}: Stage 1 done — ${rawSaved} posts saved, running AI analysis...`);

      // Stage 2: run synchronously before responding — Vercel kills async work after res.json()
      await analyzeJobPosts(jobId, job.user_id, job.country, job.city, job.keywords);

      const finalJob = await query('SELECT leads_count, properties_count FROM scrape_jobs WHERE id = $1', [jobId]);
      const { leads_count, properties_count } = finalJob.rows[0] || {};
      return res.json({ success: true, rawSaved, leadsCreated: leads_count || 0, propertiesCreated: properties_count || 0 });
    }

    // Clean up duplicates and low-quality/ad posts
    if (action === 'deduplicate') {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      // Pass 1: Remove URL duplicates — same source_url, keep newest
      const urlDupResult = await query(
        `DELETE FROM leads WHERE user_id = $1 AND id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY user_id, source_url ORDER BY created_at DESC
            ) AS rn
            FROM leads
            WHERE user_id = $1 AND source_url IS NOT NULL AND source_url != ''
          ) ranked WHERE rn > 1
        )`,
        [userId]
      );
      const urlDupsRemoved = urlDupResult.rowCount || 0;

      // Pass 2: Remove text duplicates — same first 300 chars of post text, keep newest
      const textDupResult = await query(
        `DELETE FROM leads WHERE user_id = $1 AND id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY user_id, LEFT(COALESCE(comment_text, ''), 300) ORDER BY created_at DESC
            ) AS rn
            FROM leads
            WHERE user_id = $1 AND comment_text IS NOT NULL AND LENGTH(comment_text) > 100
          ) ranked WHERE rn > 1
        )`,
        [userId]
      );
      const textDupsRemoved = textDupResult.rowCount || 0;

      // Pass 3: Remove low-relevance posts (score < 4) — catches generic agent ads, spam, vague posts
      const lowQualityResult = await query(
        `DELETE FROM leads WHERE user_id = $1
          AND (metadata->>'ai_relevance_score') IS NOT NULL
          AND (metadata->>'ai_relevance_score')::numeric < 4`,
        [userId]
      );
      const lowQualityRemoved = lowQualityResult.rowCount || 0;

      const totalRemoved = urlDupsRemoved + textDupsRemoved + lowQualityRemoved;
      console.log(`Deduplicate: ${urlDupsRemoved} URL dupes, ${textDupsRemoved} text dupes, ${lowQualityRemoved} low-quality removed`);

      return res.json({
        removed: totalRemoved,
        breakdown: {
          urlDuplicates: urlDupsRemoved,
          textDuplicates: textDupsRemoved,
          lowQualityPosts: lowQualityRemoved,
        },
        message: `Removed ${totalRemoved} posts total`
      });
    }

    // Fetch raw items from the most recent real Apify job — no new run, no AI filtering
    if (action === 'lastjob') {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      if (!APIFY_API_TOKEN) return res.status(500).json({ error: 'APIFY_API_TOKEN not configured' });

      const jobResult = await query(
        `SELECT * FROM scrape_jobs WHERE user_id = $1 AND apify_run_id IS NOT NULL AND apify_run_id NOT LIKE 'test-run-%'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (jobResult.rows.length === 0) return res.status(404).json({ error: 'No real Apify jobs found yet' });

      const job = jobResult.rows[0];

      try {
        const runRes = await axios.get(
          `https://api.apify.com/v2/actor-runs/${job.apify_run_id}`,
          { params: { token: APIFY_API_TOKEN } }
        );
        const datasetId = runRes.data?.data?.defaultDatasetId;
        if (!datasetId) return res.status(404).json({ error: 'No dataset found on this run', runId: job.apify_run_id });

        const dsRes = await axios.get(
          `https://api.apify.com/v2/datasets/${datasetId}/items`,
          { params: { token: APIFY_API_TOKEN, limit: 50 } }
        );
        return res.json({ job, datasetId, items: dsRes.data });
      } catch (err) {
        return res.status(500).json({ error: errorToString(err) });
      }
    }

    // Debug: fetch raw Apify dataset for a completed job
    if (action === 'debugjob') {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      if (!jobId) return res.status(400).json({ error: 'id param required' });

      const jobResult = await query('SELECT * FROM scrape_jobs WHERE id = $1 AND user_id = $2', [jobId, userId]);
      if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

      const job = jobResult.rows[0];
      if (!job.apify_run_id) return res.status(400).json({ error: 'No Apify run ID on this job' });

      try {
        const runRes = await axios.get(
          `https://api.apify.com/v2/actor-runs/${job.apify_run_id}`,
          { params: { token: APIFY_API_TOKEN } }
        );
        const datasetId = runRes.data?.data?.defaultDatasetId;
        if (!datasetId) return res.status(404).json({ error: 'No dataset on run', run: runRes.data?.data });

        const dsRes = await axios.get(
          `https://api.apify.com/v2/datasets/${datasetId}/items`,
          { params: { token: APIFY_API_TOKEN, limit: 10 } }
        );
        return res.json({ job, datasetId, items: dsRes.data });
      } catch (err) {
        return res.status(500).json({ error: errorToString(err) });
      }
    }

    // Live Apify test — triggers a real 1-post scrape to verify Apify connectivity and webhook callback
    if (action === 'livetest') {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      if (!APIFY_API_TOKEN) {
        return res.status(500).json({ error: 'APIFY_API_TOKEN not configured' });
      }

      const testGroupUrl = 'https://www.facebook.com/groups/1445573419202140/';

      const jobResult = await query(
        `INSERT INTO scrape_jobs (user_id, country, city, keywords, group_urls, stage, status)
         VALUES ($1, 'TH', '', $2, $3, 'search', 'running') RETURNING *`,
        [userId, [], [testGroupUrl]]
      );
      const job = jobResult.rows[0];

      try {
        const runId = await triggerApify(ACTOR_GROUPS, {
          startUrls: [{ url: testGroupUrl }],
          resultsLimit: 10,
          cookies: JSON.parse(process.env.FACEBOOK_COOKIES || '[]')
        });

        await query('UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2', [runId, job.id]);

        return res.status(201).json({ job: { ...job, apify_run_id: runId }, runId });
      } catch (err) {
        await query('UPDATE scrape_jobs SET status = $1 WHERE id = $2', ['failed', job.id]);
        return res.status(400).json({ error: 'Apify trigger failed: ' + errorToString(err) });
      }
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

      const { rawSaved, errors } = await saveRawPosts(job, mockItems);

      await query(
        `UPDATE scrape_jobs SET stage='scraping_done', posts_count=$1 WHERE id=$2`,
        [rawSaved, job.id]
      );

      res.json({
        success: true,
        message: `Simulation Stage 1 complete: ${rawSaved} raw posts saved from ${mockItems.length} mock items. AI analysis starting...`,
        jobId: job.id,
        rawSaved,
        totalMockItems: mockItems.length,
        groupUrls: ['https://www.facebook.com/groups/1445573419202140/'],
        errors: errors.length ? errors : undefined
      });

      await analyzeJobPosts(job.id, job.user_id, job.country, job.city, job.keywords);
      return;
    }

    // Manually trigger Stage 2 AI analysis for a job (retry if interrupted)
    if (action === 'analyze' && jobId) {
      await initDatabase();
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const jobResult = await query('SELECT * FROM scrape_jobs WHERE id = $1 AND user_id = $2', [jobId, userId]);
      if (!jobResult.rows.length) return res.status(404).json({ error: 'Job not found' });

      const job = jobResult.rows[0];
      // Reset all leads for this job so they get re-analyzed
      await query(
        `UPDATE leads SET is_analyzed = false WHERE user_id = $1 AND metadata->>'scrape_job_id' = $2`,
        [job.user_id, String(job.id)]
      );
      await analyzeJobPosts(job.id, job.user_id, job.country, job.city, job.keywords);
      const finalJob = await query('SELECT leads_count, properties_count, posts_count FROM scrape_jobs WHERE id = $1', [job.id]);
      const counts = finalJob.rows[0] || {};
      return res.json({ success: true, message: 'AI analysis complete', ...counts });
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

    const { country, groupUrls, keywords, resultsLimit } = req.body || {};
    const limit = Math.min(Math.max(parseInt(resultsLimit) || MAX_RESULTS, 1), 200);

    console.log('Received scrape request:', { country, groupUrls, keywords, limit, hasToken: !!APIFY_API_TOKEN });

    if (method === 'POST') {
      if (!groupUrls || !groupUrls.length) {
        return res.status(400).json({ error: 'At least one group URL is required' });
      }

      console.log('Creating groups scrape job (local scraper mode)...');
      const jobResult = await query(
        `INSERT INTO scrape_jobs (user_id, country, city, keywords, group_urls, stage, status, results_limit)
         VALUES ($1, $2, '', $3, $4, 'search', 'pending', $5) RETURNING *`,
        [userId, country || 'TH', keywords || [], groupUrls, limit]
      );
      console.log('Job created:', jobResult.rows[0]?.id);

      const job = jobResult.rows[0];

      return res.status(201).json({
        job,
        message: `Job queued — local scraper will pick it up shortly.`
      });
    }

    if (method === 'GET') {
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const result = await query(
        `SELECT j.*,
          (SELECT COUNT(*) FROM leads l WHERE l.user_id = j.user_id AND l.metadata->>'scrape_job_id' = j.id::text AND l.is_analyzed = true AND l.metadata->>'ai_listing_direction' = 'seeking') AS leads_count,
          (SELECT COUNT(*) FROM leads l WHERE l.user_id = j.user_id AND l.metadata->>'scrape_job_id' = j.id::text AND l.is_analyzed = true AND l.metadata->>'ai_listing_direction' = 'offering') AS properties_count
         FROM scrape_jobs j WHERE j.user_id = $1 ORDER BY j.created_at DESC LIMIT $2 OFFSET $3`,
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
                  `UPDATE scrape_jobs SET stage='search' WHERE id=$1 AND status='running' AND stage<>'search' AND stage<>'scraping_done' AND stage<>'analyzing' RETURNING id`,
                  [job.id]
                );
                if (claimed.rows.length === 0) {
                  console.log('Polling: job', job.id, 'already being processed, skipping');
                  continue;
                }
                console.log('Polling fallback: job', job.id, 'succeeded, saving raw posts');
                const datasetResp = await axios.get(
                  `https://api.apify.com/v2/datasets/${datasetId}/items`,
                  { params: { token: APIFY_API_TOKEN, limit: 1000 } }
                );
                const items = datasetResp.data || [];
                const { rawSaved } = await saveRawPosts(job, items);
                await query(
                  `UPDATE scrape_jobs SET stage='scraping_done', posts_count=$1 WHERE id=$2`,
                  [rawSaved, job.id]
                );
                job.status = 'running';
                job.stage = 'scraping_done';
                job.posts_count = rawSaved;
                console.log('Polling fallback: saved', rawSaved, 'raw posts for job', job.id, '— starting AI analysis');
                analyzeJobPosts(job.id, job.user_id, job.country, job.city, job.keywords).catch(err =>
                  console.error(`analyzeJobPosts polling error job ${job.id}:`, err.message)
                );
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
