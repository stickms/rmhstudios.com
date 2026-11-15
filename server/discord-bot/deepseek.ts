/**
 * Alex's DeepSeek client (port of discordbot/deepseek.go).
 *
 * A plain fetch against the OpenAI-compatible endpoint rather than the `openai` SDK the web tier
 * uses, because the bot needs exactly the Go client's behaviour: the shared retry policy (429/5xx
 * retried with Retry-After honoured, other 4xx permanent), sampling knobs omitted when unset, and
 * a hard per-attempt timeout. It goes through `timedAiFetch` so the calls land in the same
 * `llm.latency|deepseek:chat` metric as every other model call on the site.
 */
import { timedAiFetch } from '../../lib/ai/timed-fetch.server';
import {
  RETRY_API,
  parseRetryAfter,
  permanent,
  retryAfter,
  retryableStatus,
  withRetry,
  type RetryLogger,
} from './retry';

export const ROLE_SYSTEM = 'system';
export const ROLE_USER = 'user';
export const ROLE_ASSISTANT = 'assistant';

/** One chat turn; doubles as the persisted /chat history row. */
export interface ChatMessage {
  role: string;
  content: string;
}

/** Per-call sampling; an unset temperature is the conversational default. */
export interface ChatOptions {
  temperature?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  signal?: AbortSignal;
  /** Per-call deadline (ms) across all attempts; the Go call sites used context timeouts. */
  timeoutMs?: number;
}

/** DeepSeek's guidance for conversation; the API default (1.0) makes Alex repetitive. */
export const CONVERSATIONAL_TEMPERATURE = 1.3;

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const ATTEMPT_TIMEOUT_MS = 60_000;

export class DeepSeekClient {
  readonly model: string;
  private readonly baseURL: string;

  constructor(
    private readonly apiKey: string,
    model: string,
    private readonly logger: RetryLogger | null = null,
    private readonly fetchImpl: typeof fetch = timedAiFetch,
  ) {
    this.model = model || 'deepseek-chat';
    // Same override the web tier honours, so a dev/CI stand-in can replace the real API.
    this.baseURL = (process.env.DEEPSEEK_BASE_URL || DEEPSEEK_BASE_URL).replace(/\/v1\/?$/, '').replace(/\/$/, '');
  }

  configured(): boolean {
    return this.apiKey !== '';
  }

  chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    return this.chatWith(messages, opts);
  }

  async chatWith(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    if (!this.apiKey) throw new Error('DEEPSEEK_API_KEY is not set');
    const signals: AbortSignal[] = [];
    if (opts.signal) signals.push(opts.signal);
    if (opts.timeoutMs) signals.push(AbortSignal.timeout(opts.timeoutMs));
    const signal = signals.length ? AbortSignal.any(signals) : undefined;
    return withRetry('deepseek.chat', RETRY_API, (s) => this.chatOnce(messages, opts, s), {
      logger: this.logger,
      signal,
    });
  }

  private async chatOnce(messages: ChatMessage[], opts: ChatOptions, signal?: AbortSignal): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      temperature: opts.temperature ?? CONVERSATIONAL_TEMPERATURE,
    };
    if (opts.presencePenalty !== undefined) body.presence_penalty = opts.presencePenalty;
    if (opts.frequencyPenalty !== undefined) body.frequency_penalty = opts.frequencyPenalty;

    const attemptSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)])
      : AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
    // A transport error is the most retryable thing there is: thrown as-is.
    const res = await this.fetchImpl(`${this.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: attemptSignal,
    });
    const text = (await res.text()).slice(0, 4 << 20);
    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`deepseek HTTP ${res.status}: ${[...text].slice(0, 300).join('')}`);
      if (!retryableStatus(res.status)) throw permanent(err);
      const wait = parseRetryAfter(res.headers.get('Retry-After'));
      throw wait > 0 ? retryAfter(err, wait) : err;
    }
    let parsed: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // A 200 that is not JSON is usually a proxy interstitial, and that clears.
      throw new Error(`decode response: ${(e as Error).message}`, { cause: e });
    }
    if (parsed.error) throw permanent(new Error(`deepseek error: ${parsed.error.message ?? ''}`));
    if (!parsed.choices?.length) throw new Error('deepseek returned no choices');
    return parsed.choices[0]?.message?.content ?? '';
  }
}
