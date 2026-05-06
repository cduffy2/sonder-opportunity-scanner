# Sonder Opportunity Scanner

An automated, AI-powered system that discovers grant, RFP, and consultancy opportunities aligned with [Sonder Collective's](https://sonderdesign.org) capabilities. It runs weekly via GitHub Actions, scans curated sources, and posts relevant opportunities directly to Slack.

## How it works

1. **GitHub Actions** triggers the scan on a weekly schedule (Wednesdays, 07:00 UTC) or manually
2. **Claude Sonnet** (via Anthropic API) uses web search to scan Tier 1 sources (EU Funding Portal, Gates Foundation, Wellcome Trust, Devex, UNGM, World Bank, Gavi, CEPI, PATH, JSI, CHAI, and others) plus broader Tier 2 web searches
3. Opportunities are **scored** by relevance (High / Medium / Low) based on capability and sector fit
4. **New results** are deduplicated against previously seen opportunities, filtered for active deadlines, and posted to Slack as formatted messages
5. The `seen-opportunities.json` file is automatically committed back to the repo after each run

## Project structure

```
sonder-opportunity-scanner/
├── .github/workflows/
│   └── daily-scan.yml           # Weekly GitHub Actions workflow
├── src/
│   ├── index.ts                 # Entry point — orchestrates scan, filter, post
│   ├── scanner.ts               # Claude API integration and tiered search logic
│   ├── slack.ts                 # Slack Block Kit formatting and posting
│   ├── dedup.ts                 # Tracks seen opportunities to prevent duplicates
│   └── types.ts                 # Shared TypeScript types
├── prompts/
│   └── opportunity-scanner-prompt.md  # System prompt encoding Sonder's profile and strategy
├── data/
│   ├── seen-opportunities.json        # Auto-updated dedup state
│   └── irrelevant-opportunities.json  # URLs/funders to deprioritize in future scans
├── package.json
└── tsconfig.json
```

## Setup

### Prerequisites

- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com)
- A [Slack Incoming Webhook URL](https://api.slack.com/messaging/webhooks)

### Local development

```bash
npm install
cp .env.example .env  # add your keys
npm run dev
```

### GitHub Actions deployment

Add the following secrets to your repository (Settings → Secrets → Actions):

| Secret | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |

The workflow runs automatically every Wednesday at 07:00 UTC. You can also trigger it manually from the Actions tab.

## Marking opportunities as irrelevant

To prevent a funder or URL from surfacing again, add an entry to [data/irrelevant-opportunities.json](data/irrelevant-opportunities.json). Claude will deprioritise these sources in future scans.

## Estimated cost

Roughly **$0.10–0.40 per run** (~$0.50–2/week) using Claude Sonnet with web search enabled.

## Full setup guide

See [opportunity-scanner-setup.md](opportunity-scanner-setup.md) for a detailed walkthrough including all source configuration and customisation options.
