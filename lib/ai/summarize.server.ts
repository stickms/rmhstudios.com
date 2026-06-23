/**
 * AI thread summaries — condense a post's comment thread into a few lines.
 *
 * Reuses the same server-only DeepSeek key already configured for RMHark AI /
 * RMHVibe / the Discord bot. Server-only; never reaches the client.
 */

import OpenAI from 'openai';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'missing',
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 1,
});

const MODEL = process.env.RMHARK_AI_MODEL || 'deepseek-chat';

export function isSummarizerConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export interface ThreadForSummary {
  post: { author: string; content: string };
  comments: { author: string; content: string }[];
}

/**
 * Summarize a thread into 2–4 short bullet-style lines. Returns null if the AI
 * is unavailable or the thread is too small to be worth summarizing.
 */
export async function summarizeThread(thread: ThreadForSummary): Promise<string | null> {
  if (!isSummarizerConfigured()) return null;
  if (thread.comments.length < 3) return null;

  const transcript = [
    `POST by ${thread.post.author}: ${thread.post.content}`,
    ...thread.comments.slice(0, 80).map((c) => `- ${c.author}: ${c.content}`),
  ].join('\n');

  const res = await deepseek.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You summarize social media comment threads. Produce 2-4 concise bullet points capturing the main discussion points, disagreements, and overall sentiment. Be neutral and factual. Do not add commentary, headers, or a preamble. Each bullet starts with "• ".',
      },
      { role: 'user', content: `Summarize this thread:\n\n${transcript}` },
    ],
    max_tokens: 220,
    temperature: 0.4,
    stream: false,
  });

  const text = res.choices[0]?.message?.content?.trim();
  return text || null;
}
