// Build-time replacement for the Nitro `node-cluster` entry (.output/server/index.mjs).
//
// WHY: Nitro's stock cluster primary forks N workers and then does NOTHING —
// no `exit` handler. Reproduced locally (see docs/performance-audit notes): with
// the production heap cap a worker that dies (V8 heap OOM, uncaught exception)
// is never replaced, in-flight sockets on it are reset (Cloudflare 502), the
// remaining workers carry all traffic, and when the last worker dies the
// primary exits and the container restarts cold (empty caches, cold DB pool,
// "redis unreachable" on /api/ready, a 4-6s first request).
//
// WHAT the patched primary does:
//  1. respawns any worker that exits (with a small crash-loop backoff);
//  2. on a worker's `nitro:recycle` message (sent by server/nitro/heap-guard.ts
//     when the heap is nearly full) forks the REPLACEMENT FIRST, then calls
//     `disconnect()` on the old worker so it stops accepting, finishes its
//     in-flight requests and exits — a memory recycle with zero reset requests;
//  3. forwards SIGTERM/SIGINT to the workers (so the drain plugin runs) and
//     only then exits, instead of dying with workers mid-request.
//
import { existsSync, writeFileSync } from 'node:fs';

const MARKER = '/* rmh-cluster-supervisor */';

export const SUPERVISED_PRIMARY = `${MARKER}
if (cluster.isPrimary) {
  const numberOfWorkers =
    Number.parseInt(process.env.NITRO_CLUSTER_WORKERS || "") ||
    (os.cpus().length > 0 ? os.cpus().length : 1);
  let stopping = false;
  const recent = new Map(); // WORKER_ID -> recent crash timestamps
  const spawn = (id) => { const w = cluster.fork({ WORKER_ID: id }); w.__id = id; return w; };
  for (let i = 0; i < numberOfWorkers; i++) spawn(i + 1);
  cluster.on("message", (worker, msg) => {
    if (stopping || !msg || msg.type !== "nitro:recycle" || worker.__recycling) return;
    worker.__recycling = true;
    const id = worker.__id;
    console.warn("[cluster] worker " + worker.id + " heap nearly full; starting replacement, draining old worker");
    worker.__replaced = true;
    const fresh = spawn(id);
    let retired = false;
    const retire = () => {
      if (retired) return;
      retired = true;
      // Stop accepting new connections; in-flight requests finish. Hard stop after 60s.
      try { worker.disconnect(); } catch {}
      setTimeout(() => { if (!worker.isDead()) worker.kill("SIGKILL"); }, 60000).unref();
    };
    // The replacement is cold (Prisma engine compile ~4s on first query). Keep the old
    // worker serving for a grace period after the new one starts listening so users
    // do not land on a cold worker alone; if it never listens, retire anyway after 30s.
    fresh.once("listening", () => setTimeout(retire, 8000));
    setTimeout(retire, 30000).unref();
  });
  cluster.on("exit", (worker, code, signal) => {
    if (stopping) {
      if (Object.keys(cluster.workers || {}).length === 0) process.exit(0);
      return;
    }
    if (worker.__replaced) return; // intentional recycle, replacement already running
    const id = worker.__id || worker.id;
    console.error("[cluster] worker " + worker.id + " exited (code=" + code + ", signal=" + signal + "); respawning");
    const now = Date.now();
    const ts = (recent.get(id) || []).filter((t) => now - t < 30000);
    ts.push(now);
    recent.set(id, ts);
    // Crash loop (>3 deaths in 30s): back off so a boot-time failure does not spin the CPU.
    setTimeout(() => { if (!stopping) spawn(id); }, ts.length > 3 ? 5000 : 250);
  });
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      if (stopping) return;
      stopping = true;
      const ws = Object.values(cluster.workers || {});
      if (ws.length === 0) process.exit(0);
      for (const w of ws) { try { w.process.kill(sig); } catch {} }
      setTimeout(() => process.exit(0), 15000).unref();
    });
  }
}`;

/**
 * Write `<serverDir>/index.mjs` for the node-cluster preset: the supervised
 * primary above + the stock worker branch. No-op for other presets (no
 * worker.mjs). Mirrors Nitro's `nodeClusterEntry()` — if a Nitro upgrade
 * changes the worker contract (`./worker.mjs`), update this too.
 */
export function writeClusterEntry(serverDir: string): void {
  if (!existsSync(`${serverDir}/worker.mjs`)) return;
  writeFileSync(
    `${serverDir}/index.mjs`,
    `import cluster from "node:cluster";
import os from "node:os";

${SUPERVISED_PRIMARY} else {
  import("./worker.mjs").catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
`,
  );
}
