/**
 * The RMH News summary's shape, shared by the server that writes it (./summary.server.ts), the endpoint that returns
 * it and the article page that draws it. Client-safe and dependency-free.
 */

export interface NewsSummary {
  /** One sentence: what happened. */
  tldr: string;
  /** Three to five key facts. */
  points: string[];
}

export type SummaryUnavailableReason =
  /** The outlet's page could not be read, or held no article (paywall, video, cookie wall). */
  | 'no-text'
  /** No DeepSeek key on this server. */
  | 'ai-off'
  /** Today's summary budget is spent; the cached ones still show. */
  | 'busy'
  /** The model call failed; the next reader tries again. */
  | 'error';

export type SummaryResult =
  { status: 'ready'; summary: NewsSummary } | { status: 'unavailable'; reason: SummaryUnavailableReason };

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * A model reply (or a stored row) as a summary, or null when it is not one. Lenient about extra keys and stray
 * whitespace, strict about types: a summary is never drawn half-formed.
 */
export function toNewsSummary(value: unknown): NewsSummary | null {
  if (!value || typeof value !== 'object') return null;
  const { tldr, points } = value as { tldr?: unknown; points?: unknown };
  if (typeof tldr !== 'string' || !Array.isArray(points)) return null;
  const cleanPoints = points
    .filter((p): p is string => typeof p === 'string')
    .map((p) => clean(p, 320))
    .filter(Boolean)
    .slice(0, 6);
  const cleanTldr = clean(tldr, 360);
  if (!cleanTldr || cleanPoints.length === 0) return null;
  return { tldr: cleanTldr, points: cleanPoints };
}

/** The `summary` column as a summary: null for no row yet, '' (tried, nothing to summarise) or a malformed value. */
export function parseStoredSummary(raw: string | null | undefined): NewsSummary | null {
  if (!raw) return null;
  try {
    return toNewsSummary(JSON.parse(raw));
  } catch {
    return null;
  }
}
