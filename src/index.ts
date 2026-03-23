import 'dotenv/config';
import { scanOpportunities } from './scanner';
import { postOpportunity, postSummaryHeader } from './slack';
import { loadSeen, saveSeen } from './dedup';

async function main() {
  console.log('Starting opportunity scan...');

  const seen = loadSeen();
  const opportunities = await scanOpportunities();

  const newOpps = opportunities.filter((o) => !seen.has(o.link));
  console.log(`Found ${opportunities.length} total, ${newOpps.length} new.`);

  if (newOpps.length === 0) {
    console.log('No new opportunities. Exiting.');
    return;
  }

  // Sort: High first, then Medium, then Low
  const order = { High: 0, Medium: 1, Low: 2 };
  newOpps.sort((a, b) => (order[a.win_probability] ?? 3) - (order[b.win_probability] ?? 3));

  await postSummaryHeader(newOpps.length);

  for (const opp of newOpps) {
    await postOpportunity(opp);
    seen.add(opp.link);
    // Small delay to avoid rate-limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  saveSeen(seen);
  console.log('Scan complete.');
}

main().catch((err) => {
  console.error('Scan failed:', err);
  process.exit(1);
});
