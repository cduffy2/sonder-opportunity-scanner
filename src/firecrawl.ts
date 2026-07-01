import FirecrawlApp from '@mendable/firecrawl-js';

const client = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });

const LINKEDIN_SEARCH_QUERIES = [
  'site:linkedin.com "request for proposals" OR "terms of reference" "design" OR "UX" OR "researcher" "consultant" "global health" OR "social impact" OR "nonprofit"',
  'site:linkedin.com "individual consultant" OR "small team" "design" OR "UX" OR "user research" "NGO" OR "nonprofit" OR "social impact"',
  'site:linkedin.com "invitation to quote" OR "ITQ" OR "request for quotation" "design" OR "research" OR "digital" "social" OR "health" OR "development"',
  'site:linkedin.com "call for applications" OR "open call" "consultant" OR "consultancy" "design" OR "research" OR "strategy" "impact" OR "wellbeing" OR "health"',
  'site:linkedin.com "RFP" "UX" OR "design" OR "human-centred" OR "human-centered" "global health" OR "humanitarian" OR "international development"',
];

const RFP_SEARCH_QUERIES = [
  '"request for proposals" "individual consultant" OR "small team" "UX" OR "design" OR "user research" "global health" OR "nonprofit" OR "NGO" 2026',
  '"terms of reference" "consultant" "digital" OR "design" OR "research" "social impact" OR "wellbeing" OR "community" 2026',
  'site:fundsforngos.org "request for proposals" OR "consultancy" OR "terms of reference" design OR research OR digital',
  'site:impactpool.org "consultant" "design" OR "UX" OR "research" OR "digital"',
  'site:developmentaid.org "consultant" "design" OR "UX" OR "research" OR "digital"',
  'site:reliefweb.int "design" OR "UX" OR "research" OR "digital health" OR "information systems" 2026',
  'site:reliefweb.int "call for bids" OR "request for proposals" OR "tender" 2026',
  'site:ungm.org "design" OR "UX" OR "research" OR "digital" OR "health information" 2026',
];

// All Tier 1 sources to scrape directly each run
const TIER1_SOURCES = [
  // Tier 1a — Grants and funding
  { label: 'Research Ireland', url: 'https://researchireland.ie/funding/' },
  { label: 'Irish Research Council', url: 'https://research.ie/funding-news/opportunities/' },
  { label: 'Science Foundation Ireland', url: 'https://www.sfi.ie/funding/funding-calls/open-calls/' },
  { label: 'UKRI Opportunities', url: 'https://www.ukri.org/opportunity/' },
  { label: 'Innovate UK', url: 'https://apply-for-innovation-funding.service.gov.uk/competition/search' },
  { label: 'NWO Open Calls', url: 'https://www.nwo.nl/en/calls' },
  { label: 'Academy of Finland', url: 'https://www.aka.fi/en/funding/calls-for-applications/' },
  { label: 'Gates Foundation Grand Challenges', url: 'https://gcgh.grandchallenges.org/challenges' },
  { label: 'Wellcome Trust Grants', url: 'https://wellcome.org/grant-funding/schemes' },
  { label: 'Global Innovation Fund', url: 'https://www.globalinnovation.fund/apply/' },
  { label: 'Luminate', url: 'https://luminategroup.com/funding' },
  { label: 'Open Society Foundations', url: 'https://www.opensocietyfoundations.org/grants' },
  { label: 'Echoing Green', url: 'https://echoinggreen.org/fellowship/' },
  { label: 'Skoll Foundation', url: 'https://skoll.org/skoll-foundation/grant-making/' },
  // Tier 1b — Consultancy, RFP, and tenders
  { label: 'Design Gigs for Good', url: 'https://www.designgigsforgood.com/' },
  { label: 'Sustainable Ocean Alliance', url: 'https://sustainableocean.com/programs/' },
  { label: 'PATH Procurement', url: 'https://www.path.org/our-work/procurement/' },
  { label: 'Gavi Procurement', url: 'https://www.gavi.org/programme-support/procurement' },
  { label: 'Funds for NGOs', url: 'https://www.fundsforngos.org/category/requests-for-proposals/' },
  { label: 'EU TED Tenders', url: 'https://ted.europa.eu/en/search/result?query=design+OR+research+OR+UX&scope=ACTIVE' },
  { label: 'UNDP Procurement Notices', url: 'https://procurement-notices.undp.org/' },
  { label: 'Contracts Finder UK', url: 'https://www.contractsfinder.service.gov.uk/Search/Results' },
];

export interface ScrapeResult {
  label: string;
  url: string;
  markdown: string;
  error?: string;
}

export interface SearchResult {
  query: string;
  hits: Array<{ url: string; title: string; description: string }>;
}

async function scrapeOne(label: string, url: string): Promise<ScrapeResult> {
  try {
    const result = await client.scrapeUrl(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    });

    if (!result.markdown) {
      return { label, url, markdown: '', error: 'No content returned' };
    }

    // Truncate to keep context manageable (~2000 chars per source)
    const markdown = result.markdown.slice(0, 2000);
    return { label, url, markdown };
  } catch (err) {
    return { label, url, markdown: '', error: String(err) };
  }
}

export async function scrapeAllTier1Sources(): Promise<ScrapeResult[]> {
  console.log(`Scraping ${TIER1_SOURCES.length} Tier 1 sources via Firecrawl...`);

  // Scrape in parallel batches of 5 to avoid rate limiting
  const results: ScrapeResult[] = [];
  const batchSize = 5;

  for (let i = 0; i < TIER1_SOURCES.length; i += batchSize) {
    const batch = TIER1_SOURCES.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(({ label, url }) => scrapeOne(label, url))
    );
    results.push(...batchResults);

    const succeeded = batchResults.filter((r) => r.markdown.length > 0).length;
    console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${succeeded}/${batch.length} scraped successfully`);

    // Brief pause between batches
    if (i + batchSize < TIER1_SOURCES.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}

export function formatScrapedContent(results: ScrapeResult[]): string {
  const successful = results.filter((r) => r.markdown.length > 0);
  if (successful.length === 0) return '';

  const sections = successful.map(
    (r) => `### ${r.label}\nSource: ${r.url}\n\n${r.markdown}`
  );

  return `## Live content scraped from Tier 1 sources\n\nThe following is real page content scraped directly from each source. Extract opportunities from this content first, then supplement with web search.\n\n${sections.join('\n\n---\n\n')}`;
}

async function runSearch(query: string): Promise<SearchResult> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit: 8 }),
    });
    if (!res.ok) {
      console.log(`  Search HTTP ${res.status} for query "${query.slice(0, 60)}..."`);
      return { query, hits: [] };
    }
    const json = await res.json() as any;
    const items: any[] = json?.data ?? json?.web ?? [];
    const hits = items.map((item: any) => ({
      url: item.url ?? '',
      title: item.title ?? '',
      description: (item.description ?? '').slice(0, 150),
    }));
    return { query, hits };
  } catch (err) {
    console.log(`  Search failed: ${String(err).slice(0, 120)}`);
    return { query, hits: [] };
  }
}

export async function runLinkedInAndRFPSearches(): Promise<SearchResult[]> {
  const allQueries = [...LINKEDIN_SEARCH_QUERIES, ...RFP_SEARCH_QUERIES];
  console.log(`Running ${allQueries.length} LinkedIn/RFP searches via Firecrawl...`);

  // Run in parallel batches of 5
  const results: SearchResult[] = [];
  const batchSize = 5;

  for (let i = 0; i < allQueries.length; i += batchSize) {
    const batch = allQueries.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(runSearch));
    results.push(...batchResults);

    const totalHits = batchResults.reduce((sum, r) => sum + r.hits.length, 0);
    console.log(`  Search batch ${Math.floor(i / batchSize) + 1}: ${totalHits} results`);

    if (i + batchSize < allQueries.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

export function formatSearchResults(results: SearchResult[]): string {
  const withHits = results.filter((r) => r.hits.length > 0);
  if (withHits.length === 0) return '';

  const sections = withHits.map((r) => {
    const hits = r.hits
      .map((h) => `- **${h.title}**\n  ${h.url}\n  ${h.description}`)
      .join('\n');
    return hits;
  });

  return `## LinkedIn and web search results for small RFPs and consultancy calls\n\nThese are indexed posts and pages found via targeted search. Many are individual consultant or small-team RFPs posted on LinkedIn and sector job boards. Extract any that match Sonder's profile.\n\n${sections.join('\n\n')}`;
}
