/**
 * RMHType passage sources beyond the curated list (feature idea F3): real code
 * snippets and "lore" taken from the site's own news text. Pure and client-safe;
 * the server picks the passage (the text is what scoring is measured against).
 * Both sources are practice-only — a member-independent but non-comparable text
 * must not share a leaderboard with the curated list.
 */

export const SOLO_SOURCES = ['standard', 'code', 'lore'] as const;
export type SoloSource = (typeof SOLO_SOURCES)[number];

export function parseSoloSource(v: unknown): SoloSource {
  return SOLO_SOURCES.includes(v as SoloSource) ? (v as SoloSource) : 'standard';
}

/** 2-space indented, LF newlines, printable ASCII only. */
export const CODE_SNIPPETS: readonly { id: string; lang: string; text: string }[] = [
  {
    id: 'ts-debounce',
    lang: 'ts',
    text: 'function debounce(fn, wait) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), wait);\n  };\n}',
  },
  {
    id: 'py-fib',
    lang: 'py',
    text: 'def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a',
  },
  {
    id: 'go-worker',
    lang: 'go',
    text: 'func worker(jobs <-chan int, out chan<- int) {\n  for j := range jobs {\n    out <- j * 2\n  }\n}',
  },
  {
    id: 'rs-count',
    lang: 'rs',
    text: 'fn count_words(s: &str) -> usize {\n    s.split_whitespace().count()\n}',
  },
  {
    id: 'sql-top',
    lang: 'sql',
    text: "SELECT user_id, COUNT(*) AS posts\nFROM posts\nWHERE created_at > now() - interval '7 days'\nGROUP BY user_id\nORDER BY posts DESC\nLIMIT 10;",
  },
  {
    id: 'ts-groupby',
    lang: 'ts',
    text: 'const groupBy = (xs, key) =>\n  xs.reduce((acc, x) => {\n    (acc[x[key]] ||= []).push(x);\n    return acc;\n  }, {});',
  },
  {
    id: 'py-with',
    lang: 'py',
    text: 'with open(path) as f:\n    for line in f:\n        if "error" in line.lower():\n            print(line.strip())',
  },
  {
    id: 'css-card',
    lang: 'css',
    text: '.card {\n  display: grid;\n  gap: 0.75rem;\n  padding: 1rem;\n  border-radius: 12px;\n}',
  },
  {
    id: 'sh-backup',
    lang: 'sh',
    text: 'for f in *.log; do\n  gzip -9 "$f"\n  mv "$f.gz" archive/\ndone',
  },
  {
    id: 'ts-retry',
    lang: 'ts',
    text: 'async function retry(fn, tries = 3) {\n  for (let i = 0; i < tries; i++) {\n    try {\n      return await fn();\n    } catch (err) {\n      if (i === tries - 1) throw err;\n    }\n  }\n}',
  },
];

export function pickCodeSnippet(rand: () => number = Math.random) {
  return CODE_SNIPPETS[Math.floor(rand() * CODE_SNIPPETS.length)]!;
}

const LORE_TARGET: Record<string, number> = { short: 140, medium: 260, long: 420 };

/** Markdown/HTML news body -> a typable run of whole sentences, or null. */
export function extractLorePassage(
  content: string,
  length: string,
  rand: () => number = Math.random,
): string | null {
  const clean = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~|]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7e\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g)?.map((s) => s.trim()) ?? [];
  const usable = sentences.filter((s) => s.length >= 20 && s.length <= 300);
  if (usable.length === 0) return null;
  const target = LORE_TARGET[length] ?? LORE_TARGET.medium!;
  const start = Math.floor(rand() * usable.length);
  let out = '';
  for (let i = start; i < usable.length && out.length < target; i++) {
    out = out ? `${out} ${usable[i]}` : usable[i]!;
  }
  return out.length >= 60 ? out : null;
}

/**
 * After the typist presses Enter, fill in the next line's indentation so code
 * is typed for its content, not its leading spaces (as in most code typers).
 */
export function autoIndent(passage: string, typed: string): string {
  if (!typed.endsWith('\n') || passage[typed.length - 1] !== '\n') return typed;
  let out = typed;
  while (passage[out.length] === ' ') out += ' ';
  return out;
}

/** Backspacing into auto-filled indentation removes the whole indent at once. */
export function backspaceIndent(passage: string, prev: string, next: string): string {
  if (next.length >= prev.length || passage[next.length] !== ' ') return next;
  const lineStart = next.lastIndexOf('\n') + 1;
  if (lineStart === 0 || next.slice(lineStart).trim() !== '') return next;
  return next.slice(0, lineStart);
}
