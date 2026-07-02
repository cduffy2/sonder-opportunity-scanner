const RSS_FEEDS: Array<{ label: string; url: string; note: string }> = [];

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

interface FeedResult {
  label: string;
  note: string;
  items: RssItem[];
  error?: string;
}

function parseItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? '';
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? '';
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    const description = (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() ?? '').slice(0, 300);
    if (title && link) items.push({ title, link, pubDate, description });
  }

  return items;
}

async function fetchFeed(label: string, url: string, note: string): Promise<FeedResult> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'SonderOpportunityScanner/1.0' } });
    if (!res.ok) return { label, note, items: [], error: `HTTP ${res.status}` };
    const xml = await res.text();
    const items = parseItems(xml);
    return { label, note, items };
  } catch (err) {
    return { label, note, items: [], error: String(err) };
  }
}

export async function fetchAllRssFeeds(): Promise<FeedResult[]> {
  console.log(`Fetching ${RSS_FEEDS.length} RSS feed(s)...`);
  const results = await Promise.all(
    RSS_FEEDS.map(({ label, url, note }) => fetchFeed(label, url, note))
  );
  results.forEach((r) => {
    if (r.error) console.log(`  RSS error (${r.label}): ${r.error}`);
    else console.log(`  ${r.label}: ${r.items.length} items`);
  });
  return results;
}

export function formatRssContent(results: FeedResult[]): string {
  const successful = results.filter((r) => r.items.length > 0);
  if (successful.length === 0) return '';

  const sections = successful.map((r) => {
    const items = r.items
      .map((item) => `- **${item.title}** (${item.pubDate})\n  ${item.link}\n  ${item.description}`)
      .join('\n');
    return `### ${r.label}\nNote: ${r.note}\n\n${items}`;
  });

  return `## RSS feed content\n\n${sections.join('\n\n---\n\n')}`;
}
