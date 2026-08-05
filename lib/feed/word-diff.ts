/**
 * Word-level diff for public edit history (F23).
 *
 * `RMHarkEdit` has always stored every previous version of a post; readers only
 * ever saw an "edited" marker, which is the situation that makes an edit
 * feature feel *untrustworthy* on a platform where posts are quoted and
 * screenshotted. This module is the missing half: given two versions, say
 * exactly what changed.
 *
 * Deliberately pure and client-safe (no Prisma, no `node:*`) so the diff runs
 * in the reader's browser off a plain version list, and so it is unit-testable
 * without a database.
 *
 * Word-level rather than character-level because a character diff of prose is
 * unreadable — it shreds words into runs of one or two letters. Tokens keep
 * whitespace as its own token, so re-flowing a line does not read as a rewrite
 * of every word on it.
 */

/** What happened to a run of tokens between two versions. */
export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffPart {
  op: DiffOp;
  value: string;
}

/**
 * Above this many differing tokens on either side the LCS table stops being
 * worth its memory, and the diff stops being readable anyway — a rewrite that
 * changed 400 words is a rewrite, not an edit. Past it we emit one delete plus
 * one insert, which is the honest rendering of "this was replaced".
 *
 * A post body is capped at `MAX_RMHARK_LENGTH` (280) today, so this is a
 * guard for the long-form callers (creator posts, wiki pages) rather than a
 * limit anyone reaches from the feed.
 */
export const DIFF_TOKEN_LIMIT = 600;

/**
 * Split into alternating word / whitespace tokens.
 *
 * Whitespace is kept as tokens rather than trimmed so that reassembling the
 * parts reproduces the input byte-for-byte — a diff that silently normalises
 * spacing would show phantom changes on a post whose only edit was a line
 * break.
 */
export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.split(/(\s+)/u).filter((token) => token.length > 0);
}

/** Merge neighbouring parts that share an op, so the DOM gets one node per run. */
function coalesce(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const part of parts) {
    if (part.value === '') continue;
    const last = out[out.length - 1];
    if (last && last.op === part.op) last.value += part.value;
    else out.push({ op: part.op, value: part.value });
  }
  return out;
}

/**
 * Longest-common-subsequence backtrace over two token arrays.
 *
 * `Uint32Array` rather than nested JS arrays: the table is the only allocation
 * that scales with input size, and a flat typed array keeps it to 4 bytes a
 * cell instead of a boxed number plus array overhead.
 */
function lcsDiff(a: string[], b: string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + (j + 1)] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push({ op: 'equal', value: a[i] });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
      parts.push({ op: 'delete', value: a[i] });
      i++;
    } else {
      parts.push({ op: 'insert', value: b[j] });
      j++;
    }
  }
  while (i < n) parts.push({ op: 'delete', value: a[i++] });
  while (j < m) parts.push({ op: 'insert', value: b[j++] });
  return parts;
}

/**
 * Diff `before` → `after` at word granularity.
 *
 * The common prefix and suffix are peeled off first. That is not only a speed
 * optimisation: for the overwhelmingly common edit (a typo fixed in the middle
 * of a sentence) it also keeps the LCS from finding a "cheaper" alignment that
 * scatters single-word matches across the whole post.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) {
    return before ? [{ op: 'equal', value: before }] : [];
  }

  const a = tokenizeWords(before);
  const b = tokenizeWords(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end++;
  }

  const prefix = a.slice(0, start).join('');
  const suffix = a.slice(a.length - end).join('');
  const midA = a.slice(start, a.length - end);
  const midB = b.slice(start, b.length - end);

  const middle: DiffPart[] =
    midA.length > DIFF_TOKEN_LIMIT || midB.length > DIFF_TOKEN_LIMIT
      ? [
          { op: 'delete', value: midA.join('') },
          { op: 'insert', value: midB.join('') },
        ]
      : lcsDiff(midA, midB);

  return coalesce([
    { op: 'equal', value: prefix },
    ...middle,
    { op: 'equal', value: suffix },
  ]);
}

/** Added / removed word counts, for the "+3 −1" summary above a diff. */
export function diffStat(parts: DiffPart[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    if (part.op === 'equal') continue;
    const words = part.value.split(/\s+/u).filter(Boolean).length;
    if (part.op === 'insert') added += words;
    else removed += words;
  }
  return { added, removed };
}

/* -------------------------------------------------------------------------- */
/* Version list                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One historical state of a post, oldest first. `at` is when this version
 * *became* the visible one — for the original that is the post's creation time.
 */
export interface PostVersion {
  content: string;
  /** ISO-8601. */
  at: string;
}

/**
 * Rebuild the ordered version list from the stored edit rows.
 *
 * `RMHarkEdit` stores the content that was *replaced*, stamped with the moment
 * of replacement. So row `i` carries version `i`'s text and version `i + 1`'s
 * start time — an off-by-one that is easy to get backwards and would silently
 * mislabel every timestamp in the history, which is why it lives here once
 * with a test rather than inline in a route.
 */
export function buildVersions(
  post: { content: string; createdAt: string; editedAt: string | null },
  edits: { content: string; createdAt: string }[],
): PostVersion[] {
  const ordered = [...edits].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const versions: PostVersion[] = ordered.map((edit, index) => ({
    content: edit.content,
    at: index === 0 ? post.createdAt : ordered[index - 1].createdAt,
  }));
  versions.push({
    content: post.content,
    at: ordered.length > 0 ? ordered[ordered.length - 1].createdAt : (post.editedAt ?? post.createdAt),
  });
  return versions;
}
