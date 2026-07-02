import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { Opportunity } from './types';
import { scrapeAllTier1Sources, formatScrapedContent, runLinkedInAndRFPSearches, formatSearchResults } from './firecrawl';
import { scrapeWithBrowser, formatBrowserResults } from './browser';
import { fetchAllRssFeeds, formatRssContent } from './rss';

const client = new Anthropic();

function loadIrrelevantContext(): string {
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, '../data/irrelevant-opportunities.json'),
      'utf-8'
    );
    const data = JSON.parse(raw) as { urls: string[]; funders: string[] };
    const parts: string[] = [];
    if (data.funders?.length) {
      parts.push(`Deprioritise or exclude these funders/organisations (previously marked irrelevant): ${data.funders.join(', ')}.`);
    }
    if (data.urls?.length) {
      parts.push(`Do not include opportunities from these URLs (previously seen and marked irrelevant): ${data.urls.join(', ')}.`);
    }
    return parts.length ? `\n\n## Feedback from previous scans\n${parts.join('\n')}` : '';
  } catch {
    return '';
  }
}

export async function scanOpportunities(): Promise<Opportunity[]> {
  const basePrompt = fs.readFileSync(
    path.join(__dirname, '../prompts/opportunity-scanner-prompt.md'),
    'utf-8'
  );
  const systemPrompt = basePrompt + loadIrrelevantContext();

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const year = now.getFullYear();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Pre-scrape Tier 1 sources, run LinkedIn/RFP searches, browser-scrape JS-heavy sources, and fetch RSS feeds in parallel
  const [scrapeResults, searchResults, browserResults, rssResults] = await Promise.all([
    scrapeAllTier1Sources(),
    runLinkedInAndRFPSearches(),
    scrapeWithBrowser(),
    fetchAllRssFeeds(),
  ]);

  const scrapedContent = formatScrapedContent(scrapeResults);
  const searchContent = formatSearchResults(searchResults);
  const browserContent = formatBrowserResults(browserResults);
  const rssContent = formatRssContent(rssResults);

  const failedScrapes = scrapeResults.filter((r) => r.markdown.length === 0);
  if (failedScrapes.length > 0) {
    console.log(`  Failed scrapes (will rely on web_search): ${failedScrapes.map((r) => r.label).join(', ')}`);
  }

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Today is ${today} (year: ${year}). Please run the full opportunity scan and return results as a JSON array.

Requirements:
- Only include opportunities that are currently open or upcoming — not expired or already awarded.
- Prioritise opportunities posted or updated after ${twoWeeksAgo} (within the last 14 days). Only include older opportunities if they are still clearly open and highly relevant.
- The current year is ${year}. Pre-run search results are included below — analyse them directly.
- Return up to 10 opportunities. If the scraped and search content contains fewer than 3 strong matches, return what genuinely exists — do not invent or include expired opportunities to pad results.

${scrapedContent}

${browserContent}

${searchContent}

${rssContent}`,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  // Extract text content from the response
  const textBlocks = response.content.filter((b) => b.type === 'text');
  let rawText = textBlocks.map((b) => (b as { type: 'text'; text: string }).text).join('');

  // If response was cut off (stop_reason === 'max_tokens'), ask for continuation
  if (response.stop_reason === 'max_tokens') {
    console.log('Response truncated, requesting continuation...');
    const continuation = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: 'Please complete the JSON array from where you left off. Output only the remaining JSON, starting from where it was cut.' },
      ],
    });
    const contBlocks = continuation.content.filter((b) => b.type === 'text');
    rawText += contBlocks.map((b) => (b as { type: 'text'; text: string }).text).join('');
  }

  // Strip any accidental markdown fences and parse
  const cleaned = rawText.replace(/```json\n?|```/g, '').trim();
  const jsonStart = cleaned.indexOf('[');
  const jsonEnd = cleaned.lastIndexOf(']') + 1;
  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error(`No JSON array found in response. Raw text:\n${rawText.slice(0, 500)}`);
  }
  const jsonStr = cleaned.slice(jsonStart, jsonEnd);

  return JSON.parse(jsonStr) as Opportunity[];
}
