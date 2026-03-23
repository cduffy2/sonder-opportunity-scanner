# Sonder Opportunity Scanner — Setup Guide

A daily automated scanner that finds work opportunities for Sonder Collective and posts them to Slack. Runs on GitHub Actions (free), uses Claude API with web search, and posts one Slack message per opportunity.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Familiar with your React/Node stack |
| Runtime | Node.js 20 | Native fetch, good TS support |
| AI | Claude API + web search tool | Powers the scanning and scoring |
| Scheduler | GitHub Actions cron | Free, zero infrastructure |
| Notifications | Slack Incoming Webhooks | Simple, no Slack app required |
| Deduplication | `seen.json` committed back to repo | Transparent, version-controlled |

---

## Project Structure

```
sonder-opportunity-scanner/
├── .github/
│   └── workflows/
│       └── daily-scan.yml        # Cron job definition
├── src/
│   ├── index.ts                  # Entry point
│   ├── scanner.ts                # Claude API call + web search
│   ├── slack.ts                  # Slack Block Kit posting
│   ├── dedup.ts                  # Seen-opportunity tracking
│   └── types.ts                  # Shared TypeScript types
├── prompts/
│   └── opportunity-scanner.md    # The system prompt (paste from prompt file)
├── data/
│   └── seen-opportunities.json   # Auto-updated, committed by Actions
├── .env.example                  # Template for local dev
├── package.json
├── tsconfig.json
└── README.md
```

---

## Step 1: Create the GitHub Repository

1. Go to github.com and create a new **private** repository called `sonder-opportunity-scanner`
2. Clone it locally:
   ```bash
   git clone https://github.com/YOUR_ORG/sonder-opportunity-scanner.git
   cd sonder-opportunity-scanner
   ```
3. Open in VS Code:
   ```bash
   code .
   ```

---

## Step 2: Initialise the Project

```bash
npm init -y
npm install @anthropic-ai/sdk dotenv
npm install --save-dev typescript @types/node ts-node
npx tsc --init
```

Update `tsconfig.json` — replace the generated file with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Update `package.json` scripts:

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "ts-node src/index.ts"
}
```

---

## Step 3: Create the Source Files

### `src/types.ts`

```typescript
export interface Opportunity {
  funder_name: string;
  opportunity_title: string;
  type: string;
  deadline: string;
  amount: string;
  link: string;
  geographic_focus: string;
  sectors: string[];
  win_probability: 'High' | 'Medium' | 'Low';
  win_rationale: string;
  fit_rationale: string;
  next_steps: string;
  posted_date: string;
}
```

### `src/dedup.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

const SEEN_PATH = path.join(__dirname, '../data/seen-opportunities.json');

export function loadSeen(): Set<string> {
  try {
    const raw = fs.readFileSync(SEEN_PATH, 'utf-8');
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function saveSeen(seen: Set<string>): void {
  fs.mkdirSync(path.dirname(SEEN_PATH), { recursive: true });
  fs.writeFileSync(SEEN_PATH, JSON.stringify([...seen], null, 2));
}
```

### `src/scanner.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { Opportunity } from './types';

const client = new Anthropic();

export async function scanOpportunities(): Promise<Opportunity[]> {
  const systemPrompt = fs.readFileSync(
    path.join(__dirname, '../prompts/opportunity-scanner.md'),
    'utf-8'
  );

  const today = new Date().toISOString().split('T')[0];

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Please run the full opportunity scan and return results as a JSON array. Only include opportunities that are currently open or upcoming — not expired.`,
      },
    ],
  });

  // Extract text content from the response
  const textBlocks = response.content.filter((b) => b.type === 'text');
  const rawText = textBlocks.map((b) => (b as { type: 'text'; text: string }).text).join('');

  // Strip any accidental markdown fences and parse
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const jsonStart = cleaned.indexOf('[');
  const jsonEnd = cleaned.lastIndexOf(']') + 1;
  const jsonStr = cleaned.slice(jsonStart, jsonEnd);

  return JSON.parse(jsonStr) as Opportunity[];
}
```

### `src/slack.ts`

```typescript
import { Opportunity } from './types';

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!;

const WIN_EMOJI: Record<string, string> = {
  High: '🟢',
  Medium: '🟡',
  Low: '🔴',
};

export async function postOpportunity(opp: Opportunity): Promise<void> {
  const emoji = WIN_EMOJI[opp.win_probability] ?? '⚪';
  const sectors = opp.sectors.join(', ');

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${opp.opportunity_title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Funder*\n${opp.funder_name}` },
        { type: 'mrkdwn', text: `*Type*\n${opp.type}` },
        { type: 'mrkdwn', text: `*Deadline*\n${opp.deadline}` },
        { type: 'mrkdwn', text: `*Amount*\n${opp.amount}` },
        { type: 'mrkdwn', text: `*Win Probability*\n${emoji} ${opp.win_probability}` },
        { type: 'mrkdwn', text: `*Geography*\n${opp.geographic_focus}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Sectors:* ${sectors}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Why it fits:* ${opp.fit_rationale}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Win rationale:* ${opp.win_rationale}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Next steps:* ${opp.next_steps}` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Opportunity', emoji: true },
          url: opp.link,
          style: 'primary',
        },
      ],
    },
    { type: 'divider' },
  ];

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
  }
}

export async function postSummaryHeader(count: number): Promise<void> {
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `*🔭 Sonder Opportunity Scan — ${today}*\n${count} new opportunit${count === 1 ? 'y' : 'ies'} found.`,
    }),
  });
}
```

### `src/index.ts`

```typescript
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
```

---

## Step 4: Initialise the Data File

Create `data/seen-opportunities.json`:

```json
[]
```

Create `.env.example`:

```
ANTHROPIC_API_KEY=your_key_here
SLACK_WEBHOOK_URL=your_webhook_url_here
```

Create `.env` (never commit this):

```
ANTHROPIC_API_KEY=sk-ant-...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Add to `.gitignore`:

```
node_modules/
dist/
.env
```

---

## Step 5: Create the GitHub Actions Workflow

Create `.github/workflows/daily-scan.yml`:

```yaml
name: Daily Opportunity Scan

on:
  schedule:
    - cron: '0 7 * * 1-5'   # 07:00 UTC, Monday–Friday
  workflow_dispatch:          # Allow manual trigger from GitHub UI

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: write         # Needed to commit seen-opportunities.json

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Run opportunity scan
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: npm start

      - name: Commit updated seen-opportunities.json
        run: |
          git config user.name "opportunity-scanner[bot]"
          git config user.email "bot@sonder.noreply"
          git add data/seen-opportunities.json
          git diff --staged --quiet || git commit -m "chore: update seen opportunities [skip ci]"
          git push
```

---

## Step 6: Add GitHub Secrets

1. Go to your repo on GitHub
2. Settings → Secrets and variables → Actions → New repository secret
3. Add:
   - `ANTHROPIC_API_KEY` — your Anthropic API key
   - `SLACK_WEBHOOK_URL` — from the next step

---

## Step 7: Create the Slack Webhook

1. Go to api.slack.com/apps → Create New App → From scratch
2. Name it "Opportunity Scanner", pick your Sonder workspace
3. Incoming Webhooks → Activate → Add New Webhook to Workspace
4. Pick the channel (e.g. `#opportunities` or `#bd`)
5. Copy the webhook URL and add it as a GitHub secret

---

## Step 8: Test Locally

```bash
npm run dev
```

You should see opportunities logged and posted to Slack. If it works locally, push to GitHub and trigger a manual run via Actions → daily-scan → Run workflow.

---

## Maintenance Notes

- **Prompt tuning:** edit `prompts/opportunity-scanner.md` and commit — no code changes needed
- **Change schedule:** edit the cron expression in the workflow YAML
- **Reset dedup:** clear `data/seen-opportunities.json` to `[]` and commit
- **Add sources:** add new Tier 1 sources to the prompt's source table
- **Cost:** each daily run uses roughly 1–3 Claude API calls with web search enabled. Estimate ~$0.10–0.40/day depending on results volume.
