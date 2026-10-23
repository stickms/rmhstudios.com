'use client';

import { useTranslation } from 'react-i18next';
import { getCategoryColor, ALL_CATEGORIES } from '@/lib/news-categories';
import { Button } from '@/components/ui/button';
import { HorizontalScroller } from '@/components/ui/horizontal-scroller';

interface NewsCategoryTabsProps {
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  availableCategories?: string[];
}

export function NewsCategoryTabs({
  activeCategory,
  onCategoryChange,
  availableCategories,
}: NewsCategoryTabsProps) {
  const { t } = useTranslation('c-news');
  const categories = availableCategories ?? ALL_CATEGORIES;

  // Filter chips are toggles (`aria-pressed`), not tabs — they can also be
  // switched off — so they are `Button`s in the pill shape, which brings the
  // 44px coarse-pointer target and the shared press/focus behaviour with them.
  return (
    <HorizontalScroller
      aria-label={t('categories-label', { defaultValue: 'News categories' })}
      surface="pill"
    >
      <Button
        type="button"
        size="sm"
        variant={!activeCategory ? 'default' : 'secondary'}
        className="rounded-full"
        onClick={() => onCategoryChange(null)}
        aria-pressed={!activeCategory}
      >
        {t('all', { defaultValue: 'All' })}
      </Button>
      {categories.map((category) => {
        const color = getCategoryColor(category);
        const isActive = activeCategory === category;
        return (
          <Button
            type="button"
            key={category}
            size="sm"
            variant="secondary"
            className={`rounded-full ${isActive ? `${color.bg} ${color.text} ${color.border}` : ''}`}
            onClick={() => onCategoryChange(isActive ? null : category)}
            aria-pressed={isActive}
          >
            {category}
          </Button>
        );
      })}
    </HorizontalScroller>
  );
}
