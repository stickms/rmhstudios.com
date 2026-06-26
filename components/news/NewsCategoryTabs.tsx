'use client';

import { useTranslation } from "react-i18next";
import { getCategoryColor, ALL_CATEGORIES } from '@/lib/news-categories';

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
    const { t } = useTranslation("c-news");
    const categories = availableCategories ?? ALL_CATEGORIES;

    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
            <button
                onClick={() => onCategoryChange(null)}
                aria-pressed={!activeCategory}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-150 active:scale-95 ${!activeCategory
                        ? 'bg-(--site-accent) text-site-accent-fg shadow-md'
                        : 'bg-(--site-surface) text-(--site-text-muted) border border-(--site-border) hover:text-(--site-text) hover:bg-(--site-surface-hover)'
                    }`}
            >
                {t("all", { defaultValue: "All" })}
            </button>
            {categories.map((category) => {
                const color = getCategoryColor(category);
                const isActive = activeCategory === category;
                return (
                    <button
                        key={category}
                        onClick={() => onCategoryChange(isActive ? null : category)}
                        aria-pressed={isActive}
                        className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-150 active:scale-95 ${isActive
                                ? `${color.bg} ${color.text} ${color.border} border shadow-md`
                                : 'bg-(--site-surface) text-(--site-text-muted) border border-(--site-border) hover:text-(--site-text) hover:bg-(--site-surface-hover)'
                            }`}
                    >
                        {category}
                    </button>
                );
            })}
        </div>
    );
}
