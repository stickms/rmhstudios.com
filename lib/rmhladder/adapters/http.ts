export const LADDER_USER_AGENT =
  process.env.LADDER_USER_AGENT ?? 'rmhladder-bot/0.1 (+https://rmhstudios.com)';

export interface PoliteResponse { ok: boolean; status: number; body: string }

export async function politeFetch(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<PoliteResponse> {
  const { fetchImpl = fetch, timeoutMs = 10_000 } = opts;
  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': LADDER_USER_AGENT, accept: 'application/json, text/html;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch {
    return { ok: false, status: 0, body: '' };
  }
}
