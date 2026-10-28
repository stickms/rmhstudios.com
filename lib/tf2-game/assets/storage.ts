/**
 * How much object storage the game channels use, from their state files alone (each
 * published file's stored size is recorded there by publish.ts), and what a pending
 * upload would bring it to. Used by scripts/tf2-game/storage-report.ts, which the sync
 * workflow runs before any game channel uploads: past the budget, nothing is sent.
 *
 * Pure: the script does the I/O.
 */

export interface ChannelState {
  models: Record<string, { src: string; size: number }>;
}

export interface PendingChannel {
  /** `wanted.json`: every file the converter wants published, by source hash. */
  wanted: Record<string, { src: string }>;
  /** Raw size of each file the converter wrote this run (an upper bound: Brotli only shrinks). */
  localSizes: Record<string, number>;
}

export interface ChannelUsage {
  name: string;
  files: number;
  bytes: number;
}

/** Stored bytes now: every object the state lists (stale ones too — they stay until pruned). */
export function storedUsage(name: string, state: ChannelState): ChannelUsage {
  let bytes = 0;
  const entries = Object.values(state.models);
  for (const m of entries) bytes += Number.isFinite(m.size) ? m.size : 0;
  return { name, files: entries.length, bytes };
}

/**
 * Stored bytes after this run's push: unchanged files keep their stored size, files to
 * be (re)uploaded count at their raw size, and objects no longer wanted stay (no prune).
 */
export function projectedUsage(
  name: string,
  state: ChannelState,
  pending: PendingChannel,
): ChannelUsage {
  const sizes = new Map<string, number>();
  for (const [file, m] of Object.entries(state.models)) sizes.set(file, m.size || 0);
  for (const [file, w] of Object.entries(pending.wanted)) {
    const published = state.models[file];
    if (published && published.src === w.src) continue;
    const local = pending.localSizes[file];
    if (local !== undefined) sizes.set(file, local);
  }
  let bytes = 0;
  for (const s of sizes.values()) bytes += s;
  return { name, files: sizes.size, bytes };
}

export const GB = 1024 ** 3;

export function overBudget(usages: readonly ChannelUsage[], budgetGb: number) {
  const total = usages.reduce((sum, u) => sum + u.bytes, 0);
  return { total, budget: budgetGb * GB, over: total > budgetGb * GB };
}

export function formatUsage(usages: readonly ChannelUsage[], budgetGb: number): string {
  const mb = (b: number) => (b / 1024 / 1024).toFixed(1).padStart(9) + ' MiB';
  const { total, over } = overBudget(usages, budgetGb);
  const width = Math.max(8, ...usages.map((u) => u.name.length));
  const lines = usages.map(
    (u) => `${u.name.padEnd(width)} ${String(u.files).padStart(7)} files ${mb(u.bytes)}`,
  );
  lines.push(
    `${'total'.padEnd(width)} ${' '.repeat(13)} ${mb(total)}  of ${budgetGb} GB budget${over ? '  — OVER BUDGET' : ''}`,
  );
  return lines.join('\n');
}
