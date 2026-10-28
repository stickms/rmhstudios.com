/** Finding panels in the project: the scan behind presets, rules and suggestions. */

import { activeEntries } from '../kv/props';
import { propsOf } from '../kv/props';
import type { KvNode } from '../kv/types';
import { parseCached } from '../scene/build';
import type { CondEnv } from '../scheme/cond';
import type { BlockMember, BlockRule } from './types';

export interface PanelRef {
  file: string;
  /** Key path from the file root. */
  path: string[];
  /** The entry's key. */
  name: string;
  /** Lower-case `ControlName`. */
  control: string;
}

/** `*` matches within a path segment; everything else is literal. */
export function globToRegExp(glob: string): RegExp {
  const src = glob
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${src}$`, 'i');
}

/** Every panel that names a control in a panel file, nested ones included. */
export function listPanels(text: string, file: string, env: CondEnv): PanelRef[] {
  const doc = parseCached(text);
  const top = doc.roots.find((n) => n.children) ?? doc.roots[0];
  if (!top?.children) return [];
  const out: PanelRef[] = [];
  const walk = (entries: KvNode[], prefix: string[]) => {
    for (const e of entries) {
      if (!e.children) continue;
      const control = propsOf(e, { env }).get('controlname');
      const path = [...prefix, e.key.text];
      if (control) {
        out.push({ file, path, name: e.key.text, control: control.toLowerCase() });
        walk(activeEntries(e, env), path);
      }
    }
  };
  walk(activeEntries(top, env), [top.key.text]);
  return out;
}

export function ruleMatchesFile(rule: BlockRule, file: string): boolean {
  return rule.files.some((g) => globToRegExp(g).test(file));
}

export function ruleFiles(rule: BlockRule, paths: readonly string[]): string[] {
  const res = rule.files.map(globToRegExp);
  return paths.filter((p) => res.some((r) => r.test(p)));
}

function nameTest(rule: BlockRule): ((name: string) => boolean) | undefined {
  if (!rule.name) return undefined;
  try {
    const re = new RegExp(rule.name, 'i');
    return (n) => re.test(n);
  } catch {
    return () => false;
  }
}

/** The members a rule finds right now. Files that are not loaded yet are skipped. */
export function resolveRule(
  rule: BlockRule,
  paths: readonly string[],
  read: (path: string) => string | undefined,
  env: CondEnv,
): BlockMember[] {
  const controls = rule.controls ? new Set(rule.controls.map((c) => c.toLowerCase())) : undefined;
  const nameOk = nameTest(rule);
  const out: BlockMember[] = [];
  for (const file of ruleFiles(rule, paths)) {
    const text = read(file);
    if (text === undefined) continue;
    for (const p of listPanels(text, file, env)) {
      if (controls && !controls.has(p.control)) continue;
      if (nameOk && !nameOk(p.name)) continue;
      out.push({ file: p.file, path: p.path, pinned: [] });
    }
  }
  return out;
}
