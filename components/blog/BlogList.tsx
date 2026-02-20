"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search, Calendar, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { ShareButton } from "@/components/blog/ShareButton";
import { Post } from "@/lib/blog";
import { ProximityText } from "@/components/ui/ProximityText";

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
}

export function BlogList({ initialPosts }: BlogListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial state from URL params
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const debouncedSearch = useDebounce(searchInput, 250);
  const [selectedTag, setSelectedTag] = useState<string | null>(searchParams.get("tag") || null);
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "az" | "za">(
    (searchParams.get("sort") as "newest" | "oldest" | "az" | "za") || "newest"
  );
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [showAllTags, setShowAllTags] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Sync URL params when filters change
  const updateURL = useCallback((params: Record<string, string | null>) => {
    const url = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== "" && !(key === "page" && value === "1") && !(key === "sort" && value === "newest")) {
        url.set(key, value);
      } else {
        url.delete(key);
      }
    });
    const qs = url.toString();
    router.replace(`/blog${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  // Extract all unique tags, sorted by frequency
  const allTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    initialPosts.forEach(post => {
      post.tags?.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    });
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [initialPosts]);

  // Filter and Sort
  const filteredPosts = useMemo(() => {
    let result = [...initialPosts];

    // Search (uses debounced value)
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

    // Tag Filter
    if (selectedTag) {
      result = result.filter(post => post.tags?.includes(selectedTag));
    }

    // Sort
    result.sort((a, b) => {
      if (sortMode === "newest") return new Date(b.date!).getTime() - new Date(a.date!).getTime();
      if (sortMode === "oldest") return new Date(a.date!).getTime() - new Date(b.date!).getTime();
      if (sortMode === "az") return (a.title || "").localeCompare(b.title || "");
      if (sortMode === "za") return (b.title || "").localeCompare(a.title || "");
      return 0;
    });

    return result;
  }, [initialPosts, debouncedSearch, selectedTag, sortMode]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    updateURL({ q: debouncedSearch || null, tag: selectedTag, sort: sortMode, page: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, selectedTag, sortMode]);

  // Clamp page on filter changes
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

  // Generate page numbers with ellipsis
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
    <div className="container mx-auto max-w-6xl relative z-10">
      
      {/* Header & Controls */}
      <motion.div 
        className="mb-12 space-y-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex flex-col md:flex-row gap-6 justify-between items-end">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-6 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
              <ProximityText>The Archive</ProximityText>
            </h1>
            <p className="text-white/60 mt-2 text-lg">
              {filteredPosts.length} {filteredPosts.length === 1 ? "entry" : "entries"} found
              {filteredPosts.length !== initialPosts.length && (
                <span className="text-white/30"> of {initialPosts.length} total</span>
              )}
            </p>
          </div>

          {/* Search Bar */}
          <div className="w-full md:w-96 relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-white/30" />
             </div>
             <input
                type="text"
                placeholder="Search titles, descriptions, tags..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-white/30 focus:outline-none focus:border-[var(--neon-pink)] focus:ring-1 focus:ring-[var(--neon-pink)] transition-all"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
             />
             {searchInput && (
               <button
                 onClick={() => setSearchInput("")}
                 className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/30 hover:text-white transition-colors"
               >
                 <X className="h-4 w-4" />
               </button>
             )}
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
           
           {/* Tags */}
           <div className="flex flex-wrap gap-2 items-center flex-1">
              <div className="flex items-center gap-2 text-sm text-[var(--neon-cyan)] mr-2 whitespace-nowrap">
                <Filter className="w-4 h-4" /> Filters:
              </div>
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${!selectedTag ? "bg-[var(--neon-pink)] text-white" : "bg-white/10 text-white/50 hover:bg-white/20"}`}
              >
                All
              </button>
              {(showAllTags ? allTags : allTags.slice(0, 5)).map(tag => (
                <button
                    key={tag}
                    onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${selectedTag === tag ? "bg-[var(--neon-pink)] text-white" : "bg-white/10 text-white/50 hover:bg-white/20"}`}
                >
                    {tag}
                </button>
              ))}
              {!showAllTags && allTags.length > 5 && (
                  <button
                    onClick={() => setShowAllTags(true)}
                    className="text-xs text-[var(--neon-cyan)] hover:text-white transition-colors ml-1 font-mono"
                  >
                    (+ {allTags.length - 5} more)
                  </button>
              )}
              {showAllTags && allTags.length > 5 && (
                  <button
                    onClick={() => setShowAllTags(false)}
                    className="text-xs text-[var(--neon-cyan)] hover:text-white transition-colors ml-1 font-mono"
                  >
                    (show less)
                  </button>
              )}
           </div>

           {/* Sort + Clear */}
           <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-[var(--neon-pink)] hover:text-white transition-colors font-mono flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear all
                </button>
              )}
              <span className="text-sm text-white/40">Sort by:</span>
              <select 
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as "newest" | "oldest" | "az" | "za")}
                className="bg-black/40 border border-white/10 rounded-lg py-1 px-3 text-sm text-white focus:outline-none focus:border-[var(--neon-pink)]"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">A-Z</option>
                <option value="za">Z-A</option>
              </select>
           </div>
        </div>

        {/* Pagination Info */}
        {totalPages > 1 && (
          <div className="text-sm text-white/40 font-mono">
            Showing {(safePage - 1) * POSTS_PER_PAGE + 1}-{Math.min(safePage * POSTS_PER_PAGE, filteredPosts.length)} of {filteredPosts.length}
          </div>
        )}
      </motion.div>

      {/* Grid */}
      <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 scroll-mt-8">
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
               <div className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden hover:border-[var(--neon-cyan)] transition-colors duration-300 h-full flex flex-col group relative">
                  <Link href={`/blog/${post.slug}`} className="absolute inset-0 z-0" />
                  
                  {/* Share Button (Above Link Z-Index) */}
                  <ShareButton slug={post.slug!} className="absolute top-3 right-3 z-10" />

                  {/* Image Placeholder */}
                  <div className="h-40 bg-white/5 relative overflow-hidden shrink-0">
                    <div className="absolute inset-0 flex items-center justify-center text-white/10 font-mono text-xs p-4 text-center">
                        {post.title}
                    </div>
                     <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  </div>

                  <div className="p-5 flex flex-col flex-1 relative pointer-events-none">
                    <div className="flex items-center gap-2 text-[var(--neon-pink)] text-xs font-mono mb-2">
                        <Calendar className="w-3 h-3" />
                        {post.date}
                    </div>
                    
                    <h3 className="text-xl font-bold text-white mb-2 leading-tight">
                        <ProximityText>{post.title || ""}</ProximityText>
                    </h3>

                    {/* Tags */}
                    {post.tags && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {post.tags.map(tag => (
                                <span key={tag} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-white/5 text-white/40 border border-white/5">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                    
                    <p className="text-white/50 text-sm line-clamp-3 mb-4">
                        {post.description}
                    </p>
                    
                    <div className="mt-auto flex items-center text-[var(--neon-cyan)] text-xs font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                        Read Entry &rarr;
                    </div>
                  </div>
               </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {filteredPosts.length === 0 && (
            <div className="col-span-full text-center py-20 text-white/30">
                <p className="text-lg">No logs found matching your filters.</p>
                {debouncedSearch && (
                  <p className="mt-2 text-sm">Try different search terms or fewer filters.</p>
                )}
                <button 
                    onClick={clearAllFilters}
                    className="mt-4 text-[var(--neon-pink)] hover:underline"
                >
                    Clear All Filters
                </button>
            </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <motion.div
          className="mt-12 flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-1 sm:gap-2">
            {/* First page */}
            <button
              onClick={() => goToPage(1)}
              disabled={safePage === 1}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              aria-label="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Previous */}
            <button
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage === 1}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page numbers */}
            {pageNumbers.map((page, i) =>
              page === "..." ? (
                <span key={`ellipsis-${i}`} className="px-2 text-white/30 text-sm">...</span>
              ) : (
                <button
                  key={page}
                  onClick={() => goToPage(page as number)}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                    safePage === page
                      ? "bg-[var(--neon-pink)] text-white shadow-lg shadow-[var(--neon-pink)]/25"
                      : "text-white/50 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {page}
                </button>
              )
            )}

            {/* Next */}
            <button
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage === totalPages}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Last page */}
            <button
              onClick={() => goToPage(totalPages)}
              disabled={safePage === totalPages}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              aria-label="Last page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-white/30 font-mono">
            Page {safePage} of {totalPages}
          </p>
        </motion.div>
      )}
    </div>
  );
}
