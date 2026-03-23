import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const { startUrls = [], resultsLimit = 20, cookies = [] } = await Actor.getInput() ?? {};

if (!startUrls.length) {
  console.error('No startUrls provided.');
  await Actor.exit();
}

if (!cookies.length) {
  console.warn('No cookies provided — group content may not load if the group is private.');
}

const proxyConfiguration = await Actor.createProxyConfiguration({
  groups: ['RESIDENTIAL'],
  countryCode: 'TH',
});

const crawler = new PlaywrightCrawler({
  maxRequestsPerCrawl: startUrls.length * 5,
  requestHandlerTimeoutSecs: 300,
  proxyConfiguration,

  preNavigationHooks: [async ({ page }) => {
    if (cookies.length) {
      const sanitized = cookies
        .filter(c => c.name && c.domain)
        .map(c => ({
          ...c,
          value: c.value ?? '',
          path: c.path ?? '/',
          sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite)
            ? c.sameSite
            : c.sameSite === 'lax' ? 'Lax'
            : c.sameSite === 'strict' ? 'Strict'
            : 'None',
        }));
      await page.context().addCookies(sanitized);
    }
  }],

  async requestHandler({ page, request }) {
    console.log(`Scraping group: ${request.url}`);

    // If cookies weren't picked up and we got redirected to login, navigate again now
    // (cookies were injected into the context in preNavigationHooks, so a second goto will use them)
    if (page.url().includes('/login/')) {
      console.log('  Got login redirect — re-navigating with cookies now in context...');
      await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    }

    // Dismiss GDPR / cookie consent dialogs (common for EU users)
    try {
      const consentBtn = await page.$('[aria-label="Allow all cookies"], [data-testid="cookie-policy-manage-dialog-accept-button"]');
      if (consentBtn) {
        await consentBtn.click();
        console.log('  Dismissed cookie consent dialog');
        await page.waitForTimeout(2000);
      }
    } catch { /* no consent dialog */ }

    // Wait for the group feed to appear
    try {
      await page.waitForSelector('[role="feed"]', { timeout: 20000 });
    } catch {
      const title = await page.title();
      const url = page.url();
      console.warn(`Feed not found — title: "${title}" | final URL: ${url}`);
      const screenshot = await page.screenshot({ fullPage: false });
      await Actor.setValue('debug-screenshot', screenshot, { contentType: 'image/png' });
      console.warn('Screenshot saved to key-value store as debug-screenshot');
      return;
    }

    // Verify we are actually authenticated — login wall means cookies are expired/invalid
    await page.waitForTimeout(1500);
    const loginWall = await page.$(
      '[role="dialog"] a[href*="/login"], [role="dialog"] [data-testid="royal_login_button"], [role="dialog"] [aria-label="Log In"]'
    );
    if (loginWall) {
      throw new Error(
        'Facebook login wall detected — session cookies are expired or invalid. Re-export fresh cookies from your browser and update the FACEBOOK_COOKIES environment variable.'
      );
    }
    const authTitle = await page.title();
    if (/log in|sign up|create (an? )?account/i.test(authTitle)) {
      throw new Error(
        `Facebook authentication failed — page title indicates not logged in: "${authTitle}". Please refresh your FACEBOOK_COOKIES.`
      );
    }
    console.log('  Auth check passed — session appears valid');

    // Screenshot right after feed loads to see current page state
    const feedScreenshot = await page.screenshot({ fullPage: false });
    await Actor.setValue('debug-feed-screenshot', feedScreenshot, { contentType: 'image/png' });

    // Wait for at least one post to hydrate with real text (Facebook renders posts lazily)
    try {
      await page.waitForFunction(
        () => {
          const posts = document.querySelectorAll('[role="article"]');
          return [...posts].some(p => p.innerText.trim().length > 50);
        },
        { timeout: 30000 }
      );
    } catch {
      console.warn('Posts did not hydrate with text content in time — page may be empty or blocked.');
      const screenshot = await page.screenshot({ fullPage: false });
      await Actor.setValue('debug-no-hydration-screenshot', screenshot, { contentType: 'image/png' });
    }

    // Expand all "See more" buttons by walking text nodes and dispatching click events.
    // dispatchEvent works even on off-screen elements unlike Playwright locator clicks.
    const expandAll = () => page.evaluate(() => {
      const targets = new Set(['See more', 'See More', 'En voir plus', 'Voir plus', 'Ver más', 'ดูเพิ่มเติม']);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let count = 0;
      let node;
      while ((node = walker.nextNode())) {
        if (targets.has(node.textContent.trim()) && node.parentElement) {
          node.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          count++;
        }
      }
      return count;
    });

    for (let i = 0; i < Math.ceil(resultsLimit / 2) + 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      const expanded = await expandAll();
      if (expanded > 0) {
        console.log(`  Expanded ${expanded} truncated posts`);
        await page.waitForTimeout(800);
      }
      const count = await page.$$eval(
        '[role="article"]',
        els => els.filter(e => e.innerText.trim().length > 50).length
      );
      console.log(`  Loaded ${count} posts with content so far…`);
      if (count >= resultsLimit) break;
    }

    const groupUrl = request.url;
    const groupId = groupUrl.match(/groups\/(\d+)/)?.[1] || '';

    const posts = await page.$$eval(
      '[role="article"]',
      (articles, groupId) => articles.map(article => {
        // ── Post text ──────────────────────────────────────────────────────
        // Avoid including UI labels (Like, Comment, Share buttons)
        const textEl = article.querySelector('[data-ad-comet-content], [data-ad-preview="message"]')
          || article.querySelector('div[dir="auto"]');
        const text = textEl?.innerText?.trim() || article.innerText?.slice(0, 3000) || '';

        // ── Permalink URL ──────────────────────────────────────────────────
        // The timestamp on each post is an <a> that links to the specific post
        const timeLink = article.querySelector(
          'a[href*="/posts/"], a[href*="/permalink/"], a[aria-label][href*="facebook.com/groups"]'
        );
        const rawHref = timeLink?.href || '';
        const postIdMatch = rawHref.match(/\/posts\/(\d+)|\/permalink\/(\d+)/);
        const postId = postIdMatch?.[1] || postIdMatch?.[2] || '';
        const facebookUrl = postId
          ? `https://www.facebook.com/groups/${groupId}/permalink/${postId}/`
          : rawHref || `https://www.facebook.com/groups/${groupId}/`;

        // ── Author ─────────────────────────────────────────────────────────
        const authorLink = article.querySelector(
          'a[href*="facebook.com"]:not([href*="/posts/"]):not([href*="/permalink/"]):not([href*="/groups/"])'
        );
        const userName = authorLink?.innerText?.trim() || 'Unknown';
        const userHref = authorLink?.href || '';
        let userId = '';
        try {
          const u = new URL(userHref);
          const pathParts = u.pathname.split('/').filter(Boolean);
          // Skip Facebook path prefixes like 'people', 'profile.php', etc.
          const skipPrefixes = new Set(['people', 'profile.php', 'pages', 'pg']);
          const idPart = pathParts.find(p => !skipPrefixes.has(p)) || '';
          userId = u.searchParams.get('id') || idPart;
        } catch { /* ignore invalid URLs */ }

        // ── Engagement ─────────────────────────────────────────────────────
        const bodyText = article.innerText;
        const likesMatch = bodyText.match(/(\d[\d,]*)\s*(reactions?|likes?)/i);
        const commentsMatch = bodyText.match(/(\d[\d,]*)\s*comments?/i);
        const sharesMatch = bodyText.match(/(\d[\d,]*)\s*shares?/i);
        const parseNum = (m) => parseInt((m?.[1] || '0').replace(/,/g, '')) || 0;

        // ── Images ─────────────────────────────────────────────────────────
        const imgEls = Array.from(article.querySelectorAll('img[src*="scontent"]'));
        const imageUrls = [...new Set(imgEls.map(img => img.src))].slice(0, 10);

        return {
          text,
          facebookUrl,
          user: { id: userId, name: userName },
          likesCount: parseNum(likesMatch),
          commentsCount: parseNum(commentsMatch),
          sharesCount: parseNum(sharesMatch),
          attachments: imageUrls.map(uri => ({
            __typename: 'Photo',
            image: { uri },
            thumbnail: uri,
          })),
          timestamp: Math.floor(Date.now() / 1000),
          groupId,
        };
      }),
      groupId
    );

    // Debug: log page title and first article texts
    const pageTitle = await page.title();
    console.log(`  Page title: ${pageTitle}`);
    for (const p of posts.slice(0, 3)) {
      console.log(`  Article text preview: "${p.text.slice(0, 100)}" | facebookUrl: ${p.facebookUrl}`);
    }

    let saved = 0;
    for (const post of posts) {
      if (saved >= resultsLimit) break;
      // Skip very short posts (UI artifacts, empty articles)
      if (post.text.length < 20) continue;
      await Actor.pushData(post);
      saved++;
    }

    console.log(`  Saved ${saved} posts from ${request.url}`);
  },

  // Don't rotate sessions — we rely on injected cookies
  useSessionPool: false,
});

await crawler.addRequests(startUrls.map(u => ({ url: u.url || u })));
await crawler.run();

console.log('Done.');
await Actor.exit();
