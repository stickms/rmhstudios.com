/**
 * Regular-expression testing with the browser's own engine, so what matches
 * here matches in the visitor's JavaScript.
 *
 * Matching is capped (`MAX_MATCHES`) and a zero-length match always advances
 * the cursor, so a pattern like `a*` cannot loop forever. A pattern that
 * backtracks catastrophically can still be slow — that is the engine, and the
 * same pattern would hang production code too; the tool says so rather than
 * hiding it in a worker.
 */

export const MAX_MATCHES = 1000;

export const REGEX_FLAGS = ['g', 'i', 'm', 's', 'u', 'y'] as const;
export type RegexFlag = (typeof REGEX_FLAGS)[number];

export type CompileResult = { ok: true; regex: RegExp } | { ok: false; message: string };

/**
 * Compile `pattern` with `flags`. A pattern pasted as a literal (`/ab+c/gi`) is
 * unwrapped, and its flags are merged with the ones chosen.
 */
export function compileRegex(pattern: string, flags: string): CompileResult {
  let source = pattern;
  let allFlags = flags;
  const literal = /^\/(.*)\/([a-z]*)$/s.exec(pattern);
  if (literal) {
    source = literal[1] ?? '';
    allFlags += literal[2] ?? '';
  }
  // `d` gives group indices; always on, since highlighting needs them.
  const unique = [...new Set(`${allFlags}d`.split(''))].join('');
  try {
    return { ok: true, regex: new RegExp(source, unique) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export interface RegexGroup {
  /** 1-based group number. */
  index: number;
  name?: string;
  value?: string;
  start?: number;
  end?: number;
}

export interface RegexMatch {
  value: string;
  start: number;
  end: number;
  groups: RegexGroup[];
}

export interface MatchResult {
  matches: RegexMatch[];
  /** True when matching stopped at `MAX_MATCHES`. */
  truncated: boolean;
}

/** Every match of `regex` in `text` (just the first one without the `g` or `y` flag). */
export function findMatches(regex: RegExp, text: string, limit = MAX_MATCHES): MatchResult {
  const re = new RegExp(regex.source, regex.flags);
  const global = re.global || re.sticky;
  const names = new Map<number, string>();
  // Map group numbers to names by reading the source's capturing groups in order.
  let groupNo = 0;
  const groupRe = /\\.|\[(?:\\.|[^\]])*\]|\((\?<([A-Za-z_$][\w$]*)>|\?)?/g;
  for (const m of re.source.matchAll(groupRe)) {
    if (!m[0].startsWith('(')) continue;
    if (m[1] === '?') continue;
    groupNo++;
    if (m[2]) names.set(groupNo, m[2]);
  }
  const matches: RegexMatch[] = [];
  let truncated = false;
  re.lastIndex = 0;
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    const indices = (m as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices;
    const groups: RegexGroup[] = [];
    for (let i = 1; i < m.length; i++) {
      const span = indices?.[i];
      const name = names.get(i);
      const value = m[i];
      groups.push({
        index: i,
        ...(name ? { name } : {}),
        ...(value === undefined ? {} : { value }),
        ...(span ? { start: span[0], end: span[1] } : {}),
      });
    }
    matches.push({ value: m[0], start: m.index, end: m.index + m[0].length, groups });
    if (!global) break;
    if (m[0] === '') re.lastIndex = m.index + (re.unicode && (text.codePointAt(m.index) ?? 0) > 0xffff ? 2 : 1);
  }
  return { matches, truncated };
}

export interface Segment {
  text: string;
  /** Index into `matches`, or -1 for text between matches. */
  match: number;
}

/** Split `text` into alternating plain and matched runs for highlighting. */
export function segmentText(text: string, matches: readonly RegexMatch[]): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), match: -1 });
    if (m.end > m.start) out.push({ text: text.slice(m.start, m.end), match: i });
    cursor = Math.max(cursor, m.end);
  });
  if (cursor < text.length) out.push({ text: text.slice(cursor), match: -1 });
  return out;
}

/** What `text.replace(regex, replacement)` gives, with `$1`, `$<name>`, `$&` as JavaScript reads them. */
export function replacePreview(regex: RegExp, text: string, replacement: string): string {
  return text.replace(new RegExp(regex.source, regex.flags), replacement);
}
