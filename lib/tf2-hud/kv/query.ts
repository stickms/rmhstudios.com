/**
 * Read helpers over the KeyValues tree. KeyValues keys are case-insensitive in
 * the Source engine, so every lookup here is too.
 */

import type { KvDoc, KvNode } from './types';

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export function kvChildren(scope: KvDoc | KvNode): KvNode[] {
  return 'roots' in scope ? scope.roots : (scope.children ?? []);
}

/** First child whose key matches. */
export function kvChild(scope: KvDoc | KvNode, key: string): KvNode | undefined {
  return kvChildren(scope).find((n) => same(n.key.text, key));
}

/** All children whose key matches (KeyValues permits duplicate keys). */
export function kvChildrenNamed(scope: KvDoc | KvNode, key: string): KvNode[] {
  return kvChildren(scope).filter((n) => same(n.key.text, key));
}

/** Walk a key path; every segment but the last must be a block. */
export function kvAt(scope: KvDoc | KvNode, path: readonly string[]): KvNode | undefined {
  let cur: KvDoc | KvNode = scope;
  let found: KvNode | undefined;
  for (const seg of path) {
    found = kvChild(cur, seg);
    if (!found) return undefined;
    cur = found;
  }
  return found;
}

/** Scalar value text of a child, if it has one. */
export function kvValue(scope: KvDoc | KvNode, key: string): string | undefined {
  return kvChild(scope, key)?.value?.text;
}

/** Keys from the root down to `node`, e.g. `['Resource/HudHealth', 'PlayerStatusHealthValue']`. */
export function kvPathOf(node: KvNode): string[] {
  const path: string[] = [];
  for (let cur: KvNode | null = node; cur; cur = cur.parent) path.unshift(cur.key.text);
  return path;
}

/** Source range [start, end) covering a node's own tokens (not its leading trivia). */
export function kvRange(node: KvNode): { start: number; end: number } {
  const toks = [node.key, node.value, node.cond, node.open, node.close, node.condAfter];
  let end = node.key.end;
  for (const t of toks) if (t && t.end > end) end = t.end;
  return { start: node.key.start, end };
}

/** Depth-first walk. Return `false` from the visitor to skip a node's children. */
export function kvWalk(
  scope: KvDoc | KvNode,
  visit: (node: KvNode, depth: number) => void | boolean,
  depth = 0,
): void {
  for (const n of kvChildren(scope)) {
    if (visit(n, depth) === false) continue;
    kvWalk(n, visit, depth + 1);
  }
}
