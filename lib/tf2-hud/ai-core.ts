/**
 * The HUD assistant's pure half, shared by the server route and the editor.
 *
 * The model never writes files. It proposes small changes ("set this key to that value", "remove
 * that key") against the files it was shown, and {@link applyChanges} carries them out with the
 * editor's own lossless KeyValues edits: only the bytes of the changed value are touched, a change
 * to a file it was not shown or a key that does not exist as a value is rejected, and a file that no
 * longer parses cleanly afterwards is left exactly as it was. What the player is told about is what
 * actually changed (before and after), not what the model says it did.
 */

import { kvRemove, kvSet } from './kv/edit';
import { parseKv } from './kv/parse';
import { kvAt } from './kv/query';

export const HUD_AI_LIMITS = {
  message: 600,
  history: 6,
  historyChars: 600,
  /** Files the model may be shown to edit in one request. */
  files: 4,
  /** Characters of one file sent to the model. */
  fileChars: 14_000,
  /** Characters of all files together. */
  totalChars: 48_000,
  paths: 400,
  changes: 60,
  valueChars: 200,
  pathDepth: 8,
} as const;

export interface HudChange {
  file: string;
  op: 'set' | 'remove';
  /** Key path inside the file, outermost first: `["HudPlayerHealth","PlayerStatusHealthValue","xpos"]`. */
  path: string[];
  value?: string;
}

export interface AppliedChange {
  file: string;
  op: 'set' | 'remove';
  path: string[];
  /** The value before (null when the key did not exist). */
  before: string | null;
  /** The value after (null when removed). */
  after: string | null;
}

export interface RejectedChange {
  change: HudChange;
  reason: 'unknown-file' | 'bad-change' | 'not-a-value' | 'missing' | 'broke-file';
}

/** Keep only paths the editor offered, in the order given, without repeats. */
export function validateSelection(raw: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const p of raw) {
    if (typeof p === 'string' && allowed.has(p) && !out.includes(p)) out.push(p);
    if (out.length >= HUD_AI_LIMITS.files) break;
  }
  return out;
}

// eslint-disable-next-line no-control-regex -- control characters are rejected on purpose
const SAFE_VALUE = /^[^\u0000-\u001f\u007f]*$/;

/** Normalise the model's change list; anything malformed is dropped here and counted by the caller. */
export function parseChanges(raw: unknown): { changes: HudChange[]; malformed: number } {
  const list = Array.isArray(raw) ? raw : [];
  const changes: HudChange[] = [];
  let malformed = 0;
  for (const c of list.slice(0, HUD_AI_LIMITS.changes)) {
    const o = (c ?? {}) as Record<string, unknown>;
    const path = o.path;
    const ok =
      typeof o.file === 'string' &&
      (o.op === 'set' || o.op === 'remove') &&
      Array.isArray(path) &&
      path.length > 0 &&
      path.length <= HUD_AI_LIMITS.pathDepth &&
      path.every((s) => typeof s === 'string' && s.length > 0 && s.length <= 80) &&
      (o.op === 'remove' ||
        (typeof o.value === 'string' &&
          o.value.length <= HUD_AI_LIMITS.valueChars &&
          SAFE_VALUE.test(o.value)));
    if (!ok) {
      malformed++;
      continue;
    }
    changes.push({
      file: o.file as string,
      op: o.op as 'set' | 'remove',
      path: path as string[],
      ...(o.op === 'set' ? { value: o.value as string } : {}),
    });
  }
  return { changes, malformed };
}

const errorsIn = (text: string): number =>
  parseKv(text).diagnostics.filter((d) => d.severity === 'error').length;

/**
 * Carry out `changes` against `files` (path → current text). Returns the new text of each file that
 * changed, what was done, and what was refused and why.
 */
export function applyChanges(
  files: Readonly<Record<string, string>>,
  changes: readonly HudChange[],
): { files: Record<string, string>; applied: AppliedChange[]; rejected: RejectedChange[] } {
  const next: Record<string, string> = {};
  const applied: AppliedChange[] = [];
  const rejected: RejectedChange[] = [];
  const reject = (change: HudChange, reason: RejectedChange['reason']) =>
    rejected.push({ change, reason });

  // Group per file so one file's problem cannot undo another's work.
  const byFile = new Map<string, HudChange[]>();
  for (const c of changes) {
    if (!(c.file in files)) {
      reject(c, 'unknown-file');
      continue;
    }
    byFile.set(c.file, [...(byFile.get(c.file) ?? []), c]);
  }

  for (const [file, list] of byFile) {
    const original = files[file];
    const baseline = errorsIn(original);
    let text = original;
    const done: AppliedChange[] = [];
    for (const c of list) {
      const node = kvAt(parseKv(text), c.path);
      const before = node?.value?.text ?? null;
      if (c.op === 'set') {
        if (node && !node.value) {
          reject(c, 'not-a-value'); // a block, not a value
          continue;
        }
        const out = kvSet(text, c.path, c.value as string);
        if (out === text && before === c.value) continue; // already that value
        if (out === text) {
          reject(c, 'bad-change');
          continue;
        }
        text = out;
        done.push({ file, op: 'set', path: c.path, before, after: c.value as string });
      } else {
        if (!node) {
          reject(c, 'missing');
          continue;
        }
        text = kvRemove(text, c.path);
        done.push({ file, op: 'remove', path: c.path, before: before, after: null });
      }
    }
    if (text !== original && errorsIn(text) > baseline) {
      for (const d of done) reject({ file, op: d.op, path: d.path, value: d.after ?? undefined }, 'broke-file');
      continue;
    }
    if (text !== original) {
      next[file] = text;
      applied.push(...done);
    }
  }
  return { files: next, applied, rejected };
}

/**
 * What the model is shown of a file. The client scheme is mostly fonts and borders, so only its colours
 * and base settings are sent; any other file is sent whole up to the limit (and marked when cut).
 */
export function excerptForAi(path: string, text: string): string {
  if (/(^|\/)clientscheme\.res$/i.test(path)) {
    const doc = parseKv(text);
    const scheme = kvAt(doc, ['Scheme']);
    const parts: string[] = [];
    for (const name of ['Colors', 'BaseSettings']) {
      const node = scheme ? kvAt(scheme, [name]) : undefined;
      if (node?.open && node.close) {
        parts.push(`${name}\n${text.slice(node.open.start, node.close.end)}`);
      }
    }
    if (parts.length) return `// excerpt: the scheme's Colors and BaseSettings\n${parts.join('\n')}`.slice(0, HUD_AI_LIMITS.fileChars);
  }
  return text.length > HUD_AI_LIMITS.fileChars
    ? `${text.slice(0, HUD_AI_LIMITS.fileChars)}\n// … (file continues)`
    : text;
}
