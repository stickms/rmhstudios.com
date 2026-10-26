/**
 * HUD validation: the problems that make TF2 silently ignore a file or draw a
 * panel wrong, found before the author has to reload the game to see them.
 */

import { parseKv } from './kv/parse';
import { kvWalk } from './kv/query';
import { evalCond, PC_ENV, type CondEnv } from './scheme/cond';
import { imagePath } from './scene/build';
import { parseRgba, resolveColor, type Scheme } from './scheme/scheme';
import { categoryOf, extOf } from './project/paths';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  id: string;
  severity: Severity;
  code:
    | 'syntax'
    | 'missing-base'
    | 'unknown-font'
    | 'unknown-color'
    | 'unknown-border'
    | 'missing-texture'
    | 'misplaced'
    | 'uppercase-path'
    | 'oversized';
  path: string;
  message: string;
  line?: number;
  column?: number;
  /** Offset of the offending token, for jump-to-code. */
  offset?: number;
}

export interface ValidateInput {
  /** Files to check. */
  scope: readonly string[];
  readText(path: string): string | undefined;
  size(path: string): number | undefined;
  exists(path: string): boolean;
  scheme: Scheme;
  env?: CondEnv;
}

const TEXTURE_EXTS = ['png', 'jpg', 'jpeg', 'vtf', 'vmt'] as const;
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_SOUND = 4 * 1024 * 1024;
const MAX_FONT = 6 * 1024 * 1024;

const isColorKey = (k: string) => /colou?r(_override)?$/i.test(k) || /^(fg|bg)color/i.test(k);
const isFontKey = (k: string) => /^font(_|$)/i.test(k) || /font$/i.test(k);

export function validateFiles(input: ValidateInput): Issue[] {
  const env = input.env ?? PC_ENV;
  const issues: Issue[] = [];
  const push = (i: Omit<Issue, 'id'>) =>
    issues.push({ ...i, id: `${i.path}:${i.code}:${i.offset ?? issues.length}` });

  for (const path of input.scope) {
    const cat = categoryOf(path);

    if (path !== path.toLowerCase()) {
      push({
        severity: 'warning',
        code: 'uppercase-path',
        path,
        message: 'Use lowercase paths — TF2 on Linux and macOS is case-sensitive.',
      });
    }
    if (cat === 'panel' && !/^(resource|scripts)\//.test(path)) {
      push({
        severity: 'warning',
        code: 'misplaced',
        path,
        message: 'Panel files belong under resource/ (or scripts/ for layout files).',
      });
    }

    const size = input.size(path);
    if (size !== undefined) {
      const limit =
        cat === 'image' ? MAX_IMAGE : cat === 'sound' ? MAX_SOUND : cat === 'font' ? MAX_FONT : 0;
      if (limit && size > limit) {
        push({
          severity: 'warning',
          code: 'oversized',
          path,
          message: `File is ${(size / 1048576).toFixed(1)} MB; keep ${cat} files under ${(limit / 1048576).toFixed(0)} MB.`,
        });
      }
    }

    if (extOf(path) !== 'res' && extOf(path) !== 'txt') continue;
    const text = input.readText(path);
    if (text === undefined) continue;
    const doc = parseKv(text);

    for (const d of doc.diagnostics) {
      push({
        severity: d.severity,
        code: 'syntax',
        path,
        message: d.message,
        line: d.line,
        column: d.column,
        offset: d.offset,
      });
    }
    if (extOf(path) !== 'res') continue;

    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    for (const root of doc.roots) {
      if (root.key.text.toLowerCase() === '#base' && root.value) {
        const target = root.value.text.includes('/') ? root.value.text : dir + root.value.text;
        if (!input.exists(target.replace(/\\/g, '/'))) {
          push({
            severity: 'warning',
            code: 'missing-base',
            path,
            message: `#base target "${root.value.text}" does not exist.`,
            offset: root.value.start,
          });
        }
      }
    }

    const isScheme = cat === 'scheme';
    kvWalk(doc, (node) => {
      if (!node.value) return;
      if (!evalCond(node.cond?.text, env)) return;
      const key = node.key.text;
      const val = node.value.text;
      if (!isScheme && isFontKey(key) && key.toLowerCase() !== 'fontsize') {
        if (val && !input.scheme.fonts.has(val.toLowerCase())) {
          push({
            severity: 'warning',
            code: 'unknown-font',
            path,
            message: `Font "${val}" is not defined in clientscheme.res.`,
            offset: node.value.start,
          });
        }
      } else if (!isScheme && isColorKey(key)) {
        if (val && !parseRgba(val) && !resolveColor(input.scheme, val)) {
          push({
            severity: 'warning',
            code: 'unknown-color',
            path,
            message: `Colour "${val}" is not defined in the scheme.`,
            offset: node.value.start,
          });
        }
      } else if (!isScheme && /^border(_|$)/i.test(key)) {
        if (val && !input.scheme.borders.has(val.toLowerCase())) {
          push({
            severity: 'warning',
            code: 'unknown-border',
            path,
            message: `Border "${val}" is not defined in the scheme.`,
            offset: node.value.start,
          });
        }
      } else if (!isScheme && /^(image|icon|fg_image|bg_image|image_default)$/i.test(key) && val) {
        const base = imagePath(val);
        const found = TEXTURE_EXTS.some((e) => input.exists(`${base}.${e}`));
        if (!found) {
          push({
            severity: 'info',
            code: 'missing-texture',
            path,
            message: `Texture "${val}" is not in this HUD — TF2's own copy is used if it exists.`,
            offset: node.value.start,
          });
        }
      }
    });
  }

  const rank = { error: 0, warning: 1, info: 2 } as const;
  return issues.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      a.path.localeCompare(b.path) ||
      (a.offset ?? 0) - (b.offset ?? 0),
  );
}

export function countBySeverity(issues: readonly Issue[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const i of issues) out[i.severity]++;
  return out;
}
