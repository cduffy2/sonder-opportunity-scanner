import { Opportunity } from './types';

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!;

const WIN_EMOJI: Record<string, string> = {
  High: '🟢',
  Medium: '🟡',
  Low: '⚫️',
};

export async function postOpportunity(opp: Opportunity): Promise<void> {
  const emoji = WIN_EMOJI[opp.win_probability] ?? '⚪';
  const sectors = opp.sectors.join(', ');

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${opp.opportunity_title}`.slice(0, 150),
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Funder*\n${opp.funder_name}` },
        { type: 'mrkdwn', text: `*Type*\n${opp.type}` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Deadline*\n${opp.deadline}` },
        { type: 'mrkdwn', text: `*Amount*\n${opp.amount}` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Relevance*\n${emoji} ${opp.win_probability}` },
        { type: 'mrkdwn', text: `*Geography*\n${opp.geographic_focus}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Sectors:* ${sectors}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Why it fits:* ${opp.fit_rationale.slice(0, 2900)}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Relevance rationale:* ${opp.win_rationale.slice(0, 2900)}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Next steps:* ${opp.next_steps.slice(0, 2900)}` },
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
