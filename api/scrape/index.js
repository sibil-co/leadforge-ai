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

const MAX_GROUPS = parseInt(process.env.SCRAPE_MAX_GROUPS) || 20;
const MAX_POSTS_PER_GROUP = parseInt(process.env.SCRAPE_MAX_POSTS_PER_GROUP) || 50;
const REQUEST_DELAY_MS = 5000; // 5 seconds delay between requests
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

const extractKeywords = (text, keywords) => {
  if (!text || !keywords || !Array.isArray(keywords)) return [];
  const lowerText = text.toLowerCase();
  return keywords.filter(kw => lowerText.includes(kw.toLowerCase()));
};

const extractPrice = (text) => {
  if (!text) return null;
  const patterns = [
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:USD|THB|EUR|GBP|B|A\$)/gi,
    /(?:USD|THB|EUR|GBP|B|A\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
    /(\d+)\s*(?:million|billion|k)/gi
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
    /(\d+)m2/gi
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

      // STAGE 1: Search results processed - extract groups and start posts scraper
      if (stage === 'apify/facebook-search-scraper') {
        console.log('Search stage complete, items:', items?.length || 0);
        
        // Extract group URLs from search results
        const groupUrls = [];
        const seenUrls = new Set();
        
        for (const item of items || []) {
          // Try to find group URLs in search results
          const url = item.url || item.groupUrl || item.link || item.postUrl || '';
          if (url.includes('facebook.com/groups/') && !seenUrls.has(url)) {
            seenUrls.add(url);
            groupUrls.push({ url });
          }
        }

        console.log('Found groups:', groupUrls.length);

        // If no groups found in search, try direct keyword search
        if (groupUrls.length === 0) {
          // Use a fallback - try to find posts directly in search results
          await query(
            'UPDATE scrape_jobs SET stage = $1, groups_found = $2, apify_run_id = NULL WHERE id = $3',
            ['posts', 0, job.id]
          );
          
          // Skip to posts stage with the search results as posts
          for (const post of items || []) {
            const postText = post.text || post.message || post.postText || '';
            const matchedKeywords = extractKeywords(postText, keywords);
            const price = extractPrice(postText);
            const area = extractArea(postText);

            await query(
              `INSERT INTO scraped_posts (
                job_id, post_id, post_url, text, images, price, area, city, location,
                created_at, likes_count, comments_count, keywords_matched, scrape_status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                job.id, post.id || post.postId, post.url || post.postUrl || '',
                postText, JSON.stringify(post.images || []),
                price, area, job.city, '',
                post.createdAt || null,
                parseInt(post.likes || 0), parseInt(post.comments || 0),
                matchedKeywords, matchedKeywords.length > 0 ? 'scraping' : 'completed'
              ]
            );
          }

          const totalPosts = items?.length || 0;
          await query(
            'UPDATE scrape_jobs SET posts_scraped = $1, apify_run_id = NULL WHERE id = $2',
            [totalPosts, job.id]
          );

          // Move to comments stage or complete
          if (totalPosts > 0) {
            return res.json({ success: true, message: `Found ${totalPosts} posts from search, skipping to comments stage` });
          } else {
            await query('UPDATE scrape_jobs SET status = $1, stage = $2 WHERE id = $3', ['completed', 'completed', job.id]);
            return res.json({ success: true, message: 'No results found' });
          }
        }

        // Save groups and start posts scraper
        for (const group of groupUrls.slice(0, MAX_GROUPS)) {
          await query(
            `INSERT INTO scraped_groups (job_id, group_id, group_name, group_url, scrape_status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [job.id, group.url, group.url.split('/groups/')[1]?.split('/')[0] || 'Unknown', group.url]
          );
        }

        await query(
          'UPDATE scrape_jobs SET stage = $1, groups_found = $2, apify_run_id = NULL WHERE id = $3',
          ['posts', groupUrls.length, job.id]
        );

        // Start posts scraper with discovered group URLs
        const runId = await triggerApify('apify/facebook-groups-scraper', {
          startUrls: groupUrls.slice(0, MAX_GROUPS),
          limit: MAX_POSTS_PER_GROUP,
          proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
          maxRequestRetries: 5,
          maxConcurrency: 1
        });

        await query('UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2', [runId, job.id]);

        return res.json({ success: true, message: `Found ${groupUrls.length} groups, scraping posts...` });
      }

      // STAGE 2: Posts scraped - process and start comments scraper
      if (stage === 'apify/facebook-groups-scraper') {
        const groupsResult = await query('SELECT id, group_id FROM scraped_groups WHERE job_id = $1', [job.id]);
        const groupsMap = {};
        groupsResult.rows.forEach(g => { groupsMap[g.group_id] = g.id; });

        const postsToScrapeComments = [];

        for (const post of items || []) {
          const postText = post.text || post.message || post.postText || '';
          const matchedKeywords = extractKeywords(postText, keywords);
          const hasKeywordMatch = matchedKeywords.length > 0;

          const price = extractPrice(postText);
          const area = extractArea(postText);

          const groupId = post.groupId || post.group_url || '';
          const mappedGroupId = groupsMap[groupId] || null;

          await query(
            `INSERT INTO scraped_posts (
              job_id, group_id, post_id, post_url, text, images, price, area, city, location,
              created_at, likes_count, comments_count, keywords_matched, scrape_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              job.id, mappedGroupId, post.id || post.postId,
              post.url || post.postUrl || post.link || '',
              postText, JSON.stringify(post.images || post.photos || []),
              price, area, post.city || post.location || job.city, post.location || '',
              post.createdAt || post.created_at || post.timestamp || null,
              parseInt(post.likes || post.likesCount || 0),
              parseInt(post.comments || post.commentsCount || 0),
              matchedKeywords, hasKeywordMatch ? 'scraping' : 'completed'
            ]
          );

          if (hasKeywordMatch) {
            const postResult = await query(
              'SELECT id, post_url FROM scraped_posts WHERE job_id = $1 AND post_id = $2 ORDER BY created_at DESC LIMIT 1',
              [job.id, post.id || post.postId]
            );
            if (postResult.rows.length > 0) {
              postsToScrapeComments.push({ postId: postResult.rows[0].id, postUrl: postResult.rows[0].post_url });
            }
          }
        }

        const totalPosts = items?.length || 0;
        await query(
          'UPDATE scrape_jobs SET stage = $1, posts_scraped = $2, apify_run_id = NULL WHERE id = $3',
          ['comments', totalPosts, job.id]
        );

        if (postsToScrapeComments.length > 0) {
          const postUrls = postsToScrapeComments.map(p => p.postUrl).filter(url => url);
          const runId = await triggerApify('apify/facebook-comments-scraper', {
            postUrls: postUrls.slice(0, 100), // Limit to 100 posts
            limit: 50,
            proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] }
          });
          await query('UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2', [runId, job.id]);
        } else {
          await query(
            'UPDATE scrape_jobs SET stage = $1, status = $2 WHERE id = $3',
            ['completed', 'completed', job.id]
          );
        }

        return res.json({ success: true, message: `Processed ${totalPosts} posts` });
      }

      // STAGE 3: Comments scraped - save leads
      if (stage === 'apify/facebook-comments-scraper') {
        const postsResult = await query(
          'SELECT id, post_id, post_url FROM scraped_posts WHERE job_id = $1 AND scrape_status = $2',
          [job.id, 'scraping']
        );
        const postsMap = {};
        postsResult.rows.forEach(p => {
          postsMap[p.post_url] = p.id;
          postsMap[p.post_id] = p.id;
        });

        let commentsAnalyzed = 0;
        let leadsCreated = 0;

        for (const comment of items || []) {
          const commentText = comment.text || comment.message || comment.commentText || '';
          const matchedKeywords = extractKeywords(commentText, keywords);

          if (matchedKeywords.length === 0) continue;
          commentsAnalyzed++;

          const postUrl = comment.postUrl || comment.post_url || comment.postLink || '';
          const postId = postsMap[postUrl] || postsMap[comment.postId] || null;

          const price = extractPrice(commentText);
          const area = extractArea(commentText);
          const leadName = comment.authorName || comment.author_name || comment.userName || 'Unknown';
          const facebookId = comment.authorId || comment.author_id || comment.userId || null;

          const existingLeadResult = await query(
            'SELECT id FROM leads WHERE user_id = $1 AND facebook_id = $2 AND source_url = $3',
            [job.user_id, facebookId, comment.url || comment.commentUrl || '']
          );

          if (existingLeadResult.rows.length > 0) {
            await query(
              `UPDATE leads SET 
                price = COALESCE(price, $1),
                area = COALESCE(area, $2),
                comment_text = $3,
                is_from_comment = true,
                metadata = metadata || $4
              WHERE id = $5`,
              [price, area, commentText, JSON.stringify({ ...comment, keywords_matched: matchedKeywords }), existingLeadResult.rows[0].id]
            );
          } else {
            await query(
              `INSERT INTO leads (
                user_id, name, price, area, city, source_url, source_type, facebook_id,
                post_id, is_from_comment, comment_id, comment_text, metadata, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'new')`,
              [
                job.user_id, leadName, price, area, job.city,
                comment.url || comment.commentUrl || '', 'comment', facebookId,
                postId, true, comment.id || comment.commentId, commentText,
                JSON.stringify({ ...comment, keywords_matched: matchedKeywords })
              ]
            );
            leadsCreated++;
          }

          if (postId) {
            await query('UPDATE scraped_posts SET scrape_status = $1 WHERE id = $2', ['comments_scraped', postId]);
          }
        }

        await query(
          `UPDATE scrape_jobs SET 
            stage = 'completed',
            status = 'completed',
            comments_analyzed = comments_analyzed + $1,
            leads_count = leads_count + $2,
            apify_run_id = NULL,
            completed_at = NOW()
          WHERE id = $3`,
          [commentsAnalyzed, leadsCreated, job.id]
        );

        return res.json({ success: true, message: 'Crawl completed' });
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

      // Check if keywords contain group URLs
      const groupUrls = keywords.map(k => k.trim()).filter(k => {
        return k.includes('facebook.com/groups/') || k.includes('http');
      }).map(url => ({ url }));

      // If no URLs provided, try search actor, otherwise use provided URLs
      const useSearchActor = groupUrls.length === 0;

      // Create job
      const jobResult = await query(
        `INSERT INTO scrape_jobs (user_id, country, city, keywords, stage, status) 
         VALUES ($1, $2, $3, $4, 'search', 'running') RETURNING *`,
        [userId, country || 'TH', city || '', keywords]
      );

      const job = jobResult.rows[0];

      try {
        let runId;
        
        if (useSearchActor) {
          // Skip search actor - it returns 0 results due to Facebook blocking
          // Fall back to asking user for group URLs
          console.log('Search actor returns 0 results (Facebook blocking), asking for group URLs');
          return res.status(400).json({ 
            error: 'Facebook search is currently blocked. Please provide Facebook Group URLs instead.',
            hint: 'Find groups on Facebook and paste their URLs here',
            exampleUrl: 'https://www.facebook.com/groups/235193037002481/',
            exampleUrl2: 'https://www.facebook.com/groups/123456789/'
          });
        } else {
          // Use provided group URLs directly
          const urls = groupUrls.slice(0, MAX_GROUPS);
          
          // Save groups to database
          for (const group of urls) {
            const groupName = group.url.split('/groups/')[1]?.split('/')[0] || 'Unknown';
            await query(
              `INSERT INTO scraped_groups (job_id, group_id, group_name, group_url, scrape_status)
               VALUES ($1, $2, $3, $4, 'pending')`,
              [job.id, group.url, groupName, group.url]
            );
          }

          await query(
            'UPDATE scrape_jobs SET stage = $1, groups_found = $2 WHERE id = $3',
            ['groups', urls.length, job.id]
          );

          // Start scraping posts from groups
          runId = await triggerApify('apify/facebook-groups-scraper', {
            startUrls: urls,
            limit: MAX_POSTS_PER_GROUP,
            proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
            maxRequestRetries: 5,
            maxConcurrency: 1
          });

          await query('UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2', [runId, job.id]);

          return res.status(201).json({ 
            job, 
            message: `Crawl started! Scraping posts from ${urls.length} groups...`
          });
        }
      } catch (apifyError) {
        console.error('Apify error:', apifyError.message);
        await query('UPDATE scrape_jobs SET status = $1 WHERE id = $2', ['failed', job.id]);
        return res.status(500).json({ error: 'Failed to start crawl: ' + apifyError.message });
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
