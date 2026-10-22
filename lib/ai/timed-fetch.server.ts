// A `fetch` for the OpenAI SDK that times every model call.
//
// The site builds ~two dozen OpenAI-compatible clients (DeepSeek, xAI, the
// embeddings provider), each in its own feature module. Rather than time each
// call site, every client is constructed with `fetch: timedAiFetch`, so all of
// them land in one metric:
//
//   llm.latency|<provider>:<kind>   histogram (lib/perf recordTiming)
//   llm.error|<provider>:<kind>     counter: non-2xx responses and network errors
//
// <provider> comes from the API host (deepseek, xai, openai, …) and <kind> from
// the endpoint (chat, image, embeddings, other), so the label set stays small.
//
// What is measured is the time until the response headers arrive: the whole
// call for normal requests, time-to-first-token for streamed ones.

import { recordCounter, recordTiming } from '../perf/process-metrics';

function providerOf(host: string): string {
  if (host.includes('deepseek')) return 'deepseek';
  if (host.endsWith('x.ai')) return 'xai';
  if (host.includes('openai')) return 'openai';
  if (host.includes('moonshot') || host.includes('kimi')) return 'kimi';
  if (host.includes('anthropic')) return 'anthropic';
  return 'other';
}

function kindOf(path: string): string {
  if (path.includes('/chat/completions')) return 'chat';
  if (path.includes('/images/')) return 'image';
  if (path.includes('/embeddings')) return 'embeddings';
  return 'other';
}

/** The metric dimension for a request URL, e.g. `deepseek:chat`. */
export function aiCallLabel(input: string | URL | Request): string {
  try {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    return `${providerOf(url.hostname)}:${kindOf(url.pathname)}`;
  } catch {
    return 'other:other';
  }
}

export const timedAiFetch: typeof fetch = async (input, init) => {
  const label = aiCallLabel(input);
  const started = performance.now();
  try {
    const res = await fetch(input, init);
    recordTiming(`llm.latency|${label}`, performance.now() - started);
    if (!res.ok) recordCounter(`llm.error|${label}`);
    return res;
  } catch (err) {
    recordTiming(`llm.latency|${label}`, performance.now() - started);
    recordCounter(`llm.error|${label}`);
    throw err;
  }
};
