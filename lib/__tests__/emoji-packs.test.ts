import { describe, it, expect } from 'vitest';
import shortcodes from '@/lib/emoji/shortcodes.json';
import {
  buildCatalog,
  groupByCategory,
  searchCatalog,
  categorize,
  readFrequent,
  recordFrequent,
  writeFrequent,
  EMOJI_CATEGORIES,
  CATEGORY_META,
} from '@/lib/emoji/catalog';
import {
  resolveCustomShortcodes,
  resolveShortcode,
  packUsableBy,
  packListable,
  slugifyPackName,
  shortcodeSchema,
  addItemSchema,
  createPackSchema,
  SHORTCODE_RE,
  type InstalledPack,
  type PackItem,
} from '@/lib/emoji/packs';

const MAP = shortcodes as Record<string, string>;
const CATALOG = buildCatalog(MAP);

function item(name: string, id = name): PackItem {
  return { id, name, kind: 'emoji', url: `https://cdn/${id}.webp`, alt: name, animated: false };
}
function pack(id: string, items: PackItem[]): InstalledPack {
  return {
    id,
    slug: id,
    name: id,
    description: null,
    kind: 'emoji',
    coverUrl: null,
    itemCount: items.length,
    subscriberCount: 0,
    owner: { id: 'u1', name: 'Owner', handle: 'owner' },
    items,
  };
}

describe('emoji catalog', () => {
  it('deduplicates characters that have several shortcodes', () => {
    // `smile` and `grin` etc. map to distinct chars, but `satisfied`/`laughing`
    // share one — the picker must not show it twice.
    const chars = CATALOG.map((e) => e.char);
    expect(chars.length).toBe(new Set(chars).size);
    expect(CATALOG.length).toBeLessThan(Object.keys(MAP).length);
  });

  it('keeps every shortcode reachable as an alias', () => {
    const aliases = new Set(CATALOG.flatMap((e) => e.aliases));
    const missing = Object.keys(MAP).filter((name) => !aliases.has(name));
    expect(missing).toEqual([]);
  });

  it('classifies the emoji people actually reach for', () => {
    // The ranges are approximate by construction, so pin the common cases.
    const cases: Array<[string, string]> = [
      ['😀', 'smileys'],
      ['😂', 'smileys'],
      ['❤️', 'symbols'],
      ['👍', 'people'],
      ['🙏', 'people'],
      ['🐱', 'nature'],
      ['🌳', 'nature'],
      ['🍕', 'food'],
      ['☕', 'food'],
      ['⚽', 'activity'],
      ['🎮', 'activity'],
      ['🚀', 'travel'],
      ['🏠', 'travel'],
      ['💡', 'objects'],
      ['🇺🇸', 'flags'],
      ['🇯🇵', 'flags'],
    ];
    for (const [emoji, expected] of cases) {
      expect({ emoji, cat: categorize(emoji) }).toEqual({ emoji, cat: expected });
    }
  });

  it('puts every entry in exactly one category', () => {
    const grouped = groupByCategory(CATALOG);
    const total = Object.values(grouped).reduce((n, list) => n + list.length, 0);
    expect(total).toBe(CATALOG.length);
  });

  it('fills every unicode category with something', () => {
    // An empty category is a dead tab in the picker.
    const grouped = groupByCategory(CATALOG);
    for (const [cat, list] of Object.entries(grouped)) {
      expect({ cat, empty: list.length === 0 }).toEqual({ cat, empty: false });
    }
  });

  it('has metadata for every category', () => {
    for (const cat of EMOJI_CATEGORIES) {
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(CATEGORY_META[cat].label.length).toBeGreaterThan(0);
      expect(CATEGORY_META[cat].icon.length).toBeGreaterThan(0);
    }
  });

  it('ranks an exact shortcode above a substring match', () => {
    const results = searchCatalog(CATALOG, 'cat');
    expect(results.length).toBeGreaterThan(0);
    // 🐱 is `cat` exactly; `graduation-cap` merely contains it.
    expect(results[0].aliases).toContain('cat');
  });

  it('prefers a prefix match over a substring match', () => {
    const results = searchCatalog(CATALOG, 'fire');
    const first = results[0];
    expect(first.aliases.some((a) => a.startsWith('fire'))).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(searchCatalog(CATALOG, '')).toEqual([]);
    expect(searchCatalog(CATALOG, '   ')).toEqual([]);
  });

  it('respects the result limit', () => {
    expect(searchCatalog(CATALOG, 'a', 10).length).toBeLessThanOrEqual(10);
  });
});

describe('frequently used', () => {
  function fakeStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  }

  it('round-trips through storage', () => {
    const store = fakeStorage();
    writeFrequent([{ key: '😀', count: 3 }], store);
    expect(readFrequent(store)).toEqual([{ key: '😀', count: 3 }]);
  });

  it('orders by use count', () => {
    let list = recordFrequent('😀', []);
    list = recordFrequent('🐱', list);
    list = recordFrequent('🐱', list);
    expect(list[0]).toEqual({ key: '🐱', count: 2 });
  });

  it('tracks custom items alongside unicode', () => {
    const list = recordFrequent('custom:abc123', recordFrequent('😀', []));
    expect(list.map((e) => e.key)).toContain('custom:abc123');
  });

  it('caps the list', () => {
    let list: ReturnType<typeof recordFrequent> = [];
    for (let i = 0; i < 100; i++) list = recordFrequent(`e${i}`, list);
    expect(list.length).toBeLessThanOrEqual(32);
  });

  it('survives corrupt storage', () => {
    const store = fakeStorage();
    store.setItem('rmh-emoji-frequent', '{not json');
    expect(readFrequent(store)).toEqual([]);
    store.setItem('rmh-emoji-frequent', JSON.stringify([{ nope: 1 }, { key: 'x', count: 2 }]));
    expect(readFrequent(store)).toEqual([{ key: 'x', count: 2 }]);
  });
});

describe('pack shortcode resolution', () => {
  it('lets an earlier pack win a collision', () => {
    const resolved = resolveCustomShortcodes([
      pack('first', [item('fire', 'A')]),
      pack('second', [item('fire', 'B')]),
    ]);
    expect(resolved.fire.id).toBe('A');
  });

  it('lets a custom shortcode shadow unicode', () => {
    const custom = resolveCustomShortcodes([pack('p', [item('fire', 'A')])]);
    const r = resolveShortcode('fire', custom, MAP);
    expect(r.kind).toBe('custom');
    expect(r.item?.id).toBe('A');
  });

  it('falls through to unicode when no pack claims the name', () => {
    const r = resolveShortcode('fire', {}, MAP);
    expect(r.kind).toBe('unicode');
    expect(r.char).toBe(MAP.fire);
  });

  it('reports an unknown shortcode rather than guessing', () => {
    expect(resolveShortcode('definitely-not-a-thing', {}, MAP).kind).toBe('none');
  });

  it('is case-insensitive', () => {
    const custom = resolveCustomShortcodes([pack('p', [item('fire')])]);
    expect(resolveShortcode('FIRE', custom, MAP).kind).toBe('custom');
  });
});

describe('pack visibility', () => {
  const base = { ownerId: 'owner', status: 'APPROVED', visibility: 'public' };

  it('lets anyone use an approved public pack', () => {
    expect(packUsableBy(base, 'someone')).toBe(true);
    expect(packUsableBy(base, null)).toBe(true);
  });

  it('hides an unapproved pack from everyone but its owner', () => {
    const pending = { ...base, status: 'PENDING' };
    expect(packUsableBy(pending, 'someone')).toBe(false);
    expect(packUsableBy(pending, 'owner')).toBe(true);
  });

  it('hides a removed pack even from its owner', () => {
    // Moderation must not be undone by ownership.
    expect(packUsableBy({ ...base, status: 'REMOVED' }, 'someone')).toBe(false);
  });

  it('keeps a private pack to its owner', () => {
    const priv = { ...base, visibility: 'private' };
    expect(packUsableBy(priv, 'someone')).toBe(false);
    expect(packUsableBy(priv, 'owner')).toBe(true);
  });

  it('lists only approved public packs', () => {
    expect(packListable({ status: 'APPROVED', visibility: 'public' })).toBe(true);
    expect(packListable({ status: 'APPROVED', visibility: 'unlisted' })).toBe(false);
    expect(packListable({ status: 'PENDING', visibility: 'public' })).toBe(false);
  });

  it('still lets an unlisted pack be used via its link', () => {
    expect(packUsableBy({ ...base, visibility: 'unlisted' }, 'someone')).toBe(true);
  });
});

describe('validation', () => {
  it('accepts ordinary shortcodes', () => {
    for (const good of ['fire', 'my_emoji', 'a1', 'x-y', 'plus+one']) {
      expect({ good, ok: shortcodeSchema.safeParse(good).success }).toEqual({ good, ok: true });
    }
  });

  it('rejects malformed shortcodes', () => {
    for (const bad of ['a', '', '-leading', 'has space', 'UPPER CASE!', 'a'.repeat(33), '💥']) {
      expect({ bad, ok: shortcodeSchema.safeParse(bad).success }).toEqual({ bad, ok: false });
    }
  });

  it('lowercases a shortcode rather than rejecting it', () => {
    const parsed = shortcodeSchema.safeParse('FIRE');
    expect(parsed.success && parsed.data).toBe('fire');
  });

  it('matches the regex the completion trigger uses', () => {
    // The `:` trigger in shortcode-matcher.ts accepts [a-z0-9_+-]{2,}; a custom
    // code outside that grammar would be untypeable.
    for (const e of ['fire', 'my_emoji', 'x-y']) expect(SHORTCODE_RE.test(e)).toBe(true);
  });

  it('requires alt text on every item', () => {
    const withAlt = addItemSchema.safeParse({ name: 'fire', mediaId: 'm1', alt: 'a flame' });
    expect(withAlt.success).toBe(true);
    for (const alt of ['', '   ']) {
      expect(addItemSchema.safeParse({ name: 'fire', mediaId: 'm1', alt }).success).toBe(false);
    }
    expect(addItemSchema.safeParse({ name: 'fire', mediaId: 'm1' }).success).toBe(false);
  });

  it('defaults a new pack to a public emoji pack', () => {
    const parsed = createPackSchema.safeParse({ name: 'My pack' });
    expect(parsed.success && parsed.data).toMatchObject({ kind: 'emoji', visibility: 'public' });
  });

  it('rejects an empty pack name', () => {
    expect(createPackSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('slugifyPackName', () => {
  it('makes a URL-safe slug', () => {
    expect(slugifyPackName('My Cool Pack!')).toBe('my-cool-pack');
    expect(slugifyPackName('  spaced  out  ')).toBe('spaced-out');
  });

  it('produces something usable from an unslugabble name', () => {
    const slug = slugifyPackName('🎉🎉🎉');
    expect(slug.length).toBeGreaterThanOrEqual(2);
    expect(/^[a-z0-9][a-z0-9-]*$/.test(slug)).toBe(true);
  });

  it('is deterministic', () => {
    expect(slugifyPackName('🎉')).toBe(slugifyPackName('🎉'));
  });

  it('bounds the length', () => {
    expect(slugifyPackName('word '.repeat(50)).length).toBeLessThanOrEqual(48);
  });
});
