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

  // Filter chips are toggles (`aria-pressed`), not tabs: they can also be switched off. The chosen one is filled.
  return (
    <HorizontalScroller
      aria-label={t('categories-label', { defaultValue: 'News categories' })}
      surface="none"
    >
      <Button
        size="sm"
        variant={!activeCategory ? 'default' : 'ghost'}
        aria-pressed={!activeCategory}
        onClick={() => onCategoryChange(null)}
      >
        {t('all', { defaultValue: 'All' })}
      </Button>
      {categories.map((category) => {
        const color = getCategoryColor(category);
        const isActive = activeCategory === category;
        return (
          <Button
            key={category}
            size="sm"
            variant={isActive ? 'default' : 'ghost'}
            aria-pressed={isActive}
            className={isActive ? color.text : undefined}
            onClick={() => onCategoryChange(isActive ? null : category)}
          >
            {category}
          </Button>
        );
      })}
    </HorizontalScroller>
  );
}
