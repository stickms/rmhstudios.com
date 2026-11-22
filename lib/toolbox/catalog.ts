/**
 * The Toolbox catalog: every tool under `/tools`, in the order the hub lists them.
 *
 * Client-safe data only. The hub (`components/toolbox/ToolboxHub.tsx`) renders it, each
 * tool's route reads its own entry, and `lib/toolbox/__tests__/catalog.test.ts` holds that
 * every entry has a route file and that slugs are unique. Names and descriptions are not
 * here: they are `t()` strings in `components/toolbox/tool-copy.ts`, so they translate.
 *
 * Every tool runs entirely in the browser. Nothing a visitor types into a tool is sent
 * to the server, which is the reason none of them has an API route.
 */

export type ToolCategory = 'text' | 'developer' | 'numbers' | 'time' | 'everyday';

export const TOOL_CATEGORIES: readonly ToolCategory[] = ['text', 'developer', 'numbers', 'time', 'everyday'];

export interface ToolEntry {
  /** The path segment under `/tools/`. Stable: it is a public URL. */
  slug: string;
  category: ToolCategory;
  /** Extra words the hub's filter matches, beyond the translated name and description. */
  keywords: readonly string[];
}

export const TOOLS: readonly ToolEntry[] = [
  { slug: 'text-stats', category: 'text', keywords: ['word count', 'characters', 'reading time'] },
  { slug: 'case', category: 'text', keywords: ['camel', 'snake', 'kebab', 'title case'] },
  { slug: 'diff', category: 'text', keywords: ['compare', 'changes', 'difference'] },
  { slug: 'json', category: 'developer', keywords: ['format', 'validate', 'minify', 'pretty'] },
  { slug: 'csv', category: 'developer', keywords: ['spreadsheet', 'json', 'convert', 'table'] },
  { slug: 'regex', category: 'developer', keywords: ['regular expression', 'match', 'pattern'] },
  { slug: 'encode', category: 'developer', keywords: ['base64', 'url', 'html entities', 'hex'] },
  { slug: 'hash', category: 'developer', keywords: ['sha', 'checksum', 'digest', 'verify'] },
  { slug: 'ids', category: 'developer', keywords: ['uuid', 'ulid', 'nanoid', 'guid'] },
  { slug: 'cron', category: 'developer', keywords: ['schedule', 'crontab', 'next run'] },
  { slug: 'contrast', category: 'developer', keywords: ['wcag', 'colour', 'color', 'accessibility'] },
  { slug: 'base', category: 'numbers', keywords: ['binary', 'hex', 'octal', 'radix'] },
  { slug: 'loan', category: 'numbers', keywords: ['mortgage', 'interest', 'amortization'] },
  { slug: 'split-bill', category: 'numbers', keywords: ['tip', 'restaurant', 'share'] },
  { slug: 'timestamp', category: 'time', keywords: ['unix', 'epoch', 'iso 8601'] },
  { slug: 'timezones', category: 'time', keywords: ['world clock', 'time zone', 'meeting'] },
  { slug: 'date-calc', category: 'time', keywords: ['days between', 'business days', 'add days'] },
  { slug: 'password', category: 'everyday', keywords: ['passphrase', 'generator', 'strength'] },
  { slug: 'dice', category: 'everyday', keywords: ['d20', 'roll', 'tabletop'] },
  { slug: 'picker', category: 'everyday', keywords: ['random', 'teams', 'raffle', 'shuffle'] },
];

export type ToolSlug = (typeof TOOLS)[number]['slug'];

export function toolBySlug(slug: string): ToolEntry | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

/**
 * Filter for the hub: every whitespace-separated term must appear in the tool's
 * searchable text (its translated name and description plus its keywords).
 */
export function matchesToolQuery(haystack: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = haystack.toLowerCase();
  return terms.every((term) => text.includes(term));
}
