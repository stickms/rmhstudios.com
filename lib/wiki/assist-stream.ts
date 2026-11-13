/**
 * Client reader for the wiki writing assistant (`POST /api/admin/wiki/assist`).
 * The endpoint answers with an event stream of `{"delta"}` frames closed by
 * `[DONE]`; this calls `onDelta` for each piece of text as it arrives.
 * Rejects with the server's error code (`AI_UNAVAILABLE`, `RATE_LIMITED`, …).
 */
import { apiUrl } from '@/lib/contract/client';
import { wikiAssistApi } from '@/lib/wiki/wiki.contract';

export class WikiAssistError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WikiAssistError';
  }
}

export async function streamWikiAssist(
  body: { instruction: string; title: string; content: string },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(apiUrl(wikiAssistApi), {
    method: wikiAssistApi.method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) {
    let code = `http_${res.status}`;
    try {
      const json = (await res.json()) as { error?: unknown; code?: unknown };
      if (typeof json.code === 'string') code = json.code;
      else if (typeof json.error === 'string') code = json.error;
    } catch {
      // Not JSON (a proxy error page): the status is the code.
    }
    throw new WikiAssistError(code);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let end = buffer.indexOf('\n\n');
    while (end >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf('\n\n');
      if (!frame.startsWith('data: ')) continue;
      const data = frame.slice(6);
      if (data === '[DONE]') return;
      const payload = JSON.parse(data) as { delta?: string; error?: string };
      if (payload.error) throw new WikiAssistError(payload.error);
      if (payload.delta) onDelta(payload.delta);
    }
  }
}
