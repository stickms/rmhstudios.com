'use client';

import { useRef, useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { Search, ChevronDown, X, User, Plus, Award } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { useSession } from '@/components/Providers';
import type { BuildCategory, BuildSortOption } from '@/lib/user-builds-types';

interface BuildFiltersProps {
  categories: BuildCategory[];
  selectedCategory?: string;
  selectedSort: BuildSortOption;
  searchQuery?: string;
  myBuilds?: boolean;
  curated?: boolean;
  onCategoryChange: (category: string | undefined) => void;
  onSortChange: (sort: BuildSortOption) => void;
  onSearchChange: (query: string) => void;
  onMyBuildsChange: (myBuilds: boolean) => void;
  onCuratedChange: (curated: boolean) => void;
}

const SORT_OPTIONS_VALUES: { value: BuildSortOption; labelKey: string; labelDefault: string }[] = [
  { value: 'recent', labelKey: 'sort-most-recent', labelDefault: 'Most Recent' },
  { value: 'popular', labelKey: 'sort-most-liked', labelDefault: 'Most Liked' },
  { value: 'views', labelKey: 'sort-most-viewed', labelDefault: 'Most Viewed' },
];

export function BuildFilters({
  categories,
  selectedCategory,
  selectedSort,
  searchQuery = '',
  myBuilds = false,
  curated = false,
  onCategoryChange,
  onSortChange,
  onSearchChange,
  onMyBuildsChange,
  onCuratedChange,
}: BuildFiltersProps) {
  const { t } = useTranslation('c-user-builds');
  const { data: session } = useSession();
  const [search, setSearch] = useState(searchQuery);
  const [showCategories, setShowCategories] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  // Staying mounted for the close, the outside press, Escape, focus return and
  // the arrow keys all live in AnchoredMenu now. Both panels used to be in-place
  // `absolute top-full … z-50` divs with a `fixed inset-0` click-catcher under
  // them — measured inside `.radial-frame`'s stacking context (pinned at
  // z-index 1), so they painted under the shell's top bar. They portal now, and
  // AnchoredMenu caps each panel to the room its side actually has, which is
  // what the category menu's `max-h-64` was approximating.
  // Both menus are an exclusive choice, so their rows are `menuitemradio` with a
  // trailing check rather than an accent-tinted button.

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== searchQuery) {
        onSearchChange(search);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchQuery, onSearchChange]);

  const SORT_OPTIONS = SORT_OPTIONS_VALUES.map((o) => ({
    ...o,
    label: t(o.labelKey, { defaultValue: o.labelDefault }),
  }));
  const selectedCategoryData = categories.find((c) => c.id === selectedCategory);
  const selectedSortData = SORT_OPTIONS.find((s) => s.value === selectedSort);

  return (
    <div className="flex flex-col gap-3 mb-6">
      {/* Search + Filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
          <input
            type="text"
            placeholder={t('search-builds', { defaultValue: 'Search builds...' })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2 rounded-site-sm bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-site-accent/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-site-text-dim hover:text-site-text"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Link
          to="/user-builds/submit"
          className="flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-site-sm bg-site-accent hover:bg-site-accent text-site-accent-fg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('submit', { defaultValue: 'Submit' })}</span>
        </Link>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Category Filter */}
        <div className="relative">
          <button
            ref={categoryTriggerRef}
            onClick={() => setShowCategories(!showCategories)}
            aria-haspopup="menu"
            aria-expanded={showCategories}
            className="flex items-center gap-2 px-4 py-2 rounded-site-sm bg-site-surface border border-site-border text-sm text-site-text hover:border-site-accent/50 transition-colors min-w-[140px]"
          >
            <span className="truncate">
              {selectedCategoryData?.name ||
                t('all-categories', { defaultValue: 'All Categories' })}
            </span>
            <ChevronDown
              className={`w-4 h-4 ml-auto transition-transform ${showCategories ? 'rotate-180' : ''}`}
            />
          </button>

          <AnchoredMenu
            open={showCategories}
            onClose={() => setShowCategories(false)}
            anchorRef={categoryTriggerRef}
            label={t('label-category', { defaultValue: 'Category' })}
            className="w-48"
          >
            <MenuItem
              checked={!selectedCategory}
              onSelect={() => {
                onCategoryChange(undefined);
                setShowCategories(false);
              }}
            >
              {t('all-categories', { defaultValue: 'All Categories' })}
            </MenuItem>
            {categories.map((cat) => (
              <MenuItem
                key={cat.id}
                checked={selectedCategory === cat.id}
                // Stringified so a category with zero builds still reports it —
                // `hint` renders on truthiness, and 0 is falsy.
                hint={cat.buildCount !== undefined ? String(cat.buildCount) : undefined}
                onSelect={() => {
                  onCategoryChange(cat.id);
                  setShowCategories(false);
                }}
              >
                {cat.name}
              </MenuItem>
            ))}
          </AnchoredMenu>
        </div>

        {/* Sort */}
        <div className="relative">
          <button
            ref={sortTriggerRef}
            onClick={() => setShowSort(!showSort)}
            aria-haspopup="menu"
            aria-expanded={showSort}
            className="flex items-center gap-2 px-4 py-2 rounded-site-sm bg-site-surface border border-site-border text-sm text-site-text hover:border-site-accent/50 transition-colors min-w-[140px]"
          >
            <span>{selectedSortData?.label || t('sort-by', { defaultValue: 'Sort by' })}</span>
            <ChevronDown
              className={`w-4 h-4 ml-auto transition-transform ${showSort ? 'rotate-180' : ''}`}
            />
          </button>

          <AnchoredMenu
            open={showSort}
            onClose={() => setShowSort(false)}
            anchorRef={sortTriggerRef}
            label={t('sort-by', { defaultValue: 'Sort by' })}
            className="w-40"
          >
            {SORT_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                checked={selectedSort === option.value}
                onSelect={() => {
                  onSortChange(option.value);
                  setShowSort(false);
                }}
              >
                {option.label}
              </MenuItem>
            ))}
          </AnchoredMenu>
        </div>

        {/* Curated Toggle */}
        <button
          onClick={() => onCuratedChange(!curated)}
          className={`flex items-center gap-2 px-4 py-2 rounded-site-sm border text-sm transition-colors ${
            curated
              ? 'bg-site-warning/10 border-site-warning/40 text-site-warning'
              : 'bg-site-surface border-site-border text-site-text hover:border-site-warning/50'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>{t('curated', { defaultValue: 'Curated' })}</span>
        </button>

        {/* My Builds Toggle */}
        {session?.user && (
          <button
            onClick={() => onMyBuildsChange(!myBuilds)}
            className={`flex items-center gap-2 ml-auto px-4 py-2 rounded-site-sm border text-sm transition-colors ${
              myBuilds
                ? 'bg-site-accent/10 border-site-accent/40 text-site-accent'
                : 'bg-site-surface border-site-border text-site-text hover:border-site-accent/50'
            }`}
          >
            <User className="w-4 h-4" />
            <span>{t('my-builds', { defaultValue: 'My Builds' })}</span>
          </button>
        )}
      </div>
    </div>
  );
}
