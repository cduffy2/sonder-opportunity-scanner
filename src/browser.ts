import { chromium } from 'playwright';

export interface BrowserScrapeResult {
  label: string;
  url: string;
  markdown: string;
  error?: string;
}

const RELIEFWEB_TENDERS_URL = 'https://reliefweb.int/jobs?type%5B%5D=1068&type%5B%5D=1071';
const UNGM_NOTICES_URL = 'https://www.ungm.org/Public/Notice';

const MAX_JOBS_TO_FOLLOW = 15;
const PAGE_TIMEOUT = 20000;

async function scrapeReliefWebTenders(): Promise<BrowserScrapeResult[]> {
  const browser = await chromium.launch({ headless: true });
  const results: BrowserScrapeResult[] = [];

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    await page.goto(RELIEFWEB_TENDERS_URL, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });

    // Extract job links from listing
    const jobLinks = await page.$$eval('article a[href*="/job/"]', (els) =>
      [...new Set((els as any[]).map((el) => el.href))].slice(0, 15)
    );

    if (jobLinks.length === 0) {
      const fallback = await page.$$eval('a[href*="/job/"]', (els) =>
        [...new Set((els as any[]).map((el) => el.href))].slice(0, 15)
      );
      jobLinks.push(...fallback);
    }

    console.log(`  ReliefWeb: found ${jobLinks.length} job links`);

    for (const url of jobLinks.slice(0, MAX_JOBS_TO_FOLLOW)) {
      try {
        const jobPage = await browser.newPage();
        await jobPage.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });

        const text = await jobPage.evaluate(() => {
          const main = (document as any).querySelector('main') || (document as any).body;
          return main.innerText.slice(0, 3000);
        });

        await jobPage.close();

        if (text.trim().length > 100) {
          results.push({ label: 'ReliefWeb Job', url, markdown: text });
        }
      } catch {
        // skip individual job failures silently
      }
    }
  } catch (err) {
    results.push({ label: 'ReliefWeb Tenders', url: RELIEFWEB_TENDERS_URL, markdown: '', error: String(err) });
  } finally {
    await browser.close();
  }

  return results;
}

async function scrapeUNGMNotices(): Promise<BrowserScrapeResult[]> {
  const browser = await chromium.launch({ headless: true });
  const results: BrowserScrapeResult[] = [];

  try {
    const page = await browser.newPage();
    await page.goto(UNGM_NOTICES_URL, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });

    const noticeLinks = await page.$$eval('a[href*="/Public/Notice/"]', (els) =>
      [...new Set((els as any[]).map((el) => el.href))].slice(0, MAX_JOBS_TO_FOLLOW)
    );

    console.log(`  UNGM: found ${noticeLinks.length} notice links`);

    for (const url of noticeLinks) {
      try {
        const noticePage = await browser.newPage();
        await noticePage.goto(url, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT });

        const text = await noticePage.evaluate(() => {
          const main = (document as any).querySelector('main') || (document as any).querySelector('#mainContent') || (document as any).body;
          return main.innerText.slice(0, 3000);
        });

        await noticePage.close();

        if (text.trim().length > 100) {
          results.push({ label: 'UNGM Notice', url, markdown: text });
        }
      } catch {
        // skip individual notice failures silently
      }
    }
  } catch (err) {
    results.push({ label: 'UNGM Notices', url: UNGM_NOTICES_URL, markdown: '', error: String(err) });
  } finally {
    await browser.close();
  }

  return results;
}

export async function scrapeWithBrowser(): Promise<BrowserScrapeResult[]> {
  console.log('Scraping ReliefWeb and UNGM with headless browser...');
  const [reliefweb, ungm] = await Promise.all([
    scrapeReliefWebTenders(),
    scrapeUNGMNotices(),
  ]);
  const all = [...reliefweb, ...ungm];
  const succeeded = all.filter((r) => r.markdown.length > 0).length;
  console.log(`  Browser scrape: ${succeeded}/${all.length} pages extracted`);
  return all;
}

export function formatBrowserResults(results: BrowserScrapeResult[]): string {
  const successful = results.filter((r) => r.markdown.length > 0);
  if (successful.length === 0) return '';

  const sections = successful.map(
    (r) => `### ${r.label}\nSource: ${r.url}\n\n${r.markdown}`
  );

  return `## Full page content from ReliefWeb and UNGM (headless browser)\n\nThese are full job/tender page bodies — read carefully for skills, scope, and deadlines.\n\n${sections.join('\n\n---\n\n')}`;
}
