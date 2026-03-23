import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { Opportunity } from './types';

const client = new Anthropic();

export async function scanOpportunities(): Promise<Opportunity[]> {
  const systemPrompt = fs.readFileSync(
    path.join(__dirname, '../prompts/opportunity-scanner-prompt.md'),
    'utf-8'
  );

  const today = new Date().toISOString().split('T')[0];

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Today is ${today}. Please run the full opportunity scan and return results as a JSON array. Only include opportunities that are currently open or upcoming — not expired.`,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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
