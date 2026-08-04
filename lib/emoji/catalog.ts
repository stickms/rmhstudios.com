/**
 * The emoji catalog behind our own picker.
 *
 * ## Why we have a picker at all
 *
 * The site used `emoji-picker-react`, which is ~1 MB, has to be `React.lazy`'d
 * to keep it out of the bundle, renders in its own visual language rather than
 * the site's tokens, and — the reason it had to go — has no concept of custom
 * emoji. Once packs exist, the picker is the surface where they live, so a
 * third-party picker that cannot show them is a picker that hides the feature
 * people are paying for.
 *
 * Ours reads the 1,913 shortcodes already shipped in `shortcodes.json` (42 KB,
 * already used for `:shortcode:` completion), so the Unicode half costs nothing
 * new.
 *
 * ## Categorisation is by codepoint range, and it is approximate
 *
 * `shortcodes.json` is a flat `name → char` map with no group data, and the
 * real Unicode grouping lives in `emoji-test.txt`, which is 1.5 MB of source we
 * would have to ship or preprocess. Instead each emoji is classified by the
 * codepoint of its first scalar against the ranges below.
 *
 * That is genuinely approximate: Unicode's own groups are hand-curated and do
 * not follow block boundaries. It is right for the overwhelming majority of
 * emoji and wrong at the edges, which is an acceptable trade for a picker where
 * **search is the primary interaction** and categories are navigation. The test
 * file pins the classification of the emoji people actually reach for, so a
 * regression in the ranges is caught even though the mapping is not exhaustive.
 */

export const EMOJI_CATEGORIES = [
  'frequent',
  'custom',
  'smileys',
  'people',
  'nature',
  'food',
  'activity',
  'travel',
  'objects',
  'symbols',
  'flags',
] as const;

export type EmojiCategory = (typeof EMOJI_CATEGORIES)[number];

/** Categories that hold Unicode emoji (the others are assembled at runtime). */
export type UnicodeCategory = Exclude<EmojiCategory, 'frequent' | 'custom'>;

export interface CategoryMeta {
  id: EmojiCategory;
  labelKey: string;
  label: string;
  /** lucide icon name for the category rail. */
  icon: string;
}

export const CATEGORY_META: Record<EmojiCategory, CategoryMeta> = {
  frequent: {
    id: 'frequent',
    labelKey: 'emoji-cat-frequent',
    label: 'Frequently used',
    icon: 'Clock',
  },
  custom: { id: 'custom', labelKey: 'emoji-cat-custom', label: 'Your packs', icon: 'Sticker' },
  smileys: {
    id: 'smileys',
    labelKey: 'emoji-cat-smileys',
    label: 'Smileys & emotion',
    icon: 'Smile',
  },
  people: { id: 'people', labelKey: 'emoji-cat-people', label: 'People & body', icon: 'User' },
  nature: { id: 'nature', labelKey: 'emoji-cat-nature', label: 'Animals & nature', icon: 'Leaf' },
  food: { id: 'food', labelKey: 'emoji-cat-food', label: 'Food & drink', icon: 'Coffee' },
  activity: { id: 'activity', labelKey: 'emoji-cat-activity', label: 'Activities', icon: 'Trophy' },
  travel: { id: 'travel', labelKey: 'emoji-cat-travel', label: 'Travel & places', icon: 'Plane' },
  objects: { id: 'objects', labelKey: 'emoji-cat-objects', label: 'Objects', icon: 'Lightbulb' },
  symbols: { id: 'symbols', labelKey: 'emoji-cat-symbols', label: 'Symbols', icon: 'Hash' },
  flags: { id: 'flags', labelKey: 'emoji-cat-flags', label: 'Flags', icon: 'Flag' },
};

/**
 * Codepoint ranges, checked in order — the first match wins, so narrower ranges
 * are listed before the broad blocks they sit inside.
 */
const RANGES: ReadonlyArray<readonly [start: number, end: number, category: UnicodeCategory]> = [
  // Regional indicators — every flag is a pair of these.
  [0x1f1e6, 0x1f1ff, 'flags'],
  [0x1f3f3, 0x1f3f5, 'flags'], // waving/black/rosette (crossed flags handled below)
  [0x1f6a9, 0x1f6a9, 'flags'],

  // Hands and body parts sit inside the misc-symbols block, so they come first.
  [0x1f440, 0x1f450, 'people'],
  [0x1f464, 0x1f487, 'people'],
  [0x1f574, 0x1f57a, 'people'],
  [0x1f590, 0x1f596, 'people'],
  [0x1f645, 0x1f64f, 'people'],
  [0x1f6b4, 0x1f6b6, 'people'],
  [0x1f918, 0x1f91f, 'people'],
  [0x1f930, 0x1f93e, 'people'],
  [0x1f9b5, 0x1f9bb, 'people'],
  [0x1f9cd, 0x1f9df, 'people'],
  [0x1fac3, 0x1fac5, 'people'],
  [0x1faf0, 0x1faf8, 'people'],

  // Smileys.
  [0x1f600, 0x1f644, 'smileys'],
  [0x1f910, 0x1f917, 'smileys'],
  [0x1f920, 0x1f92f, 'smileys'],
  [0x1f970, 0x1f97a, 'smileys'],
  [0x1f9d0, 0x1f9d0, 'smileys'],
  [0x1fa78, 0x1fa7a, 'objects'],
  [0x2639, 0x263a, 'smileys'],

  // Animals & nature.
  [0x1f400, 0x1f43f, 'nature'],
  [0x1f330, 0x1f335, 'nature'],
  [0x1f337, 0x1f343, 'nature'],
  [0x1f980, 0x1f9ae, 'nature'],
  [0x1f31d, 0x1f321, 'nature'],
  [0x1f324, 0x1f32c, 'nature'],
  [0x2600, 0x2604, 'nature'],

  // Food & drink.
  [0x1f345, 0x1f37f, 'food'],
  [0x1f950, 0x1f96f, 'food'],
  [0x1f9c0, 0x1f9cc, 'food'],
  [0x1fad0, 0x1fadf, 'food'],

  // Singletons stranded in the Miscellaneous Symbols block (U+2600–26FF).
  // These have to precede the broad `symbols` catch-all below or they land
  // there — ☕ in "Symbols" is the failure the test file caught.
  [0x2615, 0x2615, 'food'], // hot beverage
  [0x231a, 0x231b, 'objects'], // watch, hourglass
  [0x260e, 0x260e, 'objects'], // telephone
  [0x2693, 0x2693, 'travel'], // anchor
  [0x26f5, 0x26f5, 'travel'], // sailboat
  [0x26fd, 0x26fd, 'travel'], // fuel pump
  [0x2708, 0x2708, 'travel'], // airplane
  [0x26f7, 0x26f9, 'people'], // skier, snowboarder, ball-bouncer
  [0x270a, 0x270d, 'people'], // fist, hands, writing hand

  // Activities (sport, games, celebration).
  [0x1f380, 0x1f3a0, 'activity'],
  [0x1f3ae, 0x1f3b3, 'activity'],
  [0x1f3c0, 0x1f3c9, 'activity'],
  [0x1f939, 0x1f94f, 'activity'],
  [0x26bd, 0x26be, 'activity'],

  // Travel & places.
  [0x1f680, 0x1f6a8, 'travel'],
  [0x1f6aa, 0x1f6b3, 'travel'],
  [0x1f3e0, 0x1f3f0, 'travel'],
  [0x1f30d, 0x1f31c, 'travel'],
  [0x1f5fa, 0x1f5ff, 'travel'],
  [0x1f68b, 0x1f6ff, 'travel'],

  // Objects.
  [0x1f4a0, 0x1f4ff, 'objects'],
  [0x1f500, 0x1f53d, 'symbols'],
  [0x1f550, 0x1f567, 'symbols'],
  [0x1f4b0, 0x1f4b9, 'objects'],
  [0x1f9f0, 0x1f9ff, 'objects'],
  [0x1f6e0, 0x1f6ec, 'objects'],
  [0x1f52a, 0x1f52c, 'objects'],

  // Symbols — the catch-alls, last.
  [0x1f191, 0x1f19a, 'symbols'],
  [0x1f200, 0x1f2ff, 'symbols'],
  [0x2190, 0x21ff, 'symbols'],
  [0x2300, 0x23ff, 'symbols'],
  [0x25a0, 0x25ff, 'symbols'],
  [0x2605, 0x2b55, 'symbols'],
  [0x3030, 0x303d, 'symbols'],
  [0x1f000, 0x1f0ff, 'activity'], // mahjong / playing cards
];

/**
 * Classify a single emoji. Falls back to `symbols`, which is where Unicode's
 * own miscellany lives and the least surprising place for an unknown.
 */
export function categorize(emoji: string): UnicodeCategory {
  const cp = emoji.codePointAt(0);
  if (cp === undefined) return 'symbols';

  // A flag is two regional indicators; a tag-sequence flag (England, Scotland)
  // starts with the black-flag base. Both are caught by the ranges, but the
  // ZWJ-joined "crossed flags" and "pirate flag" need the second scalar.
  if (emoji.length > 2 && /\u{1F3F4}|\u{1F1E6}/u.test(emoji)) return 'flags';

  for (const [start, end, category] of RANGES) {
    if (cp >= start && cp <= end) return category;
  }
  return 'symbols';
}

export interface CatalogEntry {
  /** The emoji character itself. */
  char: string;
  /** Primary shortcode, without colons. */
  name: string;
  /** Every shortcode that maps here, for search. */
  aliases: string[];
  category: UnicodeCategory;
}

/**
 * Build the grouped catalog from the shortcode map.
 *
 * Several shortcodes map to the same character (`smile`/`grin`, `satisfied`/
 * `laughing`), so entries are keyed by character and alternates become aliases
 * — otherwise the picker shows the same emoji four times and search feels
 * broken.
 */
export function buildCatalog(shortcodes: Record<string, string>): CatalogEntry[] {
  const byChar = new Map<string, CatalogEntry>();
  for (const [name, char] of Object.entries(shortcodes)) {
    const existing = byChar.get(char);
    if (existing) {
      existing.aliases.push(name);
      continue;
    }
    byChar.set(char, { char, name, aliases: [name], category: categorize(char) });
  }
  return [...byChar.values()];
}

/** Group a built catalog for the picker's category rail. */
export function groupByCategory(
  entries: readonly CatalogEntry[],
): Record<UnicodeCategory, CatalogEntry[]> {
  const out = {} as Record<UnicodeCategory, CatalogEntry[]>;
  for (const cat of EMOJI_CATEGORIES) {
    if (cat === 'frequent' || cat === 'custom') continue;
    out[cat] = [];
  }
  for (const e of entries) out[e.category].push(e);
  return out;
}

/**
 * Rank entries against a query.
 *
 * Exact alias beats prefix beats substring, so typing `cat` puts 🐱 above
 * 🎓 (`graduation-cap`). Ties keep catalog order, which is roughly Unicode's
 * own frequency ordering.
 */
export function searchCatalog(
  entries: readonly CatalogEntry[],
  query: string,
  limit = 60,
): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: Array<{ entry: CatalogEntry; score: number }> = [];
  for (const entry of entries) {
    let best = 0;
    for (const alias of entry.aliases) {
      if (alias === q) {
        best = 3;
        break;
      }
      if (alias.startsWith(q)) best = Math.max(best, 2);
      else if (alias.includes(q)) best = Math.max(best, 1);
    }
    if (best > 0) scored.push({ entry, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/* -------------------------------------------------------------------------- */
/* Frequently used                                                            */
/* -------------------------------------------------------------------------- */

const FREQUENT_KEY = 'rmh-emoji-frequent';
const FREQUENT_MAX = 32;

export interface FrequentEntry {
  /** Unicode char, or `custom:<itemId>` for a pack item. */
  key: string;
  count: number;
}

/** Read the frequency list. Never throws — a corrupt entry just resets it. */
export function readFrequent(storage?: Pick<Storage, 'getItem'>): FrequentEntry[] {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return [];
  try {
    const raw = store.getItem(FREQUENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is FrequentEntry =>
          typeof e?.key === 'string' && typeof e?.count === 'number' && e.count > 0,
      )
      .slice(0, FREQUENT_MAX);
  } catch {
    return [];
  }
}

/** Record a use and return the new list, most-used first. */
export function recordFrequent(key: string, current: readonly FrequentEntry[]): FrequentEntry[] {
  const next = current.map((e) => ({ ...e }));
  const hit = next.find((e) => e.key === key);
  if (hit) hit.count += 1;
  else next.push({ key, count: 1 });
  next.sort((a, b) => b.count - a.count);
  return next.slice(0, FREQUENT_MAX);
}

export function writeFrequent(
  entries: readonly FrequentEntry[],
  storage?: Pick<Storage, 'setItem'>,
): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  try {
    store.setItem(FREQUENT_KEY, JSON.stringify(entries));
  } catch {
    /* quota or private mode — frequency is a nicety, never an error */
  }
}
