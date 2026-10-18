// ─────────────────────────────────────────────────────────────────────────────
// Committed JSON baselines for the eversion perf gates (T14; spec §11.3 gate 43).
//
// SwiftShader numbers are pessimistic and machine-dependent, so the gates are
// REGRESSION-RELATIVE: "p95 did not get > 15 % worse than the committed
// baseline", never "p95 < 17 ms". That needs somewhere to keep the baseline and
// one rule for how it is compared and refreshed, so T35/T36 do not each invent
// their own file format. Baselines live in `testing/e2e/baselines/eversion-*.json`
// and are refreshed by passing `--update-baselines` — a deliberate, reviewable
// diff, never a side effect of a green run.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'baselines');

/** True when the process was started with `--update-baselines`. */
export function wantsBaselineUpdate(argv = process.argv) {
  return argv.includes('--update-baselines');
}

/** Absolute path of baseline `name` (`eversion-frames` → `…/eversion-frames.json`). */
export function baselinePath(name, dir = BASELINE_DIR) {
  return join(dir, name.endsWith('.json') ? name : `${name}.json`);
}

/** Load a baseline, or `null` when none is committed yet. */
export function loadBaseline(name, dir = BASELINE_DIR) {
  const file = baselinePath(name, dir);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])]),
    );
  }
  return v;
}

/** Write a baseline (stable key order, trailing newline — it is committed). */
export function saveBaseline(name, data, dir = BASELINE_DIR) {
  const file = baselinePath(name, dir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sortKeys(data), null, 2)}\n`);
  return file;
}

/**
 * Compare `current` metrics to a baseline under per-metric rules.
 *
 * @param {Record<string, number>} current
 * @param {Record<string, number> | null} baseline
 * @param {Record<string, { maxRatio?: number, maxDelta?: number }>} rules
 *   `maxRatio` 1.15 = fail above 115 % of baseline; `maxDelta` 0.02 = fail when
 *   more than 0.02 above baseline (for shares). A metric may set both.
 * @returns {{ ok: boolean, missing: boolean, failures: string[], rows: object[] }}
 *   `missing` = no baseline committed: the caller decides (CI fails, locally say
 *   to run `--update-baselines`).
 */
export function compareToBaseline(current, baseline, rules) {
  if (!baseline) return { ok: false, missing: true, failures: ['no baseline committed'], rows: [] };
  const failures = [];
  const rows = [];
  for (const [metric, rule] of Object.entries(rules)) {
    const cur = current[metric];
    const base = baseline[metric];
    if (typeof cur !== 'number' || typeof base !== 'number') {
      failures.push(
        `${metric}: missing from ${typeof cur !== 'number' ? 'current run' : 'baseline'}`,
      );
      continue;
    }
    let bad = false;
    if (rule.maxRatio !== undefined && base > 0 && cur / base > rule.maxRatio) bad = true;
    if (rule.maxDelta !== undefined && cur - base > rule.maxDelta) bad = true;
    rows.push({ metric, current: cur, baseline: base, bad });
    if (bad) failures.push(`${metric}: ${cur} vs baseline ${base}`);
  }
  return { ok: failures.length === 0, missing: false, failures, rows };
}
