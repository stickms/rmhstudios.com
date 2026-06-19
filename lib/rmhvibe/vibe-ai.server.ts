/**
 * RMHVibe — server-side AI proxy for generated apps.
 *
 * Generated vibe pages run in a locked-down sandboxed iframe and must never see
 * an API key. This module lets them use a real LLM (DeepSeek) WITHOUT exposing
 * the key: the page calls our same-site proxy endpoint (see app/routes/api/vibe/
 * ai.ts and the injected `window.RMHVibeAI` helper in vibe-bundle.server.ts),
 * and the server forwards the request to DeepSeek using the server-only
 * DEEPSEEK_API_KEY. The key stays on the server; only chat completions cross the
 * wire.
 *
 * Because the proxy is reachable by anyone viewing a (public) vibe page, every
 * request is hard-capped here — fixed cheap model, bounded history, bounded
 * input, bounded output — and rate-limited at the route. This is deliberately a
 * narrow "chat completion" surface: no tool-calling, no arbitrary params, no
 * client-chosen model.
 *
 * Server-only (`.server.ts`) — reads process.env.
 */

import OpenAI from 'openai';

// Reuse the existing DeepSeek key already configured for the discord bot and the
// vibe generator. Never sent to the client.
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 1,
});

// Fixed, cheap, fast chat model. Locked server-side so a page can't pin an
// expensive model. Override via env only if DeepSeek's model id changes.
const VIBE_AI_MODEL = process.env.VIBE_AI_MODEL || 'deepseek-chat';

// Hard limits — the proxy is public-facing (any page visitor can hit it), so a
// single request can never run away. Tune conservatively.
const MAX_MESSAGES = 40; // conversation turns sent per request
const MAX_TOTAL_CHARS = 24_000; // summed length of all message content
const MAX_OUTPUT_TOKENS = 1024; // completion length cap

export type VibeChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class VibeAIError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Validate + clamp an untrusted request body from a generated page into a clean
 * message list. Throws VibeAIError (with an HTTP status) on anything malformed
 * or oversized.
 */
export function parseChatRequest(body: unknown): {
  messages: VibeChatMessage[];
  stream: boolean;
} {
  if (!body || typeof body !== 'object') throw new VibeAIError('Invalid request body');
  const b = body as { messages?: unknown; system?: unknown; stream?: unknown };

  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    throw new VibeAIError('`messages` must be a non-empty array');
  }
  if (b.messages.length > MAX_MESSAGES) {
    throw new VibeAIError(`Too many messages (max ${MAX_MESSAGES})`);
  }

  const messages: VibeChatMessage[] = [];

  // Optional leading system prompt supplied separately by the page.
  if (typeof b.system === 'string' && b.system.trim()) {
    messages.push({ role: 'system', content: b.system.trim() });
  }

  let total = messages.reduce((n, m) => n + m.content.length, 0);
  for (const raw of b.messages) {
    if (!raw || typeof raw !== 'object') throw new VibeAIError('Each message must be an object');
    const m = raw as { role?: unknown; content?: unknown };
    const role =
      m.role === 'system' || m.role === 'assistant' ? m.role : ('user' as const);
    const content = typeof m.content === 'string' ? m.content : '';
    if (!content) continue;
    total += content.length;
    if (total > MAX_TOTAL_CHARS) {
      throw new VibeAIError(`Conversation too long (max ${MAX_TOTAL_CHARS} characters)`);
    }
    messages.push({ role, content });
  }

  if (messages.every((m) => m.role === 'system')) {
    throw new VibeAIError('No user/assistant message provided');
  }

  return { messages, stream: b.stream === true };
}

/** One-shot completion. Returns the assistant's reply text. */
export async function vibeChat(messages: VibeChatMessage[]): Promise<string> {
  const res = await deepseek.chat.completions.create({
    model: VIBE_AI_MODEL,
    messages,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
  });
  return res.choices[0]?.message?.content ?? '';
}

/** Streamed completion. Yields text deltas as they arrive. */
export async function* vibeChatStream(
  messages: VibeChatMessage[],
): AsyncGenerator<string> {
  const stream = await deepseek.chat.completions.create({
    model: VIBE_AI_MODEL,
    messages,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: true,
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
