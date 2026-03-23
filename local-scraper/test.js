import 'dotenv/config';
import { chromium } from 'playwright';

const FACEBOOK_COOKIES = JSON.parse(process.env.FACEBOOK_COOKIES || '[]');
const GROUP_URL = 'https://www.facebook.com/groups/1501439913830077';

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const sanitized = FACEBOOK_COOKIES
  .filter(c => c.name && c.domain)
  .map(c => ({ ...c, value: c.value ?? '', path: c.path ?? '/',
    sameSite: ['Strict','Lax','None'].includes(c.sameSite) ? c.sameSite : 'None' }));
await ctx.addCookies(sanitized);

const page = await ctx.newPage();
await page.goto(GROUP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('[role="feed"]', { timeout: 20000 });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);

const snapshot = async (label) => {
  const info = await page.evaluate(() => ({
    scrollY: window.scrollY,
    bodyHeight: document.body.scrollHeight,
    articles: [...document.querySelectorAll('[role="article"]')].map((el, i) => ({
      i,
      innerText: el.innerText?.trim()?.length || 0,
      textContent: el.textContent?.trim()?.length || 0,
      dirAutos: [...el.querySelectorAll('div[dir="auto"]')].map(d => d.innerText?.trim()?.slice(0,60)).filter(t => t.length > 5),
    })),
    allDirAutoTexts: [...document.querySelectorAll('div[dir="auto"]')]
      .map(e => e.innerText?.trim() || '').filter(t => t.length > 30).length,
  }));
  console.log(`\n[${label}] scrollY=${info.scrollY} bodyH=${info.bodyHeight} articles=${info.articles.length} dirAutos=${info.allDirAutoTexts}`);
  info.articles.forEach(a => {
    if (a.dirAutos.length > 0) {
      console.log(`  article[${a.i}]: dirAutos=[${a.dirAutos.map(t => `"${t.replace(/\n/g,' ')}"`).join(', ')}]`);
    } else {
      console.log(`  article[${a.i}]: innerText=${a.innerText} textContent=${a.textContent} (no dirAuto)`);
    }
  });
};

await snapshot('initial');

// Scroll in steps and check
for (let i = 1; i <= 8; i++) {
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(1500);
  await snapshot(`scroll ${i}`);
}

await browser.close();
