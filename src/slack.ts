import { Opportunity } from './types';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN!;
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID!;

const WIN_EMOJI: Record<string, string> = {
  High: '🟢',
  Medium: '🟡',
  Low: '⚫️',
};

async function slackPost(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: CHANNEL_ID, ...payload }),
  });

  const json = await res.json() as any;
  if (!json.ok) throw new Error(`Slack API error: ${json.error}`);
  return json;
}

export async function postSummaryHeader(count: number): Promise<string> {
  const json = await slackPost({
    text: `🔍 *${count} new opportunit${count === 1 ? 'y' : 'ies'} this week*\nSome may not be a direct fit for Sonder, but could be a reason to reconnect with a former client or colleague. Review in the thread below.`,
  });
  return json.ts as string;
}

export async function postOpportunity(opp: Opportunity, threadTs: string): Promise<void> {
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

  await slackPost({ blocks, thread_ts: threadTs });
}
