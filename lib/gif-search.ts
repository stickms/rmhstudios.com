/** Build the client fetch path for the GIF search proxy. */
export function buildGifSearchPath(q: string, pos: string | null): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (pos) params.set("pos", pos);
  const qs = params.toString();
  return qs ? `/api/gif/search?${qs}` : "/api/gif/search";
}
