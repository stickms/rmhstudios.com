/**
 * The chunks of the full in-engine UI sweep (lib/balatro/lua/mp_test/specs/ui_sweep_full.lua).
 * The sweep is too long for one engine boot (the page runs out of memory on software WebGL), so
 * engine/sweep.ts runs each chunk in a fresh boot. The Lua file's CHUNKS table is the single
 * source; this reads it (between the `-- CHUNKS BEGIN` / `-- CHUNKS END` markers).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MP_TEST_DIR } from './build-harness';

export const SWEEP_FILE = 'ui_sweep_full';
export const SWEEP_PATH = path.join(MP_TEST_DIR, 'specs', `${SWEEP_FILE}.lua`);

export interface SweepChunk {
  id: string;
  /** The `it` names (without the tag) the chunk runs. */
  tests: string[];
}

/** Lua single-quoted string literals (the sweep's names use no escapes but \'). */
const LUA_STRING = /'((?:[^'\\]|\\.)*)'/g;
const unquote = (s: string) => s.replace(/\\(.)/g, '$1');

export function parseSweepChunks(source: string): SweepChunk[] {
  const begin = source.indexOf('-- CHUNKS BEGIN');
  const end = source.indexOf('-- CHUNKS END');
  if (begin < 0 || end < begin) throw new Error(`${SWEEP_FILE}.lua: no CHUNKS BEGIN/END block`);
  const block = source.slice(begin, end);
  const chunks: SweepChunk[] = [];
  for (const m of block.matchAll(/\{\s*id\s*=\s*'([^']+)',\s*tests\s*=\s*\{([\s\S]*?)\}\s*\}/g)) {
    const tests = [...m[2]!.matchAll(LUA_STRING)].map((t) => unquote(t[1]!));
    chunks.push({ id: m[1]!, tests });
  }
  return chunks;
}

export function sweepChunks(): SweepChunk[] {
  return parseSweepChunks(readFileSync(SWEEP_PATH, 'utf8'));
}

/** The spec filter that selects one chunk: its tests and its summary carry this tag. */
export const chunkFilter = (id: string) => `[sweep:${id}]`;

/** Every `it('…'` name in the sweep file (the per-chunk summaries are built in a loop). */
export function sweepTestNames(source: string): string[] {
  return [...source.matchAll(/\n\s*it\('((?:[^'\\]|\\.)*)'/g)].map((m) => unquote(m[1]!));
}
