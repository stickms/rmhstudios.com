/**
 * Shared AI text utilities (compose assist, translation, "ask the feed").
 * Reuses the configured DeepSeek key. Server-only.
 */

import OpenAI from 'openai';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'missing',
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 1,
});
const MODEL = process.env.RMHARK_AI_MODEL || 'deepseek-chat';

export function isAITextConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

async function chat(system: string, user: string, maxTokens: number, temperature = 0.6): Promise<string> {
  const res = await deepseek.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature,
    stream: false,
  });
  return res.choices[0]?.message?.content?.trim() ?? '';
}

export type ComposeAction = 'improve' | 'expand' | 'shorten' | 'casual' | 'formal' | 'fix';

const ACTION_PROMPTS: Record<ComposeAction, string> = {
  improve: 'Rewrite the text to be clearer and more engaging while keeping the meaning and roughly the same length.',
  expand: 'Expand the text with a bit more detail, keeping the same voice. Stay under 280 characters.',
  shorten: 'Make the text more concise while keeping the key point. Stay well under 280 characters.',
  casual: 'Rewrite the text in a casual, friendly tone.',
  formal: 'Rewrite the text in a more polished, professional tone.',
  fix: 'Fix spelling, grammar, and punctuation only. Do not change the meaning or tone.',
};

/** Compose-assist transform on a draft post/comment. Returns just the rewritten text. */
export async function transformText(text: string, action: ComposeAction): Promise<string> {
  const out = await chat(
    `You are a writing assistant for a social platform. ${ACTION_PROMPTS[action]} Output ONLY the rewritten text — no quotes, no preamble, no explanation.`,
    text,
    300,
    0.7
  );
  return out.replace(/^["']|["']$/g, '').trim();
}

/** Translate text to the given language name (e.g. "English", "Spanish"). */
export async function translateText(text: string, target: string): Promise<string> {
  return chat(
    `Translate the user's text into ${target}. Output ONLY the translation, preserving tone, emojis, @mentions, and #hashtags. If it is already in ${target}, return it unchanged.`,
    text,
    400,
    0.2
  );
}

/** Answer a question grounded in a set of recent posts. */
export async function askFeed(question: string, posts: { author: string; content: string }[]): Promise<string> {
  const context = posts.slice(0, 60).map((p, i) => `[${i + 1}] ${p.author}: ${p.content}`).join('\n');
  return chat(
    'You answer questions about what people are discussing on a social feed, using ONLY the provided posts as evidence. Be concise (3-5 sentences). If the posts do not contain enough to answer, say so plainly. Do not invent facts.',
    `Posts:\n${context}\n\nQuestion: ${question}`,
    320,
    0.4
  );
}
