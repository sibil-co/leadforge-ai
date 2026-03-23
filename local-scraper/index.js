import 'dotenv/config';
import axios from 'axios';
import { chromium } from 'playwright';

const VERCEL_URL = process.env.VERCEL_URL;
const LOCAL_SCRAPER_SECRET = process.env.LOCAL_SCRAPER_SECRET;
const FACEBOOK_COOKIES = JSON.parse(process.env.FACEBOOK_COOKIES || '[]');
const POLL_INTERVAL_MS = 5000;

if (!VERCEL_URL) { console.error('VERCEL_URL is required in .env'); process.exit(1); }
if (!LOCAL_SCRAPER_SECRET) { console.error('LOCAL_SCRAPER_SECRET is required in .env'); process.exit(1); }

const api = axios.create({
  baseURL: VERCEL_URL,
  headers: { Authorization: `Bearer ${LOCAL_SCRAPER_SECRET}` },
  timeout: 120000,
});

const sanitizeCookies = (cookies) =>
  cookies
    .filter(c => c.name && c.domain)
    .map(c => ({
      ...c,
      value: c.value ?? '',
      path: c.path ?? '/',
      sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'None',
    }));

// Recursively search nested objects for items matching a predicate
function findAll(obj, pred, results = [], depth = 0) {
  if (depth > 50 || !obj || typeof obj !== 'object') return results;
  if (pred(obj)) results.push(obj);
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') findAll(val, pred, results, depth + 1);
  }
  return results;
}

// Extract scontent image URIs from a StoryAttachment object
const extractImageUris = (att) => {
  const uris = [];
  // Primary: nested under styles.attachment.all_subattachments.nodes[].media.image.uri
  const nodes = att?.styles?.attachment?.all_subattachments?.nodes || [];
  for (const node of nodes) {
    const uri = node?.media?.image?.uri;
    if (uri && uri.includes('scontent')) uris.push(uri);
  }
  // Fallback: single media photo
  const singleUri = att?.media?.image?.uri || att?.image?.uri;
  if (singleUri && singleUri.includes('scontent') && !uris.includes(singleUri)) uris.push(singleUri);
  return uris;
};

// Convert a Facebook GraphQL post object to our standard format
const convertPost = (p, groupId) => {
  const text = p.message?.text || '';
  const actor = p.actors?.[0];
  const postId = p.post_id || '';
  const facebookUrl = postId
    ? `https://www.facebook.com/groups/${groupId}/permalink/${postId}/`
    : '';
  const fb = p.feedback || {};

  // Flatten all image URIs from nested StoryAttachment structure
  const imageUris = [];
  for (const att of (p.attachments || [])) {
    for (const uri of extractImageUris(att)) {
      if (!imageUris.includes(uri)) imageUris.push(uri);
    }
  }
  const attachments = imageUris.slice(0, 10).map(uri => ({
    __typename: 'Photo',
    image: { uri },
    thumbnail: uri,
  }));

  return {
    text,
    facebookUrl,
    user: { id: actor?.id || '', name: actor?.name || 'Unknown' },
    likesCount: fb.reaction_count?.count || 0,
    commentsCount: fb.comment_count?.total_count || 0,
    sharesCount: fb.share_count?.count || 0,
    attachments,
    timestamp: p.creation_time || Math.floor(Date.now() / 1000),
    groupId,
  };
};

const scrapeOneGroup = async (groupUrl, resultsLimit) => {
  const groupId = groupUrl.match(/groups\/(\d+)/)?.[1] || '';

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-size=1280,900',
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'Asia/Bangkok',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });

  if (FACEBOOK_COOKIES.length) {
    await ctx.addCookies(sanitizeCookies(FACEBOOK_COOKIES));
  }

  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // Hide automation signals
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });

  // Collect structured post data from GraphQL responses (not DOM)
  const postsByText = new Map(); // textKey -> raw GraphQL post object

  const ingestPost = (p) => {
    const text = p.message?.text;
    if (!text || text.length < 20) return;
    const key = text.slice(0, 120);
    const existing = postsByText.get(key);
    // Prefer versions that have post_id and actors
    if (!existing || (!existing.post_id && p.post_id) || (!existing.actors && p.actors)) {
      postsByText.set(key, p);
      if (!existing) {
        console.log(`    +[${postsByText.size}] "${text.slice(0, 80).replace(/\n/g, ' ')}"`);
      }
    }
  };

  const extractPostsFromJson = (data) => {
    findAll(data, (obj) =>
      obj.message && typeof obj.message === 'object' && typeof obj.message.text === 'string' && obj.message.text.length > 20
    ).forEach(ingestPost);
  };

  // Intercept GraphQL API responses to capture post data as the page loads and scrolls
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/graphql')) return;
    try {
      const text = await response.text();
      for (const line of text.split('\n')) {
        try { extractPostsFromJson(JSON.parse(line)); } catch { }
      }
    } catch { }
  });

  // Also extract from initial HTML page response
  page.on('response', async (response) => {
    if (!response.url().includes(`/groups/`) || !response.headers()['content-type']?.includes('text/html')) return;
    try {
      const html = await response.text();
      const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = scriptRegex.exec(html)) !== null) {
        const content = match[1].trim();
        if (content.startsWith('{') || content.startsWith('[')) {
          try { extractPostsFromJson(JSON.parse(content)); } catch { }
        }
      }
    } catch { }
  });

  try {
    console.log(`Scraping group: ${groupUrl}`);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (page.url().includes('/login/')) {
      console.log('  Login redirect — retrying with cookies...');
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    }

    // GDPR consent
    try {
      const consentBtn = await page.$('[aria-label="Allow all cookies"], [data-testid="cookie-policy-manage-dialog-accept-button"]');
      if (consentBtn) { await consentBtn.click(); await page.waitForTimeout(2000); }
    } catch { }

    // Wait for feed
    try {
      await page.waitForSelector('[role="feed"]', { timeout: 20000 });
    } catch {
      const title = await page.title();
      const url = page.url();
      console.warn(`  Feed not found — title: "${title}" | url: ${url}`);
      if (/log in|sign up/i.test(title) || url.includes('/login')) {
        throw new Error('Facebook login wall — cookies expired. Re-export and update FACEBOOK_COOKIES in .env');
      }
      return [];
    }

    // Auth check
    await page.waitForTimeout(1500);
    const loginWall = await page.$('[role="dialog"] a[href*="/login"], [role="dialog"] [data-testid="royal_login_button"], [role="dialog"] [aria-label="Log In"]');
    if (loginWall) throw new Error('Facebook login wall — cookies expired. Re-export and update FACEBOOK_COOKIES in .env');
    const title = await page.title();
    if (/log in|sign up|create (an? )?account/i.test(title)) throw new Error(`Not logged in — title: "${title}"`);
    console.log('  Auth OK');

    // Let initial data load
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log(`  Initial load: ${postsByText.size} posts`);

    // Scroll to trigger more GraphQL fetches
    const maxScrolls = Math.max(100, resultsLimit * 6);
    let noNewCount = 0;

    for (let i = 0; i < maxScrolls && postsByText.size < resultsLimit; i++) {
      const sizeBefore = postsByText.size;

      // Click "See more" to expand truncated posts
      await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const pattern = /^(see more|voir plus|ver más|ดูเพิ่มเติม|xem thêm)$/i;
        let node;
        while ((node = walker.nextNode())) {
          if (pattern.test(node.textContent.trim())) {
            node.parentElement?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
        }
      });

      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(2000);

      const newPosts = postsByText.size - sizeBefore;
      if (i % 5 === 0 || newPosts > 0) {
        console.log(`  Step ${i + 1}: posts=${postsByText.size} +${newPosts}`);
      }

      if (newPosts === 0) {
        if (++noNewCount >= 20) { console.log('  Feed end — no new posts for 20 scrolls'); break; }
      } else {
        noNewCount = 0;
      }
    }

    const posts = [...postsByText.values()]
      .slice(0, resultsLimit)
      .map(p => convertPost(p, groupId));
    console.log(`  Collected ${posts.length} posts`);
    return posts;
  } finally {
    await browser.close();
  }
};

const scrapeGroups = async (startUrls, resultsLimit) => {
  const posts = [];
  for (const u of startUrls) {
    const url = u.url || u;
    const groupPosts = await scrapeOneGroup(url, resultsLimit);
    posts.push(...groupPosts);
  }
  return posts;
};

let busy = false;

const poll = async () => {
  if (!busy) {
    try {
      const { data } = await api.get('/api/scrape?action=pending_jobs');
      const jobs = data.jobs || [];

      if (jobs.length > 0) {
        busy = true;
        for (const job of jobs) {
          console.log(`\nStarting job ${job.id}: ${job.group_urls?.length} group(s), limit ${job.results_limit}`);
          try {
            const posts = await scrapeGroups(
              job.group_urls.map(u => ({ url: u })),
              job.results_limit || 20
            );
            console.log(`Job ${job.id}: scraped ${posts.length} raw posts, submitting to Vercel...`);
            const { data: result } = await api.post('/api/scrape?action=submit_results', { jobId: job.id, posts });
            console.log(`Job ${job.id}: done — ${result.leadsCreated || 0} leads, ${result.propertiesCreated || 0} properties`);
          } catch (err) {
            console.error(`Job ${job.id} failed:`, err.message);
            await api.post('/api/scrape?action=submit_results', {
              jobId: job.id,
              posts: [],
              error: err.message,
            }).catch(() => {});
          }
        }
        busy = false;
      }
    } catch (err) {
      if (err.code !== 'ECONNREFUSED') {
        console.error('Poll error:', err.message);
      }
      busy = false;
    }
  }

  setTimeout(poll, POLL_INTERVAL_MS);
};

console.log(`Local scraper starting`);
console.log(`Polling: ${VERCEL_URL} every ${POLL_INTERVAL_MS / 1000}s`);
console.log(`Cookies loaded: ${FACEBOOK_COOKIES.length}`);
if (FACEBOOK_COOKIES.length === 0) {
  console.warn('WARNING: No Facebook cookies found — auth will fail. Add FACEBOOK_COOKIES to .env');
}
poll();
