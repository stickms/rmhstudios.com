/**
 * Pure helpers for talking to the Tenor v2 API. No network here — the route
 * (app/routes/api/gif/search.ts) does the fetch; these build the request URL
 * and normalize the response so they can be unit-tested without HTTP.
 */

export type TenorGif = {
  id: string;
  description: string;
  preview: string; // tinygif thumbnail for the grid
  url: string; // full gif inserted on select
  width: number;
  height: number;
};

const TENOR_BASE = "https://tenor.googleapis.com/v2";
const DEFAULT_LIMIT = 24;

export function buildTenorRequestUrl(opts: {
  q: string;
  pos: string | null;
  key: string;
  clientKey?: string;
  limit?: number;
}): string {
  const q = opts.q.trim();
  const endpoint = q ? "search" : "featured";
  const url = new URL(`${TENOR_BASE}/${endpoint}`);
  url.searchParams.set("key", opts.key);
  if (opts.clientKey) url.searchParams.set("client_key", opts.clientKey);
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("media_filter", "tinygif,gif");
  url.searchParams.set("contentfilter", "high");
  url.searchParams.set("limit", String(opts.limit ?? DEFAULT_LIMIT));
  if (opts.pos) url.searchParams.set("pos", opts.pos);
  return url.toString();
}

export function normalizeTenorResponse(json: unknown): { results: TenorGif[]; next: string | null } {
  const root = json as { results?: unknown; next?: unknown } | null;
  const raw = root && Array.isArray(root.results) ? root.results : [];
  const results: TenorGif[] = [];

  for (const item of raw as Array<Record<string, any>>) {
    const formats = item?.media_formats;
    const gif = formats?.gif;
    const tiny = formats?.tinygif;
    if (!gif?.url || !tiny?.url) continue;
    const dims = Array.isArray(gif.dims) ? gif.dims : [0, 0];
    results.push({
      id: String(item.id ?? gif.url),
      description: String(item.content_description ?? ""),
      preview: String(tiny.url),
      url: String(gif.url),
      width: Number(dims[0]) || 0,
      height: Number(dims[1]) || 0,
    });
  }

  const next = typeof root?.next === "string" && root.next !== "" ? root.next : null;
  return { results, next };
}
