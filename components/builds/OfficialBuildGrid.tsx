import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from "react-i18next";
import { Search, X, ChevronDown, ArrowUpDown } from 'lucide-react';
import { LayoutGroup, motion } from 'framer-motion';
import { OfficialBuildCard } from './OfficialBuildCard';
import type { OfficialBuild } from './OfficialBuildCard';

type SortOption = 'default' | 'popular' | 'views' | 'comments';

interface OfficialBuildGridProps {
    builds: OfficialBuild[];
    initialLikedIds?: string[];
}

export function OfficialBuildGrid({ builds, initialLikedIds = [] }: OfficialBuildGridProps) {
    const { t } = useTranslation("c-builds");

    const SORT_OPTIONS: { value: SortOption; label: string }[] = [
        { value: 'default', label: t("sort-default", { defaultValue: "Default" }) },
        { value: 'popular', label: t("sort-most-liked", { defaultValue: "Most Liked" }) },
        { value: 'views', label: t("sort-most-viewed", { defaultValue: "Most Viewed" }) },
        { value: 'comments', label: t("sort-most-discussed", { defaultValue: "Most Discussed" }) },
    ];

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sort, setSort] = useState<SortOption>('default');
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set(initialLikedIds));
    const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
    const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 200);
        return () => clearTimeout(timer);
    }, [search]);

    const filtered = useMemo(() => {
        let result = builds;

        // Filter by search
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            result = result.filter(b =>
                b.title.toLowerCase().includes(q) ||
                b.description.toLowerCase().includes(q) ||
                b.technologies.some(t => t.toLowerCase().includes(q))
            );
        }

        // Sort
        if (sort !== 'default') {
            result = [...result].sort((a, b) => {
                const aLikes = likeCounts[a.id] ?? a.likeCount;
                const bLikes = likeCounts[b.id] ?? b.likeCount;
                const aViews = viewCounts[a.id] ?? a.viewCount;
                const bViews = viewCounts[b.id] ?? b.viewCount;

                if (sort === 'popular') return bLikes - aLikes;
                if (sort === 'views') return bViews - aViews;
                if (sort === 'comments') return b.commentCount - a.commentCount;
                return 0;
            });
        }

        return result;
    }, [builds, debouncedSearch, sort, likeCounts, viewCounts]);

    const handleLike = async (id: string) => {
        const wasLiked = likedIds.has(id);

        // Optimistic update
        setLikedIds(prev => {
            const next = new Set(prev);
            if (wasLiked) next.delete(id);
            else next.add(id);
            return next;
        });
        setLikeCounts(prev => {
            const build = builds.find(b => b.id === id);
            const current = prev[id] ?? build?.likeCount ?? 0;
            return { ...prev, [id]: wasLiked ? current - 1 : current + 1 };
        });

        try {
            const res = await fetch(`/api/user-builds/${id}/like`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setLikedIds(prev => {
                    const next = new Set(prev);
                    if (data.liked) next.add(id);
                    else next.delete(id);
                    return next;
                });
                setLikeCounts(prev => ({ ...prev, [id]: data.likeCount }));
            }
        } catch {
            // Revert
            setLikedIds(prev => {
                const next = new Set(prev);
                if (wasLiked) next.add(id);
                else next.delete(id);
                return next;
            });
            setLikeCounts(prev => {
                const build = builds.find(b => b.id === id);
                const current = prev[id] ?? build?.likeCount ?? 0;
                return { ...prev, [id]: wasLiked ? current + 1 : current - 1 };
            });
        }
    };

    const handleView = (id: string) => {
        fetch(`/api/user-builds/${id}/view`, { method: 'POST' }).catch(() => {});
    };

    const [sortOpen, setSortOpen] = useState(false);
    const sortRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const hasFilters = !!debouncedSearch || sort !== 'default';

    const selectedSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label || t("sort-default", { defaultValue: "Default" });

    return (
        <>
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
                    <input
                        type="text"
                        placeholder={t("search-placeholder", { defaultValue: "Search builds..." })}
                        aria-label={t("search-aria-label", { defaultValue: "Search builds" })}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-site-accent/50 transition-colors"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            aria-label={t("clear-search", { defaultValue: "Clear search" })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-site-text-dim hover:text-site-text"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Sort Dropdown */}
                <div className="relative" ref={sortRef}>
                    <button
                        onClick={() => { setSortOpen(!sortOpen); }}
                        aria-label={t("sort-builds", { defaultValue: "Sort builds" })}
                        aria-expanded={sortOpen}
                        aria-haspopup="listbox"
                        aria-controls="sort-listbox"
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors cursor-pointer whitespace-nowrap ${
                            sort !== 'default'
                                ? 'bg-site-accent/10 border-site-accent/30 text-site-accent'
                                : 'bg-site-surface border-site-border text-site-text hover:border-site-accent/50'
                        }`}
                    >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        {selectedSortLabel}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {sortOpen && (
                        <div id="sort-listbox" role="listbox" aria-label={t("sort-options", { defaultValue: "Sort options" })} className="absolute z-40 top-full right-0 mt-1.5 w-48 bg-site-surface border border-site-border rounded-xl shadow-lg overflow-hidden py-1">
                            {SORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    role="option"
                                    aria-selected={sort === opt.value}
                                    onClick={() => { setSort(opt.value); setSortOpen(false); }}
                                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                        sort === opt.value ? 'bg-site-accent/10 text-site-accent' : 'text-site-text hover:bg-site-surface-hover'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Grid */}
            {filtered.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-site-text-muted">{t("no-builds-found", { defaultValue: "No builds found" })}</p>
                    {hasFilters && (
                        <button
                            onClick={() => { setSearch(''); setSort('default'); }}
                            className="text-sm text-site-accent hover:text-site-accent-hover mt-2 transition-colors"
                        >
                            {t("clear-filters", { defaultValue: "Clear filters" })}
                        </button>
                    )}
                </div>
            ) : (
                <LayoutGroup>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filtered.map((item) => {
                                const buildData = { ...item, liked: likedIds.has(item.id) };
                                if (likeCounts[item.id] !== undefined) buildData.likeCount = likeCounts[item.id];
                                if (viewCounts[item.id] !== undefined) buildData.viewCount = viewCounts[item.id];
                                return (
                                    <motion.div
                                        key={item.id}
                                        layout
                                        transition={{ layout: { type: 'spring', stiffness: 300, damping: 30 } }}
                                    >
                                        <OfficialBuildCard
                                            build={buildData}
                                            onLike={handleLike}
                                            onView={handleView}
                                        />
                                    </motion.div>
                                );
                            })}
                    </div>
                </LayoutGroup>
            )}
        </>
    );
}
