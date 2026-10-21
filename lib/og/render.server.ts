import { renderAsync } from '@resvg/resvg-js';

/**
 * perf: shared PNG-render plumbing for the OG card renderers.
 *
 * 1. `dedupeOgRender` — a link-unfurl burst (Discord/Slack/crawlers hitting the
 *    same card URL concurrently) used to run satori + resvg once PER request on
 *    a cache miss. Concurrent callers for the same key now share one render; the
 *    entry is removed when it settles, so a failure is never memoized.
 * 2. `svgToPng` — `new Resvg(svg).render()` is synchronous and blocks the event
 *    loop for the whole rasterization; `renderAsync` does the same work (same
 *    options, same `.asPng()`) on the libuv threadpool.
 */
const inflight = new Map<string, Promise<Buffer>>();

export function dedupeOgRender(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = render().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/** Rasterize an SVG to a PNG at `width`, off the event loop. */
export async function svgToPng(svg: string, width: number): Promise<Buffer> {
  const rendered = await renderAsync(svg, { fitTo: { mode: 'width', value: width } });
  return Buffer.from(rendered.asPng());
}
