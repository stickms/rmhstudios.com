/**
 * Loads the shared interface fixtures (`*.json` next to this file).
 *
 * The same files are read by the Lua side (lib/balatro/lua/spec/protocol_spec.lua),
 * so the rules are kept tiny and identical in both languages:
 * - `{ "$ref": "<name>" }` anywhere is replaced by `types.json` → `objects.<name>`
 *   (itself resolved recursively);
 * - each case set is `{ valid: unknown[], invalid: { why, d, tsOnly? }[] }`.
 *   `tsOnly` marks a case only TS can reject (a regex or a refinement; the
 *   generated Lua validators do not check those).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface InvalidCase {
  why: string;
  d: unknown;
  tsOnly?: boolean;
}
export interface CaseSet {
  valid: unknown[];
  invalid: InvalidCase[];
}
export type CaseMap = Record<string, CaseSet>;

const DIR = import.meta.dirname;

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(DIR, name), 'utf8'));
}

const types = readJson('types.json') as { objects: Record<string, unknown> } & Record<
  string,
  unknown
>;

export function resolveRefs(value: unknown, depth = 0): unknown {
  if (depth > 32) throw new Error('fixture $ref nesting too deep');
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, depth + 1));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$ref === 'string' && Object.keys(obj).length === 1) {
      const target = types.objects[obj.$ref];
      if (target === undefined) throw new Error(`unknown fixture $ref ${obj.$ref}`);
      return resolveRefs(target, depth + 1);
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, resolveRefs(v, depth + 1)]));
  }
  return value;
}

export function loadFixture<T = unknown>(
  name: 'types.json' | 'events.json' | 'wire.json' | 'bridge.json',
): T {
  return resolveRefs(readJson(name)) as T;
}
