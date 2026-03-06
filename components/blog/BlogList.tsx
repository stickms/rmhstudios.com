"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Search, Calendar, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { ShareButton } from "@/components/blog/ShareButton";
import { Post } from "@/lib/blog";

const POSTS_PER_PAGE = 12;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface BlogListProps {
  initialPosts: Partial<Post>[];
  filtersOpen?: boolean;
}

export function BlogList({ initialPosts, filtersOpen = false }: BlogListProps) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;

  const [searchInput, setSearchInput] = useState(search.q || "");
  const debouncedSearch = useDebounce(searchInput, 250);
  const [selectedTag, setSelectedTag] = useState<string | null>(search.tag || null);
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "az" | "za">(
    (search.sort as "newest" | "oldest" | "az" | "za") || "newest"
  );
  const [currentPage, setCurrentPage] = useState(Number(search.page) || 1);
  const [showAllTags, setShowAllTags] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const updateURL = useCallback((params: Record<string, string | null>) => {
    const url = new URLSearchParams();
    // Carry over existing search params
    Object.entries(search).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.set(key, String(value));
    });
    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== "" && !(key === "page" && value === "1") && !(key === "sort" && value === "newest")) {
        url.set(key, value);
      } else {
        url.delete(key);
      }
    });
    const qs = url.toString();
    navigate({ to: `/blog${qs ? `?${qs}` : ""}`, replace: true });
  }, [navigate, search]);

  const allTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    initialPosts.forEach(post => {
      post.tags?.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    });
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [initialPosts]);

  const filteredPosts = useMemo(() => {
    let result = [...initialPosts];

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      result = result.filter(post =>
        terms.every(term =>
          post.title?.toLowerCase().includes(term) ||
          post.description?.toLowerCase().includes(term) ||
          post.tags?.some(tag => tag.toLowerCase().includes(term))
        )
      );
    }

    if (selectedTag) {
      result = result.filter(post => post.tags?.includes(selectedTag));
    }

    result.sort((a, b) => {
      if (sortMode === "newest") return new Date(b.date!).getTime() - new Date(a.date!).getTime();
      if (sortMode === "oldest") return new Date(a.date!).getTime() - new Date(b.date!).getTime();
      if (sortMode === "az") return (a.title || "").localeCompare(b.title || "");
      if (sortMode === "za") return (b.title || "").localeCompare(a.title || "");
      return 0;
    });

    return result;
  }, [initialPosts, debouncedSearch, selectedTag, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
    updateURL({ q: debouncedSearch || null, tag: selectedTag, sort: sortMode, page: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, selectedTag, sortMode]);

  const safePage = Math.min(currentPage, totalPages);
  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage);
  }, [currentPage, safePage]);

  const paginatedPosts = useMemo(() => {
    const start = (safePage - 1) * POSTS_PER_PAGE;
    return filteredPosts.slice(start, start + POSTS_PER_PAGE);
  }, [filteredPosts, safePage]);

  const goToPage = useCallback((page: number) => {
    const p = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(p);
    updateURL({ q: debouncedSearch || null, tag: selectedTag, sort: sortMode, page: p > 1 ? String(p) : null });
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [totalPages, updateURL, debouncedSearch, selectedTag, sortMode]);

  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safePage > 3) pages.push("...");
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) {
        pages.push(i);
      }
      if (safePage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safePage]);

  const clearAllFilters = () => {
    setSearchInput("");
    setSelectedTag(null);
    setSortMode("newest");
  };

  const hasActiveFilters = searchInput || selectedTag || sortMode !== "newest";

  return (
    <div className="px-4 py-4">
      {/* Filter Controls - collapsible */}
      {filtersOpen && (
      <div className="mb-4 space-y-3 border-b border-site-border pb-4">
        {/* Search Bar */}
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-site-text-dim" />
          </div>
          <input
            type="text"
            placeholder="Search titles, descriptions, tags..."
            className="w-full bg-site-surface border border-site-border rounded-xl py-2.5 pl-9 pr-9 text-sm text-site-text placeholder-site-text-dim focus:outline-none focus:border-site-accent focus:ring-1 focus:ring-site-accent transition-all"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-site-text-dim hover:text-site-text transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters Row */}
        <div className="bg-site-surface p-3 rounded-xl border border-site-border space-y-3">
          {/* Tags */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5 text-xs text-site-accent mr-1 whitespace-nowrap">
              <Filter className="w-3.5 h-3.5" /> Tags:
            </div>
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${!selectedTag ? "bg-site-accent text-white" : "bg-site-bg text-site-text-muted hover:bg-site-surface-hover"}`}
            >
              All
            </button>
            {(showAllTags ? allTags : allTags.slice(0, 5)).map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${selectedTag === tag ? "bg-site-accent text-white" : "bg-site-bg text-site-text-muted hover:bg-site-surface-hover"}`}
              >
                {tag}
              </button>
            ))}
            {!showAllTags && allTags.length > 5 && (
              <button
                onClick={() => setShowAllTags(true)}
                className="text-xs text-site-accent hover:text-site-text transition-colors ml-1 font-mono"
              >
                +{allTags.length - 5}
              </button>
            )}
            {showAllTags && allTags.length > 5 && (
              <button
                onClick={() => setShowAllTags(false)}
                className="text-xs text-site-accent hover:text-site-text transition-colors ml-1 font-mono"
              >
                less
              </button>
            )}
          </div>

          {/* Sort + Clear + Count */}
          <div className="flex items-center gap-3 whitespace-nowrap">
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-site-danger hover:text-site-text transition-colors font-mono flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
            <span className="text-xs text-site-text-dim">Sort:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as "newest" | "oldest" | "az" | "za")}
              className="bg-site-bg border border-site-border rounded-lg py-1 px-2 text-xs text-site-text focus:outline-none focus:border-site-accent"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="az">A-Z</option>
              <option value="za">Z-A</option>
            </select>
            <span className="text-xs text-site-text-dim font-mono ml-auto">
              {filteredPosts.length} {filteredPosts.length === 1 ? "entry" : "entries"}
            </span>
          </div>
        </div>
      </div>
      )}

      {/* Active filter indicator when collapsed */}
      {!filtersOpen && hasActiveFilters && (
        <div className="mb-3 flex items-center gap-2 text-xs text-site-text-dim">
          <span className="font-mono">{filteredPosts.length} results</span>
          <button onClick={clearAllFilters} className="text-site-accent hover:underline">Clear filters</button>
        </div>
      )}

      {/* Grid */}
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 scroll-mt-8">
        <AnimatePresence mode="popLayout">
          {paginatedPosts.map((post) => (
            <motion.div
              layout
              key={post.slug}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
               <div data-slot="card" className="bg-site-surface border border-site-border overflow-hidden hover:border-site-accent/50 transition-colors h-full flex flex-col group relative" style={{ borderRadius: "var(--site-radius)", borderWidth: "var(--site-border-width)", transitionDuration: "var(--site-transition-speed)" }}>
                  <Link to={`/blog/${post.slug}`} className="absolute inset-0 z-0" />

                  {/* Share Button */}
                  <ShareButton slug={post.slug!} className="absolute top-3 right-3 z-10" />

                  {/* Image Placeholder */}
                  <div className="h-40 bg-site-surface-hover relative overflow-hidden shrink-0">
                    <div className="absolute inset-0 flex items-center justify-center text-site-text-dim font-mono text-xs p-4 text-center">
                        {post.title}
                    </div>
                     <div className="absolute inset-0 bg-linear-to-t from-site-surface to-transparent" />
                  </div>

                  <div className="p-5 flex flex-col flex-1 relative pointer-events-none">
                    <div className="flex items-center gap-2 text-site-accent text-xs font-mono mb-2">
                        <Calendar className="w-3 h-3" />
                        {post.date}
                    </div>

                    <h3 className="text-xl font-bold text-site-text mb-2 leading-tight group-hover:text-site-accent transition-colors">
                        {post.title}
                    </h3>

                    {/* Tags */}
                    {post.tags && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {post.tags.map(tag => (
                                <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-site-bg text-site-text-dim border border-site-border">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    <p className="text-site-text-muted text-sm line-clamp-3 mb-4">
                        {post.description}
                    </p>

                    <div className="mt-auto flex items-center text-site-accent text-xs font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                        Read Entry &rarr;
                    </div>
                  </div>
               </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredPosts.length === 0 && (
            <div className="col-span-full text-center py-20 text-site-text-dim">
                <p className="text-lg">No logs found matching your filters.</p>
                {debouncedSearch && (
                  <p className="mt-2 text-sm">Try different search terms or fewer filters.</p>
                )}
                <button
                    onClick={clearAllFilters}
                    className="mt-4 text-site-accent hover:underline"
                >
                    Clear All Filters
                </button>
            </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <motion.div
          className="mt-8 flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => goToPage(1)}
              disabled={safePage === 1}
              className="p-2 rounded-lg text-site-text-dim hover:text-site-text hover:bg-site-surface disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              aria-label="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage === 1}
              className="p-2 rounded-lg text-site-text-dim hover:text-site-text hover:bg-site-surface disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {pageNumbers.map((page, i) =>
              page === "..." ? (
                <span key={`ellipsis-${i}`} className="px-2 text-site-text-dim text-sm">...</span>
              ) : (
                <button
                  key={page}
                  onClick={() => goToPage(page as number)}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                    safePage === page
                      ? "bg-site-accent text-white"
                      : "text-site-text-dim hover:text-site-text hover:bg-site-surface"
                  }`}
                >
                  {page}
                </button>
              )
            )}

            <button
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage === totalPages}
              className="p-2 rounded-lg text-site-text-dim hover:text-site-text hover:bg-site-surface disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => goToPage(totalPages)}
              disabled={safePage === totalPages}
              className="p-2 rounded-lg text-site-text-dim hover:text-site-text hover:bg-site-surface disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              aria-label="Last page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-site-text-dim font-mono">
            Page {safePage} of {totalPages}
          </p>
        </motion.div>
      )}
    </div>
  );
}
