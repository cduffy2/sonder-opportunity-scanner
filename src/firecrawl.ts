import FirecrawlApp from '@mendable/firecrawl-js';

const client = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });

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
  { label: 'UN Global Marketplace', url: 'https://www.ungm.org/Public/Notice' },
  { label: 'ReliefWeb Tenders', url: 'https://reliefweb.int/jobs?type%5B%5D=1068&type%5B%5D=1071' },
  { label: 'Design Gigs for Good', url: 'https://www.designgigsforgood.com/' },
  { label: 'Sustainable Ocean Alliance', url: 'https://sustainableocean.com/programs/' },
  { label: 'PATH Procurement', url: 'https://www.path.org/our-work/procurement/' },
  { label: 'Gavi Procurement', url: 'https://www.gavi.org/programme-support/procurement' },
];

export interface ScrapeResult {
  label: string;
  url: string;
  markdown: string;
  error?: string;
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

    // Truncate to keep context manageable (~4000 chars per source)
    const markdown = result.markdown.slice(0, 4000);
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
