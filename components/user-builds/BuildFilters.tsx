'use client';

import { useRef, useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, User, Plus, Award } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
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
    <div className="mb-6 flex flex-col gap-3">
      {/* Search + Filter toggle */}
      <div className="flex items-center gap-2">
        <SearchField
          value={search}
          onValueChange={setSearch}
          placeholder={t('search-builds', { defaultValue: 'Search builds...' })}
          aria-label={t('search-builds', { defaultValue: 'Search builds...' })}
          containerClassName="flex-1"
        />
        <Button asChild variant="accent">
          <Link to="/user-builds/submit">
            <Plus aria-hidden />
            <span className="hidden sm:inline">{t('submit', { defaultValue: 'Submit' })}</span>
            <span className="sr-only sm:hidden">{t('submit', { defaultValue: 'Submit' })}</span>
          </Link>
        </Button>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category Filter */}
        <div className="relative">
          <Button
            ref={categoryTriggerRef}
            variant="outline"
            onClick={() => setShowCategories(!showCategories)}
            aria-haspopup="menu"
            aria-expanded={showCategories}
            className="min-w-36 justify-between"
          >
            <span className="truncate">
              {selectedCategoryData?.name ||
                t('all-categories', { defaultValue: 'All Categories' })}
            </span>
            <ChevronDown
              className={`ml-auto transition-transform ${showCategories ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </Button>

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
          <Button
            ref={sortTriggerRef}
            variant="outline"
            onClick={() => setShowSort(!showSort)}
            aria-haspopup="menu"
            aria-expanded={showSort}
            className="min-w-36 justify-between"
          >
            <span>{selectedSortData?.label || t('sort-by', { defaultValue: 'Sort by' })}</span>
            <ChevronDown
              className={`ml-auto transition-transform ${showSort ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </Button>

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
        <Button
          variant="outline"
          aria-pressed={curated}
          onClick={() => onCuratedChange(!curated)}
          className={
            curated ? 'border-site-warning/40 bg-site-warning/10 text-site-warning' : undefined
          }
        >
          <Award aria-hidden />
          <span>{t('curated', { defaultValue: 'Curated' })}</span>
        </Button>

        {/* My Builds Toggle */}
        {session?.user && (
          <Button
            variant="outline"
            aria-pressed={myBuilds}
            onClick={() => onMyBuildsChange(!myBuilds)}
            className={`ml-auto ${myBuilds ? 'border-site-accent/40 bg-site-accent/10 text-site-accent' : ''}`}
          >
            <User aria-hidden />
            <span>{t('my-builds', { defaultValue: 'My Builds' })}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
