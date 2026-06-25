import 'dotenv/config';
import { scanOpportunities } from './scanner';
import { postOpportunity, postSummaryHeader } from './slack';
import { loadSeen, saveSeen } from './dedup';

async function main() {
  console.log('Starting opportunity scan...');

  const seen = loadSeen();
  const opportunities = await scanOpportunities();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeOpps = opportunities.filter((o) => {
    if (o.deadline === 'Rolling' || o.deadline === 'Unknown') return true;
    const d = new Date(o.deadline);
    if (isNaN(d.getTime())) return true; // unparseable — let it through
    if (d < today) {
      console.log(`Filtered out expired opportunity: "${o.opportunity_title}" (deadline: ${o.deadline})`);
      return false;
    }
    return true;
  });

  const newOpps = activeOpps.filter((o) => !seen.has(o.link));
  console.log(`Found ${opportunities.length} total, ${newOpps.length} new.`);

  if (newOpps.length === 0) {
    console.log('No new opportunities. Exiting.');
    return;
  }

  // Sort: High first, then Medium, then Low
  const order = { High: 0, Medium: 1, Low: 2 };
  newOpps.sort((a, b) => (order[a.win_probability] ?? 3) - (order[b.win_probability] ?? 3));

  // Print results to console
  newOpps.forEach((opp, i) => {
    console.log(`\n--- ${i + 1}. ${opp.opportunity_title} ---`);
    console.log(`Funder: ${opp.funder_name} | Type: ${opp.type} | Deadline: ${opp.deadline}`);
    console.log(`Amount: ${opp.amount} | Relevance: ${opp.win_probability}`);
    console.log(`Fit: ${opp.fit_rationale}`);
    console.log(`Next steps: ${opp.next_steps}`);
    console.log(`Link: ${opp.link}`);
  });

  const threadTs = await postSummaryHeader(newOpps.length);

  for (const opp of newOpps) {
    await postOpportunity(opp, threadTs);
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
