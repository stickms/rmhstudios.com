'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { OfficialBuildCard } from './OfficialBuildCard';
import type { UserBuild, BuildCategory } from '@prisma/client';

type FullBuild = UserBuild & { category?: BuildCategory | null };

interface OfficialBuildGridProps {
    builds: FullBuild[];
}

export function OfficialBuildGrid({ builds }: OfficialBuildGridProps) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 200);
        return () => clearTimeout(timer);
    }, [search]);

    const filtered = useMemo(() => {
        if (!debouncedSearch) return builds;
        const q = debouncedSearch.toLowerCase();
        return builds.filter(
            (b) => {
                const tags = Array.isArray(b.technologies) ? b.technologies as string[] : [];
                return b.title.toLowerCase().includes(q) ||
                b.description.toLowerCase().includes(q) ||
                tags.some((t) => t.toLowerCase().includes(q))
            }
        );
    }, [builds, debouncedSearch]);

    return (
        <>
            {/* Search */}
            <div className="relative mb-6">
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

            {/* Grid */}
            {filtered.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-site-text-muted">No builds found</p>
                    {debouncedSearch && (
                        <p className="text-sm text-site-text-dim mt-2">
                            Try a different search term
                        </p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map((item) => (
                        <OfficialBuildCard key={item.id} build={item} />
                    ))}
                </div>
            )}
        </>
    );
}
