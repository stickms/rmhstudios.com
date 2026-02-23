'use client';

import { Search, X } from 'lucide-react';
import { useJobSearchStore } from '@/lib/store/useJobSearchStore';
import { useState, useEffect, useRef } from 'react';

export function JobSearch() {
    const { query, sort, setQuery, setSort, resetFilters } = useJobSearchStore();
    const [localQuery, setLocalQuery] = useState(query);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        debounceRef.current = setTimeout(() => {
            setQuery(localQuery);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [localQuery, setQuery]);

    useEffect(() => {
        setLocalQuery(query);
    }, [query]);

    const hasFilters = sort !== 'newest' || query !== '';

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--jobs-text-subtle)' }}
                    />
                    <input
                        type="text"
                        value={localQuery}
                        onChange={(e) => setLocalQuery(e.target.value)}
                        placeholder='Search jobs... (e.g. "Dragon Hunter", "React Developer")'
                        className="jobs-search-input w-full pl-9 pr-9 py-2.5 rounded-lg text-sm"
                        style={{ borderRadius: 'var(--jobs-radius)' }}
                    />
                    {localQuery && (
                        <button
                            onClick={() => { setLocalQuery(''); setQuery(''); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-[var(--jobs-text)]"
                            style={{ color: 'var(--jobs-text-subtle)' }}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                {hasFilters && (
                    <button
                        onClick={resetFilters}
                        className="text-xs px-3 py-2.5 rounded-lg hover:bg-[var(--jobs-surface-2)] transition-colors"
                        style={{ color: 'var(--jobs-accent)' }}
                    >
                        Reset
                    </button>
                )}
            </div>

            <div
                className="flex flex-wrap gap-3 p-3 rounded-lg"
                style={{ background: 'var(--jobs-surface-2)', borderRadius: 'var(--jobs-radius)' }}
            >
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--jobs-text-muted)' }}>Sort:</span>
                    {(['newest', 'oldest', 'company'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setSort(s)}
                            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                                sort === s
                                    ? 'bg-[var(--jobs-accent)] text-[var(--jobs-accent-fg)] font-semibold'
                                    : 'bg-[var(--jobs-surface-3)] text-[var(--jobs-text-muted)] hover:text-[var(--jobs-text)]'
                            }`}
                        >
                            {s === 'newest' ? 'Newest' : s === 'oldest' ? 'Oldest' : 'Company A-Z'}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
