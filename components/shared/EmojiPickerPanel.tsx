/**
 * The emoji picker.
 *
 * Replaces `emoji-picker-react`, which was ~1 MB, rendered in its own visual
 * language rather than the site's tokens, and — the reason it had to go — has
 * no concept of custom emoji. Once packs exist, the picker is where they live,
 * so a third-party picker that cannot show them is a picker that hides the
 * feature people pay for.
 *
 * The Unicode half costs no new bytes: it is built from the 1,913 shortcodes
 * already shipped for `:code:` completion (`lib/emoji/catalog.ts`).
 *
 * ## Design notes
 *
 * - The panel sits inside a popover that already carries the L4 overlay tier,
 *   so it adds **no** blurred tier of its own, and the emoji cells are repeated
 *   list items — per the material budget those carry no glass at all, just a
 *   hover tint.
 * - The category rail is a plain button row with `aria-pressed`, deliberately
 *   NOT a tablist: that ARIA grammar is reserved for `LiquidTabs` and CI
 *   enforces the reservation. (These are filter toggles, not tabs — the panel
 *   below is one scroller, not a set of swapped panels.)
 * - Cells are 44px on touch (the minimum target) and tighter with a mouse, so a
 *   phone gets a thumb-sized grid without wasting a desktop popover.
 *
 * The export signature is unchanged (`{ onSelect, width, height }`), so all 12
 * existing call sites keep working.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Coffee,
  Flag,
  Hash,
  Leaf,
  Lightbulb,
  Plane,
  Search,
  Smile,
  Sticker,
  Trophy,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  EMOJI_CATEGORIES,
  CATEGORY_META,
  buildCatalog,
  groupByCategory,
  searchCatalog,
  readFrequent,
  recordFrequent,
  writeFrequent,
  type CatalogEntry,
  type EmojiCategory,
  type FrequentEntry,
} from '@/lib/emoji/catalog';
import { loadShortcodes } from '@/lib/emoji/shortcodes';
import type { InstalledPack, PackItem } from '@/lib/emoji/packs';
import { cn } from '@/lib/utils';

interface EmojiPickerPanelProps {
  /**
   * Receives the emoji character, or `:shortcode:` for a custom pack item —
   * which is what the composer already knows how to render, so no call site
   * has to learn a second shape.
   */
  onSelect: (emoji: string) => void;
  width?: number | string;
  height?: number;
}

/**
 * Icon-name → component map for `CATEGORY_META.icon`.
 *
 * Deliberately an explicit map rather than `import * as Icons` + `Icons[name]`.
 * A namespace import that is indexed by a computed key is unshakeable: the
 * bundler cannot know which members are reachable, so it must retain all of
 * them. That one line put the whole lucide barrel (157 KB) and the 431 KB
 * `icons-*` chunk into this component's chunk — and because the composer's
 * picker is in the homepage's lazy-route graph, onto the homepage. Same shape
 * (and same reason) as `components/home/layout-icons.ts`.
 *
 * Keep in sync with `CATEGORY_META` in `lib/emoji/catalog.ts`; an unlisted name
 * falls back to `Smile`, exactly as the dynamic lookup did.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Clock,
  Coffee,
  Flag,
  Hash,
  Leaf,
  Lightbulb,
  Plane,
  Smile,
  Sticker,
  Trophy,
  User,
};

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = CATEGORY_ICONS[name] ?? Smile;
  return <Cmp className={className} />;
}

/** Category labels as literal `t()` calls — a computed key never extracts. */
function categoryLabels(
  t: (k: string, o: { defaultValue: string }) => string,
): Record<EmojiCategory, string> {
  return {
    frequent: t('emoji-cat-frequent', { defaultValue: 'Frequently used' }),
    custom: t('emoji-cat-custom', { defaultValue: 'Your packs' }),
    smileys: t('emoji-cat-smileys', { defaultValue: 'Smileys & emotion' }),
    people: t('emoji-cat-people', { defaultValue: 'People & body' }),
    nature: t('emoji-cat-nature', { defaultValue: 'Animals & nature' }),
    food: t('emoji-cat-food', { defaultValue: 'Food & drink' }),
    activity: t('emoji-cat-activity', { defaultValue: 'Activities' }),
    travel: t('emoji-cat-travel', { defaultValue: 'Travel & places' }),
    objects: t('emoji-cat-objects', { defaultValue: 'Objects' }),
    symbols: t('emoji-cat-symbols', { defaultValue: 'Symbols' }),
    flags: t('emoji-cat-flags', { defaultValue: 'Flags' }),
  };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pt-2 pb-1 text-xs font-semibold text-site-text-dim">{children}</p>;
}

export default function EmojiPickerPanel({
  onSelect,
  width = 320,
  height = 380,
}: EmojiPickerPanelProps) {
  const { t } = useTranslation('feed');
  const labels = categoryLabels(t);

  const [shortcodes, setShortcodes] = useState<Record<string, string> | null>(null);
  const [packs, setPacks] = useState<InstalledPack[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EmojiCategory>('smileys');
  const [frequent, setFrequent] = useState<FrequentEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The shortcode map is a lazy chunk shared with `:code:` completion, so this
  // is usually already warm.
  useEffect(() => {
    let alive = true;
    void loadShortcodes().then((map) => {
      if (alive) setShortcodes(map);
    });
    setFrequent(readFrequent());
    return () => {
      alive = false;
    };
  }, []);

  // Installed packs. A failure here is not an error state: the picker is fully
  // usable with Unicode alone, so the custom section simply doesn't appear.
  useEffect(() => {
    let alive = true;
    void fetch('/api/emoji-packs/installed')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { installed?: InstalledPack[] } | null) => {
        if (alive && body?.installed) setPacks(body.installed);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const catalog = useMemo(() => (shortcodes ? buildCatalog(shortcodes) : []), [shortcodes]);
  const grouped = useMemo(() => (catalog.length ? groupByCategory(catalog) : null), [catalog]);
  const customItems = useMemo(() => packs.flatMap((p) => p.items), [packs]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return {
      custom: customItems.filter((i) => i.name.includes(q)).slice(0, 24),
      unicode: searchCatalog(catalog, q, 60),
    };
  }, [query, catalog, customItems]);

  const pick = useCallback(
    (key: string, insert: string) => {
      const next = recordFrequent(key, frequent);
      setFrequent(next);
      writeFrequent(next);
      onSelect(insert);
    },
    [frequent, onSelect],
  );

  /** Resolve a stored frequent key back to something renderable. */
  const frequentEntries = useMemo(() => {
    return frequent
      .map((f) => {
        if (f.key.startsWith('custom:')) {
          const id = f.key.slice('custom:'.length);
          const item = customItems.find((i) => i.id === id);
          return item ? { kind: 'custom' as const, item } : null;
        }
        return { kind: 'unicode' as const, char: f.key };
      })
      .filter(Boolean)
      .slice(0, 24) as Array<
      { kind: 'custom'; item: PackItem } | { kind: 'unicode'; char: string }
    >;
  }, [frequent, customItems]);

  const visibleCategories = EMOJI_CATEGORIES.filter((c) => {
    if (c === 'frequent') return frequentEntries.length > 0;
    if (c === 'custom') return customItems.length > 0;
    return true;
  });

  // Jump the scroller to the top when the section changes, or a new category
  // opens mid-scroll and reads as nothing having happened.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [category, query]);

  const cellClass =
    'flex h-11 w-11 items-center justify-center rounded-site-sm text-2xl leading-none ' +
    'transition-colors hover:bg-site-surface-hover focus-visible:bg-site-surface-hover ' +
    'sm:h-9 sm:w-9 sm:text-xl';

  const gridClass = 'grid grid-cols-6 gap-0.5 sm:grid-cols-8';

  function UnicodeCell({ entry }: { entry: CatalogEntry }) {
    return (
      <button
        type="button"
        className={cellClass}
        onClick={() => pick(entry.char, entry.char)}
        title={`:${entry.name}:`}
        aria-label={entry.name}
      >
        {entry.char}
      </button>
    );
  }

  function CustomCell({ item }: { item: PackItem }) {
    return (
      <button
        type="button"
        className={cellClass}
        onClick={() => pick(`custom:${item.id}`, `:${item.name}:`)}
        title={`:${item.name}:`}
        aria-label={item.alt || item.name}
      >
        <img
          src={item.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-7 w-7 object-contain sm:h-6 sm:w-6"
        />
      </button>
    );
  }

  return (
    <div
      // No glass tier here: the popover that owns this panel is already L4.
      className="flex flex-col overflow-hidden rounded-site border border-site-border bg-site-bg"
      style={{ width, height, maxWidth: 'calc(100vw - 1.5rem)' }}
    >
      {/* Search */}
      <div className="shrink-0 p-2">
        <div className="glass-inset flex items-center gap-2 rounded-site-sm px-2">
          <Search className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('emoji-picker-search-placeholder', { defaultValue: 'Search emojis…' })}
            aria-label={t('emoji-picker-search-placeholder', { defaultValue: 'Search emojis…' })}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-site-text outline-none placeholder:text-site-text-dim"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('emoji-picker-clear', { defaultValue: 'Clear search' })}
              className="shrink-0 p-1 text-site-text-dim transition-colors hover:text-site-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!shortcodes ? (
          <p className="p-4 text-center text-sm text-site-text-dim">
            {t('emoji-picker-loading', { defaultValue: 'Loading…' })}
          </p>
        ) : results ? (
          results.custom.length + results.unicode.length === 0 ? (
            <p className="p-4 text-center text-sm text-site-text-dim">
              {t('emoji-picker-no-results', { defaultValue: 'No emoji found' })}
            </p>
          ) : (
            <>
              {results.custom.length > 0 && (
                <>
                  <SectionLabel>{labels.custom}</SectionLabel>
                  <div className={gridClass}>
                    {results.custom.map((item) => (
                      <CustomCell key={item.id} item={item} />
                    ))}
                  </div>
                </>
              )}
              {results.unicode.length > 0 && (
                <div className={gridClass}>
                  {results.unicode.map((entry) => (
                    <UnicodeCell key={entry.char} entry={entry} />
                  ))}
                </div>
              )}
            </>
          )
        ) : category === 'frequent' ? (
          <div className={gridClass}>
            {frequentEntries.map((e, i) =>
              e.kind === 'custom' ? (
                <CustomCell key={`f-${e.item.id}`} item={e.item} />
              ) : (
                <UnicodeCell
                  key={`f-${e.char}-${i}`}
                  entry={{ char: e.char, name: e.char, aliases: [], category: 'symbols' }}
                />
              ),
            )}
          </div>
        ) : category === 'custom' ? (
          <>
            {packs.map((pack) => (
              <div key={pack.id}>
                <SectionLabel>{pack.name}</SectionLabel>
                <div className={gridClass}>
                  {pack.items.map((item) => (
                    <CustomCell key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className={gridClass}>
            {(grouped?.[category] ?? []).map((entry) => (
              <UnicodeCell key={entry.char} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* Category rail — toggles, not tabs; the tablist grammar is LiquidTabs'. */}
      <nav
        className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-site-border px-1 py-1"
        aria-label={t('emoji-picker-categories', { defaultValue: 'Emoji categories' })}
      >
        {visibleCategories.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setQuery('');
              setCategory(id);
            }}
            aria-pressed={!query && category === id}
            aria-label={labels[id]}
            title={labels[id]}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-site-sm transition-colors',
              !query && category === id
                ? 'bg-site-accent-dim text-site-accent'
                : 'text-site-text-dim hover:text-site-text',
            )}
          >
            <CategoryIcon name={CATEGORY_META[id].icon} className="h-4 w-4" />
          </button>
        ))}
      </nav>
    </div>
  );
}
