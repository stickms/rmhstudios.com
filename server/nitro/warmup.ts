// Nitro startup plugin — warms each web worker's hot path so the FIRST request
// after a (re)deploy or restart doesn't pay every cold cost at once.
//
// WHY PER-WORKER: production runs NITRO_PRESET=node-cluster with
// NITRO_CLUSTER_WORKERS>1, and every worker has its OWN heap, connection pool,
// and in-process caches. The blue/green deploy health-gate curls `/` once
// (deploy/hotswap-web.sh), which only warms whichever worker answered — the
// others stay cold, so the first user routed to them re-pays the full cold cost.
// This plugin runs in every worker, priming them all.
//
// SAFETY: everything here is best-effort and fire-and-forget. It must never block
// the worker from accepting connections, and any failure (e.g. the DB isn't
// reachable yet) simply leaves that cache cold — exactly the pre-warmup behavior,
// no worse. Imports are RELATIVE (not `@/` aliased) because Nitro plugin modules
// don't reliably resolve the tsconfig path aliases; they still resolve to the
// same absolute files as the request handlers, so the warmed singletons
// (apiCache / cachedSWR L1, the Prisma pool) are the ones requests read.

export default function warmupPlugin() {
  // Do NOT await — let the worker start serving immediately. Warming races the
  // first request and usually wins; even when it loses, it is opening the same
  // pool / evaluating the same modules that request would anyway.
  void warm();
}

async function warm(): Promise<void> {
  // 1. Open the Prisma pg pool now, so the first DB-touching request doesn't pay
  //    the TCP + TLS + auth handshake (the pool otherwise connects lazily).
  try {
    const { prisma } = await import('../../lib/prisma.server');
    await prisma.$connect();
  } catch {
    // The pool still opens lazily on the first real query.
  }

  // 2. Prime the anonymous homepage assembly. getTimeline (anon For-You first
  //    page) and getSidebarData populate the exact L1(+L2) cache keys the landing
  //    page reads (see app/routes/_site/index.tsx), so the first anon visitor —
  //    and the deploy's `/` health probe — hit warm caches instead of running the
  //    full ~32-query timeline assembly + sidebar scans cold.
  try {
    const [{ getTimeline }, { getSidebarData }] = await Promise.all([
      import('../../lib/feed/timeline'),
      import('../../lib/sidebar-data'),
    ]);
    await Promise.all([
      // Same params (and therefore same cache key) as the anon homepage: For-You,
      // filter all, first page, limit 20, no viewer.
      getTimeline({
        userId: null,
        surface: 'foryou',
        filter: 'all',
        cursor: null,
        limit: 20,
        search: null,
      }).catch(() => {}),
      // getRequestSession() returns null with no active request, so this resolves
      // the anonymous sidebar (the global-keyed userBuilds/blogPosts/recommendPool
      // caches), which is what a signed-out landing gets.
      getSidebarData().catch(() => {}),
    ]);
  } catch {
    // Best-effort — leave the caches cold on failure.
  }
}
