/**
 * Pairs SDN thread stems and summary pages with registry schools (pure).
 *
 * A stem or summary is attached only when exactly one school of the right
 * degree agrees on a normalised name; anything else goes to `review` for a
 * human decision in data/medschools/sdn-overrides.json. Never guesses.
 */
import type { RegistrySchool } from '../scrape/registry';
import { summaryKey } from './sdn-title';

export type SdnOverride =
  | {
      cycletrackKey: string;
    }
  | {
      ignore: true;
    };

export interface SdnAliasEntry {
  cycletrackKey: string;
  threadStems: string[];
  summary?: {
    code: string;
    slug: string;
  };
}

const DROP_PHRASES = [
  'school of medicine',
  'college of osteopathic medicine',
  'college of medicine',
  'university',
  'the',
  'of',
  'at',
];
const DROP_RE = new RegExp(`\\b(?:${DROP_PHRASES.join('|')})\\b`, 'g');

/** Comparison key: lowercase, `&` -> and, punctuation out, generic school words dropped. */
export function comparisonKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(DROP_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const keyOf = (s: RegistrySchool): string => s.aliases.find((a) => a.source === 'CYCLETRACK')?.sourceKey ?? s.shortName;

export function matchSdnStems(input: {
  stems: Array<{
    stem: string;
    degree: 'MD' | 'DO';
  }>;
  schools: RegistrySchool[];
  summaries: Array<{
    code: string;
    slug: string;
    name: string;
  }>;
  overrides: Record<string, SdnOverride>;
}): {
  aliases: SdnAliasEntry[];
  review: string[];
  ignored: string[];
} {
  const index = new Map<string, RegistrySchool[]>();
  for (const s of input.schools)
    for (const n of new Set([comparisonKey(s.name), comparisonKey(s.shortName)])) {
      if (!n) continue;
      index.set(n, [...(index.get(n) ?? []), s]);
    }
  const find = (name: string, degree: 'MD' | 'DO' | null): string | null => {
    const hits = [
      ...new Set(
        (index.get(comparisonKey(name)) ?? []).filter((s) => degree === null || s.degree === degree).map(keyOf),
      ),
    ];
    return hits.length === 1 ? hits[0]! : null;
  };

  const byKey = new Map<string, SdnAliasEntry>();
  const entry = (cycletrackKey: string): SdnAliasEntry => {
    let e = byKey.get(cycletrackKey);
    if (!e) {
      e = {
        cycletrackKey,
        threadStems: [],
      };
      byKey.set(cycletrackKey, e);
    }
    return e;
  };
  const review: string[] = [];
  const ignored: string[] = [];
  const settle = (overrideKey: string, guess: () => string | null): string | null => {
    const o = input.overrides[overrideKey];
    if (o && 'ignore' in o) {
      ignored.push(overrideKey);
      return null;
    }
    const target = o ? o.cycletrackKey : guess();
    if (target === null) review.push(overrideKey);
    return target;
  };

  for (const { stem, degree } of input.stems) {
    const target = settle(stem, () => find(stem, degree));
    if (target === null) continue;
    const e = entry(target);
    if (!e.threadStems.includes(stem)) e.threadStems.push(stem);
  }
  // A school claimed by two summaries is ambiguous: neither is trusted (an override is).
  const claims = new Map<
    string,
    Array<{
      code: string;
      slug: string;
      forced: boolean;
    }>
  >();
  for (const sm of input.summaries) {
    const key = summaryKey(sm.code, sm.slug);
    const target = settle(key, () => find(sm.name, null));
    if (target === null) continue;
    claims.set(target, [
      ...(claims.get(target) ?? []),
      {
        code: sm.code,
        slug: sm.slug,
        forced: key in input.overrides,
      },
    ]);
  }
  for (const [target, list] of claims) {
    const forced = list.filter((c) => c.forced);
    const pick = list.length === 1 ? list[0] : forced.length === 1 ? forced[0] : undefined;
    if (pick)
      entry(target).summary = {
        code: pick.code,
        slug: pick.slug,
      };
    else for (const c of list) review.push(summaryKey(c.code, c.slug));
  }

  const aliases = [...byKey.values()]
    .map((e) => ({
      ...e,
      threadStems: [...e.threadStems].sort(),
    }))
    .sort((a, b) => a.cycletrackKey.localeCompare(b.cycletrackKey));
  return {
    aliases,
    review: [...review].sort(),
    ignored: [...ignored].sort(),
  };
}
