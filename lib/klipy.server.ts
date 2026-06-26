/**
 * Pure helpers for talking to the KLIPY GIF API (api.klipy.com). No network
 * here — the route (app/routes/api/gif/search.ts) does the fetch; these build
 * the request URL and normalize the response so they can be unit-tested without
 * HTTP.
 *
 * KLIPY replaced Tenor (Google shut the Tenor public API down on 2026-06-30).
 * The API key is embedded in the URL path; the request is made server-side only.
 */

export type KlipyGif = {
  id: string;
  description: string;
  preview: string; // small thumbnail for the grid (file.sm/xs .gif)
  url: string; // full gif inserted on select (file.md/hd .gif)
  width: number;
  height: number;
};

const KLIPY_BASE = "https://api.klipy.com/api/v1";
const DEFAULT_PER_PAGE = 24;

export function buildKlipyRequestUrl(opts: {
  q: string;
  pos: string | null; // page number as a string; null/non-numeric → page 1
  key: string;
  rating?: string; // content rating: g | pg | pg-13 | r (default g = SFW)
  perPage?: number;
}): string {
  const q = opts.q.trim();
  const endpoint = q ? "search" : "trending";
  const url = new URL(`${KLIPY_BASE}/${opts.key}/gifs/${endpoint}`);
  if (q) url.searchParams.set("q", q);
  const page = opts.pos && /^\d+$/.test(opts.pos) ? opts.pos : "1";
  url.searchParams.set("page", page);
  url.searchParams.set("per_page", String(opts.perPage ?? DEFAULT_PER_PAGE));
  url.searchParams.set("rating", opts.rating ?? "g");
  return url.toString();
}

export function normalizeKlipyResponse(json: unknown): { results: KlipyGif[]; next: string | null } {
  const data = (json as { data?: Record<string, any> } | null)?.data;
  const rawItems = data && Array.isArray(data.data) ? data.data : [];
  const results: KlipyGif[] = [];

  for (const item of rawItems as Array<Record<string, any>>) {
    const file = item?.file;
    // Prefer mid-size for the inserted GIF, smallest for the grid thumbnail.
    const fullGif = file?.md?.gif ?? file?.hd?.gif ?? file?.sm?.gif ?? file?.xs?.gif;
    const previewGif = file?.sm?.gif ?? file?.xs?.gif ?? fullGif;
    if (!fullGif?.url || !previewGif?.url) continue; // skips ads / malformed entries
    results.push({
      id: String(item.id ?? fullGif.url),
      description: String(item.title ?? item.slug ?? ""),
      preview: String(previewGif.url),
      url: String(fullGif.url),
      width: Number(fullGif.width) || 0,
      height: Number(fullGif.height) || 0,
    });
  }

  const hasNext = data && typeof data.has_next === "boolean" ? data.has_next : false;
  const currentPage = data && Number.isFinite(Number(data.current_page)) ? Number(data.current_page) : 1;
  const next = hasNext ? String(currentPage + 1) : null;
  return { results, next };
}
