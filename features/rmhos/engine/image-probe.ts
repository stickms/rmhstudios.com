/**
 * A cheap look at the image files before the emulator is built.
 *
 * v86 reports almost none of the ways a file can fail to load: a 404 or 416 on its own
 * (body-less, or with a body that never produces a progress event) is logged and then nothing
 * more happens; a network or CORS error is retried forever with a growing delay, with no event.
 * The page would sit at "Downloading" until the watchdog gave up. A HEAD request for each boot
 * file (and one ranged request for the disk, sent exactly as v86 sends them) turns those into an
 * answer in about one round trip, and with a reason the page can say in plain words.
 *
 * A missing snapshot is not a failure: the caller boots cold without it.
 */
import type { BootFailureReason } from './vm-types';
import type { ImageManifest } from './image-manifest';

export interface ProbeFailure {
  reason: Extract<BootFailureReason, 'image-missing' | 'image-invalid' | 'network' | 'stalled'>;
  /** The file's URL. */
  file: string;
  /** The HTTP status, when there was one. */
  status?: number;
  /** One line for the Details disclosure. */
  detail: string;
}

export interface ProbeResult {
  /** A file the machine cannot start without. */
  failure: ProbeFailure | null;
  /** The snapshot answered, so it is worth trying. False: boot cold. */
  stateUsable: boolean;
  /** Why the snapshot is not usable, for the operator's log. */
  stateProblem: string | null;
}

export interface ProbeOptions {
  fetch: typeof fetch;
  signal?: AbortSignal | undefined;
  /** Each request is given up on after this long (reported as `stalled`). */
  timeoutMs: number;
  /** Test seam; defaults to the platform timers. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
}

type One = { ok: true } | { ok: false; failure: ProbeFailure };

async function probeOne(
  url: string,
  kind: 'head' | 'range',
  expectedSize: number,
  o: ProbeOptions,
): Promise<One> {
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  o.signal?.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const setT = o.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
  const clearT = o.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const timer = setT(() => {
    timedOut = true;
    ac.abort();
  }, o.timeoutMs);
  try {
    const res = await o.fetch(
      url,
      kind === 'range'
        ? {
            method: 'GET',
            // Exactly what v86 sends for a disk block: the custom header is what makes the
            // cross-origin request need a CORS preflight that allows it.
            headers: { Range: 'bytes=0-0', 'X-Accept-Encoding': 'identity' },
            cache: 'no-store',
            signal: ac.signal,
          }
        : { method: 'HEAD', cache: 'no-store', signal: ac.signal },
    );
    // Only the status and headers are wanted; do not download the body.
    void res.body?.cancel().catch(() => {});
    const status = res.status;
    if (status === 404 || status === 410 || status === 416)
      return { ok: false, failure: { reason: 'image-missing', file: url, status, detail: `${status} for ${url}` } };
    if (status >= 500)
      return { ok: false, failure: { reason: 'network', file: url, status, detail: `${status} for ${url}` } };
    if (kind === 'range') {
      // v86 aborts a ranged read answered with a whole 200: the disk server must honour Range.
      if (status !== 206)
        return {
          ok: false,
          failure: { reason: 'image-invalid', file: url, status, detail: `${status} to a ranged request for ${url}` },
        };
      // The total in Content-Range is readable cross-origin only when the CDN exposes it.
      const total = /\/(\d+)\s*$/.exec(res.headers.get('content-range') ?? '')?.[1];
      if (total !== undefined && Number(total) !== expectedSize)
        return {
          ok: false,
          failure: {
            reason: 'image-invalid',
            file: url,
            status,
            detail: `${url} is ${total} bytes, expected ${expectedSize}`,
          },
        };
      return { ok: true };
    }
    if (status < 200 || status >= 300)
      return { ok: false, failure: { reason: 'image-invalid', file: url, status, detail: `${status} for ${url}` } };
    return { ok: true };
  } catch (e) {
    if (o.signal?.aborted) throw e;
    if (timedOut)
      return {
        ok: false,
        failure: { reason: 'stalled', file: url, detail: `no answer from ${url} in ${o.timeoutMs / 1000} s` },
      };
    return {
      ok: false,
      failure: { reason: 'network', file: url, detail: `could not reach ${url} (${(e as Error)?.message ?? 'network error'})` },
    };
  } finally {
    clearT(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
}

/** Probes every boot file in parallel. Rejects only when `signal` aborts. */
export async function probeImage(manifest: ImageManifest, o: ProbeOptions): Promise<ProbeResult> {
  const required = await Promise.all([
    probeOne(manifest.seabios.url, 'head', manifest.seabios.size, o),
    probeOne(manifest.vgabios.url, 'head', manifest.vgabios.size, o),
    probeOne(manifest.bzImage.url, 'head', manifest.bzImage.size, o),
    probeOne(manifest.rootfs.url, 'range', manifest.rootfs.size, o),
  ]);
  const bad = required.find((r): r is Extract<One, { ok: false }> => !r.ok);
  if (bad) return { failure: bad.failure, stateUsable: false, stateProblem: null };
  if (!manifest.state) return { failure: null, stateUsable: false, stateProblem: 'no snapshot in the manifest' };
  const state = await probeOne(manifest.state.url, 'head', manifest.state.size, o);
  return state.ok
    ? { failure: null, stateUsable: true, stateProblem: null }
    : { failure: null, stateUsable: false, stateProblem: state.failure.detail };
}
