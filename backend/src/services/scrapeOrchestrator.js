import { query } from '../config/database.js';
import { triggerGroupsScraper, triggerPostsScraper, triggerCommentsScraper, getApifyResults } from './apifyService.js';

const MAX_GROUPS = parseInt(process.env.SCRAPE_MAX_GROUPS) || 20;
const MAX_POSTS_PER_GROUP = parseInt(process.env.SCRAPE_MAX_POSTS_PER_GROUP) || 50;
const MAX_RETRY_ATTEMPTS = parseInt(process.env.SCRAPE_RETRY_ATTEMPTS) || 3;
const RETRY_DELAY_MS = parseInt(process.env.SCRAPE_RETRY_DELAY_MS) || 5000;

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
    /(\d+)\s*(?:million|billion|k)/gi,
    /price[:\s]*(\d+)/gi
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let price = match[1].replace(/,/g, '');
      if (match[0].toLowerCase().includes('million')) {
        price = parseFloat(price) * 1000000;
      } else if (match[0].toLowerCase().includes('billion')) {
        price = parseFloat(price) * 1000000000;
      } else if (match[0].toLowerCase().includes('k')) {
        price = parseFloat(price) * 1000;
      }
      return parseFloat(price);
    }
  }
  return null;
};

const extractArea = (text) => {
  if (!text) return null;
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:sqm|sq\.?m|m²|sqft|sq\.?ft|ft²)/gi,
    /(\d+(?:\.\d+)?)\s*(?:sq|meter|foot)s?/gi,
    /(\d+)m2/gi,
    /area[:\s]*(\d+)/gi
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let area = parseFloat(match[1]);
      if (match[0].toLowerCase().includes('sqft') || match[0].toLowerCase().includes('sq.ft') || match[0].toLowerCase().includes('ft')) {
        area = area * 0.092903;
      }
      return area;
    }
  }
  return null;
};

export const startWorkflow = async (userId, country, city, keywords) => {
  const jobResult = await query(
    `INSERT INTO scrape_jobs (user_id, country, city, keywords, stage, status) 
     VALUES ($1, $2, $3, $4, 'groups', 'running') RETURNING *`,
    [userId, country, city, keywords]
  );

  const job = jobResult.rows[0];

  try {
    const apifyResult = await triggerGroupsScraper({
      country,
      city,
      keywords,
      userId: userId.toString()
    });

    await query(
      'UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2',
      [apifyResult.data.runId, job.id]
    );

    return { job, apifyRunId: apifyResult.data.runId };
  } catch (error) {
    await query(
      'UPDATE scrape_jobs SET stage = $1, status = $2 WHERE id = $3',
      ['groups', 'failed', job.id]
    );
    throw error;
  }
};

export const handleGroupsComplete = async (runId, items, keywords) => {
  const jobResult = await query(
    'SELECT * FROM scrape_jobs WHERE apify_run_id = $1',
    [runId]
  );

  if (jobResult.rows.length === 0) {
    console.error('Job not found for runId:', runId);
    return;
  }

  const job = jobResult.rows[0];

  const topGroups = (items || []).slice(0, MAX_GROUPS).map(group => ({
    groupId: group.id || group.groupId || group.groupId,
    groupName: group.name || group.groupName || 'Unknown',
    groupUrl: group.url || group.groupUrl || group.link || '',
    memberCount: parseInt(group.members || group.memberCount || group.member_count || 0),
    postsCount: parseInt(group.posts || group.postsCount || group.posts_count || 0)
  }));

  for (const group of topGroups) {
    await query(
      `INSERT INTO scraped_groups (job_id, group_id, group_name, group_url, member_count, posts_count, scrape_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [job.id, group.groupId, group.groupName, group.groupUrl, group.memberCount, group.postsCount]
    );
  }

  await query(
    'UPDATE scrape_jobs SET stage = $1, groups_found = $2, apify_run_id = NULL WHERE id = $3',
    ['posts', topGroups.length, job.id]
  );

  const groupUrls = topGroups.map(g => g.groupUrl).filter(url => url);
  const groupIds = topGroups.map(g => g.groupId);

  try {
    const apifyResult = await triggerPostsScraper({
      groupUrls,
      groupIds,
      userId: job.user_id.toString()
    });

    await query(
      'UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2',
      [apifyResult.data.runId, job.id]
    );
  } catch (error) {
    console.error('Failed to trigger posts scraper:', error);
    await retryStep(job.id, 'posts');
  }
};

export const handlePostsComplete = async (runId, items, keywords) => {
  const jobResult = await query(
    'SELECT * FROM scrape_jobs WHERE apify_run_id = $1',
    [runId]
  );

  if (jobResult.rows.length === 0) {
    console.error('Job not found for runId:', runId);
    return;
  }

  const job = jobResult.rows[0];
  const jobKeywords = job.keywords || [];

  const groupsResult = await query(
    'SELECT * FROM scraped_groups WHERE job_id = $1 AND scrape_status = $1',
    [job.id]
  );
  const groupsMap = {};
  (groupsResult.rows || []).forEach(g => {
    groupsMap[g.group_id] = g.id;
  });

  const postsToScrapeComments = [];
  let totalPosts = 0;

  for (const post of items || []) {
    const postText = post.text || post.message || post.postText || '';
    const matchedKeywords = extractKeywords(postText, jobKeywords);
    const hasKeywordMatch = matchedKeywords.length > 0;

    const price = extractPrice(postText);
    const area = extractArea(postText);

    const groupId = post.groupId || post.group_id || post.groupUrl;
    const mappedGroupId = groupsMap[groupId] || null;

    await query(
      `INSERT INTO scraped_posts (
        job_id, group_id, post_id, post_url, text, images, price, area, city, location,
        created_at, likes_count, comments_count, keywords_matched, scrape_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        job.id,
        mappedGroupId,
        post.id || post.postId,
        post.url || post.postUrl || post.link || '',
        postText,
        JSON.stringify(post.images || post.photos || []),
        price,
        area,
        post.city || post.location || job.city,
        post.location || '',
        post.createdAt || post.created_at || post.timestamp || null,
        parseInt(post.likes || post.likesCount || post.likes_count || 0),
        parseInt(post.comments || post.commentsCount || post.comments_count || 0),
        matchedKeywords,
        hasKeywordMatch ? 'scraping' : 'completed'
      ]
    );

    totalPosts++;

    if (hasKeywordMatch) {
      const postResult = await query(
        'SELECT id, post_url FROM scraped_posts WHERE job_id = $1 AND post_id = $2 ORDER BY created_at DESC LIMIT 1',
        [job.id, post.id || post.postId]
      );
      if (postResult.rows.length > 0) {
        postsToScrapeComments.push({
          postId: postResult.rows[0].id,
          postUrl: postResult.rows[0].post_url
        });
      }
    }
  }

  await query(
    'UPDATE scrape_jobs SET stage = $1, posts_scraped = $2, apify_run_id = NULL WHERE id = $3',
    ['comments', totalPosts, job.id]
  );

  if (postsToScrapeComments.length === 0) {
    await query(
      'UPDATE scrape_jobs SET stage = $1, status = $2 WHERE id = $3',
      ['completed', 'completed', job.id]
    );
    return;
  }

  const postUrls = postsToScrapeComments.map(p => p.postUrl).filter(url => url);
  const postIds = postsToScrapeComments.map(p => p.postId);

  try {
    const apifyResult = await triggerCommentsScraper({
      postUrls,
      postIds,
      userId: job.user_id.toString()
    });

    await query(
      'UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2',
      [apifyResult.data.runId, job.id]
    );
  } catch (error) {
    console.error('Failed to trigger comments scraper:', error);
    await retryStep(job.id, 'comments');
  }
};

export const handleCommentsComplete = async (runId, items, keywords) => {
  const jobResult = await query(
    'SELECT * FROM scrape_jobs WHERE apify_run_id = $1',
    [runId]
  );

  if (jobResult.rows.length === 0) {
    console.error('Job not found for runId:', runId);
    return;
  }

  const job = jobResult.rows[0];
  const jobKeywords = job.keywords || [];

  const postsResult = await query(
    'SELECT id, post_id, post_url FROM scraped_posts WHERE job_id = $1 AND scrape_status = $2',
    [job.id, 'scraping']
  );
  const postsMap = {};
  (postsResult.rows || []).forEach(p => {
    postsMap[p.post_url] = p.id;
    postsMap[p.post_id] = p.id;
  });

  let commentsAnalyzed = 0;
  let leadsCreated = 0;

  for (const comment of items || []) {
    const commentText = comment.text || comment.message || comment.commentText || '';
    const matchedKeywords = extractKeywords(commentText, jobKeywords);

    if (matchedKeywords.length === 0) continue;

    commentsAnalyzed++;

    const postUrl = comment.postUrl || comment.post_url || comment.postLink || '';
    const postId = postsMap[postUrl] || postsMap[comment.postId] || null;

    const price = extractPrice(commentText);
    const area = extractArea(commentText);

    const leadName = comment.authorName || comment.author_name || comment.userName || comment.username || 'Unknown';
    const facebookId = comment.authorId || comment.author_id || comment.userId || comment.user_id || null;

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
        [
          price,
          area,
          commentText,
          JSON.stringify({ ...comment, keywords_matched: matchedKeywords }),
          existingLeadResult.rows[0].id
        ]
      );
    } else {
      await query(
        `INSERT INTO leads (
          user_id, name, price, area, city, source_url, source_type, facebook_id,
          post_id, is_from_comment, comment_id, comment_text, metadata, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'new')`,
        [
          job.user_id,
          leadName,
          price,
          area,
          job.city,
          comment.url || comment.commentUrl || '',
          'comment',
          facebookId,
          postId,
          true,
          comment.id || comment.commentId,
          commentText,
          JSON.stringify({ ...comment, keywords_matched: matchedKeywords })
        ]
      );
      leadsCreated++;
    }

    if (postId) {
      await query(
        'UPDATE scraped_posts SET scrape_status = $1 WHERE id = $2',
        ['comments_scraped', postId]
      );
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
};

export const handleStageFailure = async (runId) => {
  const jobResult = await query(
    'SELECT * FROM scrape_jobs WHERE apify_run_id = $1',
    [runId]
  );

  if (jobResult.rows.length === 0) return;

  const job = jobResult.rows[0];
  await retryStep(job.id, job.stage);
};

const retryStep = async (jobId, stage) => {
  const jobResult = await query('SELECT * FROM scrape_jobs WHERE id = $1', [jobId]);
  if (jobResult.rows.length === 0) return;

  const job = jobResult.rows[0];
  const retryCount = (job.retry_count || 0) + 1;

  if (retryCount >= MAX_RETRY_ATTEMPTS) {
    await query(
      'UPDATE scrape_jobs SET stage = $1, status = $2, retry_count = $3 WHERE id = $4',
      [stage, 'partial', retryCount, jobId]
    );
    return;
  }

  await query(
    'UPDATE scrape_jobs SET retry_count = $1 WHERE id = $2',
    [retryCount, jobId]
  );

  console.log(`Retrying stage ${stage} for job ${jobId}, attempt ${retryCount}`);

  setTimeout(async () => {
    try {
      if (stage === 'groups') {
        const apifyResult = await triggerGroupsScraper({
          country: job.country,
          city: job.city,
          keywords: job.keywords,
          userId: job.user_id.toString()
        });
        await query(
          'UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2',
          [apifyResult.data.runId, jobId]
        );
      } else if (stage === 'posts') {
        const groupsResult = await query(
          'SELECT group_url, group_id FROM scraped_groups WHERE job_id = $1',
          [jobId]
        );
        const groupUrls = groupsResult.rows.map(g => g.group_url).filter(url => url);
        const groupIds = groupsResult.rows.map(g => g.group_id);

        const apifyResult = await triggerPostsScraper({
          groupUrls,
          groupIds,
          userId: job.user_id.toString()
        });
        await query(
          'UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2',
          [apifyResult.data.runId, jobId]
        );
      } else if (stage === 'comments') {
        const postsResult = await query(
          'SELECT id, post_url FROM scraped_posts WHERE job_id = $1 AND scrape_status = $2',
          [jobId, 'scraping']
        );
        const postUrls = postsResult.rows.map(p => p.post_url).filter(url => url);
        const postIds = postsResult.rows.map(p => p.id);

        const apifyResult = await triggerCommentsScraper({
          postUrls,
          postIds,
          userId: job.user_id.toString()
        });
        await query(
          'UPDATE scrape_jobs SET apify_run_id = $1 WHERE id = $2',
          [apifyResult.data.runId, jobId]
        );
      }
    } catch (error) {
      console.error(`Retry failed for stage ${stage}:`, error);
    }
  }, RETRY_DELAY_MS * retryCount);
};

export default {
  startWorkflow,
  handleGroupsComplete,
  handlePostsComplete,
  handleCommentsComplete,
  handleStageFailure,
  retryStep
};
