/**
 * Slice It — start fetching before the countdown does (`O5`).
 *
 * `LOAD_TIMEOUT_MS` is 90 seconds because "a cold cache on a weak phone
 * genuinely takes tens of seconds". That constant is a workaround for nothing
 * starting to fetch until the match does — and the lobby has known which song
 * is next since the host picked it, which is usually a good while earlier.
 *
 * Warming the HTTP cache is the whole mechanism. Nothing is decoded and nothing
 * is retained: `useStartRun` still does the real load, and it hits a warm cache
 * instead of the network. That deliberately does NOT try to hand the decoded
 * buffer over — a second copy of the PCM held in a module-level cache is tens of
 * megabytes on the device least able to spare them, and the browser's own cache
 * is the right place for bytes.
 */

/** Per-song state, so a lobby that flicks between songs does not re-fetch. */
const warmed = new Set<string>();
const inFlight = new Map<string, AbortController>();

export interface PrefetchOptions {
  /** Cancel an in-flight prefetch (the host changed the song). */
  signal?: AbortSignal;
  difficulty?: string;
}

/**
 * Warm the chart and audio for a song.
 *
 * Never throws and never reports failure: a prefetch that fails costs the
 * player exactly what they had before it existed, and surfacing it would mean a
 * toast about something they did not ask for.
 */
export async function prefetchRun(songId: string, options: PrefetchOptions = {}): Promise<void> {
  if (!songId || warmed.has(songId)) return;

  // A second call for the same song while the first is still running is the
  // common case — React strict mode, or a lobby re-render — and firing two
  // full audio fetches for one song is the opposite of the point.
  const existing = inFlight.get(songId);
  if (existing) return;

  const controller = new AbortController();
  inFlight.set(songId, controller);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const query = options.difficulty
      ? `?difficulty=${encodeURIComponent(options.difficulty)}`
      : '';
    const response = await fetch(`/api/slice-it/songs/${songId}${query}`, {
      signal: controller.signal,
      // `no-store` would defeat the entire purpose; be explicit rather than
      // relying on the default, because the default is what a future edit to
      // the fetch wrapper would change.
      cache: 'default',
    });
    if (!response.ok) return;
    const song = (await response.json()) as { audioUrl?: string };
    if (!song.audioUrl) return;

    // The audio is the expensive half — megabytes against the chart's
    // kilobytes. `arrayBuffer()` rather than leaving the body unread: an
    // unread body is a response the cache may never commit.
    const audio = await fetch(song.audioUrl, { signal: controller.signal, cache: 'default' });
    if (!audio.ok) return;
    await audio.arrayBuffer();
    warmed.add(songId);
  } catch {
    // Aborted, offline, 404 — all the same outcome: the real load will do it.
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    inFlight.delete(songId);
  }
}

/** Whether a song's bytes are already in the browser's cache from a prefetch. */
export function isPrefetched(songId: string): boolean {
  return warmed.has(songId);
}

/**
 * Forget everything. Called when the player signs out or the game unmounts.
 *
 * The set is ids, not bytes, so this frees almost nothing — it exists so that a
 * song re-uploaded under the same id (or a chart edited between sessions) is
 * fetched again rather than assumed warm.
 */
export function clearPrefetchCache(): void {
  for (const controller of inFlight.values()) controller.abort();
  inFlight.clear();
  warmed.clear();
}
