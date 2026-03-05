'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, ChevronDown, Filter, ArrowUpDown } from 'lucide-react';
import { OfficialBuildCard } from './OfficialBuildCard';
import type { OfficialBuild } from './OfficialBuildCard';
import type { UserBuild, BuildCategory } from '@prisma/client';

type FullBuild = UserBuild & { category?: BuildCategory | null };

type SortOption = 'default' | 'popular' | 'views' | 'comments';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'default', label: 'Curated Order' },
    { value: 'popular', label: 'Most Liked' },
    { value: 'views', label: 'Most Viewed' },
    { value: 'comments', label: 'Most Discussed' },
];

interface OfficialBuildGridProps {
    builds: FullBuild[];
    initialLikedIds?: string[];
}

function toBuildData(b: FullBuild, likedIds: Set<string>): OfficialBuild {
    return {
        id: b.id,
        slug: b.slug,
        title: b.title,
        description: b.description,
        thumbnailUrl: b.thumbnailUrl,
        demoUrl: b.demoUrl,
        repoUrl: b.repoUrl,
        technologies: Array.isArray(b.technologies) ? b.technologies as string[] : [],
        likeCount: b.likeCount,
        commentCount: b.commentCount,
        viewCount: b.viewCount,
        liked: likedIds.has(b.id),
        category: b.category ? { slug: b.category.slug, name: b.category.name } : null,
    };
}

export function OfficialBuildGrid({ builds, initialLikedIds = [] }: OfficialBuildGridProps) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sort, setSort] = useState<SortOption>('default');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set(initialLikedIds));
    const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
    const [viewCounts, setViewCounts] = useState<Record<string, number>>({});

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 200);
        return () => clearTimeout(timer);
    }, [search]);

    // Collect all unique tags from builds
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        builds.forEach(b => {
            const techs = Array.isArray(b.technologies) ? b.technologies as string[] : [];
            techs.forEach(t => tagSet.add(t));
        });
        return Array.from(tagSet).sort();
    }, [builds]);

    // Collect all unique categories
    const allCategories = useMemo(() => {
        const cats = new Map<string, string>();
        builds.forEach(b => {
            if (b.category) cats.set(b.category.slug, b.category.name);
        });
        return Array.from(cats.entries()); // [slug, name]
    }, [builds]);

    const filtered = useMemo(() => {
        let result = builds;

        // Filter by search
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            result = result.filter(b => {
                const tags = Array.isArray(b.technologies) ? b.technologies as string[] : [];
                return b.title.toLowerCase().includes(q) ||
                    b.description.toLowerCase().includes(q) ||
                    tags.some(t => t.toLowerCase().includes(q));
            });
        }

        // Filter by tag
        if (selectedTag) {
            result = result.filter(b => {
                const tags = Array.isArray(b.technologies) ? b.technologies as string[] : [];
                return tags.some(t => t.toLowerCase() === selectedTag.toLowerCase());
            });
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
    }, [builds, debouncedSearch, selectedTag, sort, likeCounts, viewCounts]);

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

    const [tagOpen, setTagOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const tagRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagOpen(false);
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const hasFilters = !!debouncedSearch || !!selectedTag || sort !== 'default';

    const selectedTagLabel = selectedTag
        ? allCategories.find(([slug]) => slug === selectedTag)?.[1] || selectedTag
        : 'All Tags';

    const selectedSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label || 'Curated Order';

    return (
        <>
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-site-text-dim" />
                    <input
                        type="text"
                        placeholder="Search builds..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg bg-site-surface border border-site-border text-site-text text-sm outline-none focus:border-site-accent/50 transition-colors"
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

                {/* Tag Filter Dropdown */}
                {(allCategories.length > 0 || allTags.length > 0) && (
                    <div className="relative" ref={tagRef}>
                        <button
                            onClick={() => { setTagOpen(!tagOpen); setSortOpen(false); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors cursor-pointer whitespace-nowrap ${
                                selectedTag
                                    ? 'bg-site-accent/10 border-site-accent/30 text-site-accent'
                                    : 'bg-site-surface border-site-border text-site-text hover:border-site-accent/50'
                            }`}
                        >
                            <Filter className="w-3.5 h-3.5" />
                            {selectedTagLabel}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tagOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {tagOpen && (
                            <div className="absolute z-40 top-full right-0 mt-1.5 w-56 bg-site-surface border border-site-border rounded-xl shadow-lg overflow-hidden">
                                <div className="max-h-72 overflow-y-auto py-1">
                                    <button
                                        onClick={() => { setSelectedTag(null); setTagOpen(false); }}
                                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                            !selectedTag ? 'bg-site-accent/10 text-site-accent' : 'text-site-text hover:bg-site-surface-hover'
                                        }`}
                                    >
                                        All Tags
                                    </button>
                                    {allCategories.length > 0 && (
                                        <>
                                            <div className="px-3 py-1.5 text-xs font-semibold text-site-text-dim uppercase tracking-wider">Categories</div>
                                            {allCategories.map(([slug, name]) => (
                                                <button
                                                    key={slug}
                                                    onClick={() => { setSelectedTag(slug); setTagOpen(false); }}
                                                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                                        selectedTag === slug ? 'bg-site-accent/10 text-site-accent' : 'text-site-text hover:bg-site-surface-hover'
                                                    }`}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                    {allTags.length > 0 && (
                                        <>
                                            <div className="px-3 py-1.5 text-xs font-semibold text-site-text-dim uppercase tracking-wider">Technologies</div>
                                            {allTags.map(tag => (
                                                <button
                                                    key={tag}
                                                    onClick={() => { setSelectedTag(tag); setTagOpen(false); }}
                                                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                                        selectedTag === tag ? 'bg-site-accent/10 text-site-accent' : 'text-site-text hover:bg-site-surface-hover'
                                                    }`}
                                                >
                                                    {tag}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Sort Dropdown */}
                <div className="relative" ref={sortRef}>
                    <button
                        onClick={() => { setSortOpen(!sortOpen); setTagOpen(false); }}
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
                        <div className="absolute z-40 top-full right-0 mt-1.5 w-48 bg-site-surface border border-site-border rounded-xl shadow-lg overflow-hidden py-1">
                            {SORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
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
                    <p className="text-site-text-muted">No builds found</p>
                    {hasFilters && (
                        <button
                            onClick={() => { setSearch(''); setSelectedTag(null); setSort('default'); }}
                            className="text-sm text-site-accent hover:text-site-accent-hover mt-2 transition-colors"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map((item) => {
                        const buildData = toBuildData(item, likedIds);
                        // Apply local overrides for like/view counts
                        if (likeCounts[item.id] !== undefined) buildData.likeCount = likeCounts[item.id];
                        if (viewCounts[item.id] !== undefined) buildData.viewCount = viewCounts[item.id];
                        return (
                            <OfficialBuildCard
                                key={item.id}
                                build={buildData}
                                onLike={handleLike}
                                onView={handleView}
                            />
                        );
                    })}
                </div>
            )}
        </>
    );
}
