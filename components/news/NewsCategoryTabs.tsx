'use client';

import { useTranslation } from 'react-i18next';
import { getCategoryColor, ALL_CATEGORIES } from '@/lib/news-categories';
import { JellyGroup } from '@/components/ui/jelly-group';
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

  // Filter chips are toggles (`aria-pressed`), not tabs — they can also be switched off — so they are flat
  // `JellyGroup.Item` members lying on the scroller's pill, which is the one jelly body; the chosen one is the glow.
  return (
    <HorizontalScroller
      aria-label={t('categories-label', { defaultValue: 'News categories' })}
      surface="pill"
    >
      <JellyGroup.Item selected={!activeCategory} onClick={() => onCategoryChange(null)}>
        {t('all', { defaultValue: 'All' })}
      </JellyGroup.Item>
      {categories.map((category) => {
        const color = getCategoryColor(category);
        const isActive = activeCategory === category;
        return (
          <JellyGroup.Item
            key={category}
            selected={isActive}
            className={isActive ? color.text : undefined}
            onClick={() => onCategoryChange(isActive ? null : category)}
          >
            {category}
          </JellyGroup.Item>
        );
      })}
    </HorizontalScroller>
  );
}
