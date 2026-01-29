"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Search, Calendar, Tag, Filter, ArrowUpAZ, ArrowDownAZ, Clock } from "lucide-react";
import { ShareButton } from "@/components/blog/ShareButton";
import { Post } from "@/lib/blog";
import { ProximityText } from "@/components/ui/ProximityText";

interface BlogListProps {
  initialPosts: Partial<Post>[];
}

export function BlogList({ initialPosts }: BlogListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "az" | "za">("newest");
  const [showAllTags, setShowAllTags] = useState(false);


  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    initialPosts.forEach(post => {
      post.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [initialPosts]);

  // Filter and Sort
  const filteredPosts = useMemo(() => {
    let result = [...initialPosts];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(post => 
        post.title?.toLowerCase().includes(q) || 
        post.description?.toLowerCase().includes(q)
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
  }, [initialPosts, searchQuery, selectedTag, sortMode]);



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
              {filteredPosts.length} entries found
            </p>
          </div>

          {/* Search Bar */}
          <div className="w-full md:w-96 relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-white/30" />
             </div>
             <input
                type="text"
                placeholder="Search logs..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/30 focus:outline-none focus:border-[var(--neon-pink)] focus:ring-1 focus:ring-[var(--neon-pink)] transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
             />
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
           </div>

           {/* Sort */}
           <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
              <span className="text-sm text-white/40">Sort by:</span>
              <select 
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                className="bg-black/40 border border-white/10 rounded-lg py-1 px-3 text-sm text-white focus:outline-none focus:border-[var(--neon-pink)]"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">A-Z</option>
                <option value="za">Z-A</option>
              </select>
           </div>
        </div>
      </motion.div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredPosts.map((post) => (
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
                <p>No logs found matching your filters.</p>
                <button 
                    onClick={() => {setSearchQuery(""); setSelectedTag(null);}}
                    className="mt-4 text-[var(--neon-pink)] hover:underline"
                >
                    Clear Filters
                </button>
            </div>
        )}
      </div>
    </div>
  );
}
