/**
 * Text-to-text edits of KeyValues sources.
 *
 * Every function takes the file text and returns new file text, splicing only
 * the bytes it must touch. Because the parser is lossless, everything the
 * author did not change — comments, spacing, CRLF, ordering — comes back
 * exactly as it was. Each edit re-parses, which is cheap for HUD-sized files
 * and keeps the API free of mutable-tree invariants.
 */

import { evalCond, type CondEnv } from '../scheme/cond';
import { parseKv } from './parse';
import { kvChild, kvChildrenNamed, kvRange } from './query';
import type { KvDoc, KvNode } from './types';

export interface EditOptions {
  /**
   * Platform to edit for. When a key repeats under different conditionals
   * (`"xpos" "0" [$WIN32]` / `"xpos" "32" [$X360]`), the copy that is live in
   * this environment is the one changed — not whichever comes first.
   */
  env?: CondEnv;
}

/** First child named `key`, preferring one whose conditional is live in `env`. */
function pick(scope: KvDoc | KvNode, key: string, env?: CondEnv): KvNode | undefined {
  if (!env) return kvChild(scope, key);
  const all = kvChildrenNamed(scope, key);
  return all.find((n) => evalCond(n.cond?.text, env)) ?? all[0];
}

function eolOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Quote a value unless it is a plain word the original was already writing bare. */
export function kvQuote(value: string, keepBare = false): string {
  if (keepBare && /^[^\s"{}]+$/.test(value) && !value.startsWith('[')) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function indentOf(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const m = /^[ \t]*/.exec(text.slice(lineStart, offset));
  return m ? m[0] : '';
}

function splice(text: string, start: number, end: number, insert: string): string {
  return text.slice(0, start) + insert + text.slice(end);
}

/** Resolve a path, creating nothing; returns the node and the parent scope. */
function resolve(doc: KvDoc, path: readonly string[], env?: CondEnv): { node?: KvNode } {
  let scope: KvDoc | KvNode = doc;
  let node: KvNode | undefined;
  for (const seg of path) {
    node = pick(scope, seg, env);
    if (!node) return {};
    scope = node;
  }
  return { node };
}

function appendEntry(text: string, parent: KvDoc | KvNode, entry: string): string {
  const eol = eolOf(text);
  if ('roots' in parent) {
    const last = parent.roots[parent.roots.length - 1];
    const at = last ? kvRange(last).end : text.length;
    return splice(text, at, at, `${eol}${entry.split('\n').join(eol)}`);
  }
  const children = parent.children ?? [];
  const last = children[children.length - 1];
  const baseIndent = indentOf(text, parent.key.start);
  const childIndent = last ? indentOf(text, last.key.start) : `${baseIndent}\t`;
  const body = entry
    .split('\n')
    .map((line) => (line ? childIndent + line : line))
    .join(eol);
  if (parent.open && parent.close) {
    const at = last ? kvRange(last).end : parent.open.end;
    return splice(text, at, at, `${eol}${body}`);
  }
  return text;
}

/**
 * Set `path` (ending at a scalar key) to `value`, creating the key — and any
 * missing parent blocks — when absent.
 */
export function kvSet(
  text: string,
  path: readonly string[],
  value: string,
  opts: EditOptions = {},
): string {
  if (path.length === 0) return text;
  const doc = parseKv(text);
  const { node } = resolve(doc, path, opts.env);
  if (node?.value) {
    return splice(text, node.value.start, node.value.end, kvQuote(value, !node.value.quoted));
  }
  if (node) return text; // path names a block; refuse to clobber it with a scalar.

  // Find the deepest existing block, then build what is missing beneath it.
  let scope: KvDoc | KvNode = doc;
  let i = 0;
  for (; i < path.length - 1; i++) {
    const next = pick(scope, path[i], opts.env);
    if (!next || !next.open) break;
    scope = next;
  }
  const missing = path.slice(i);
  const leaf = `${kvQuote(missing[missing.length - 1])}\t\t${kvQuote(value)}`;
  let entry = leaf;
  for (let k = missing.length - 2; k >= 0; k--) {
    entry = `${kvQuote(missing[k])}\n{\n${entry
      .split('\n')
      .map((l) => `\t${l}`)
      .join('\n')}\n}`;
  }
  return appendEntry(text, scope, entry);
}

/** Remove the entry at `path` (plus its line). Missing paths are a no-op. */
export function kvRemove(text: string, path: readonly string[], opts: EditOptions = {}): string {
  const doc = parseKv(text);
  const { node } = resolve(doc, path, opts.env);
  if (!node) return text;
  const { start, end } = kvRange(node);
  let from = start;
  while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t')) from--;
  if (text[from - 1] === '\n') {
    from--;
    if (text[from - 1] === '\r') from--;
  }
  return splice(text, from, end, '');
}

/** Insert a whole block, e.g. a new panel, at the end of `parentPath` (`[]` = file root). */
export function kvAddBlock(
  text: string,
  parentPath: readonly string[],
  key: string,
  props: Record<string, string>,
): string {
  const doc = parseKv(text);
  const scope = parentPath.length ? resolve(doc, parentPath).node : doc;
  if (!scope) return text;
  const lines = [kvQuote(key), '{'];
  for (const [k, v] of Object.entries(props)) lines.push(`\t${kvQuote(k)}\t\t${kvQuote(v)}`);
  lines.push('}');
  return appendEntry(text, scope, lines.join('\n'));
}

/** Rename a key in place. */
export function kvRename(text: string, path: readonly string[], newKey: string): string {
  const doc = parseKv(text);
  const { node } = resolve(doc, path);
  if (!node) return text;
  return splice(text, node.key.start, node.key.end, kvQuote(newKey, !node.key.quoted));
}
