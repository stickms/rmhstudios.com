'use client';

import { useState, useEffect, useMemo } from 'react';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { journalEntries, getEntryById } from './journalData';
import { JournalEntryCard } from './JournalEntry';
import type { JournalCategory } from '@/lib/forest-explorer/types';

const CATEGORIES: { id: JournalCategory | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'personal', label: 'Personal' },
    { id: 'lore', label: 'Lore' },
    { id: 'landmark', label: 'Landmarks' },
    { id: 'hint', label: 'Hints' },
    { id: 'creature', label: 'Creatures' },
    { id: 'history', label: 'History' },
];

export function JournalOverlay() {
    const journalOpen = useStoryStore(s => s.journalOpen);
    const toggleJournal = useStoryStore(s => s.toggleJournal);
    const discoveredEntries = useStoryStore(s => s.discoveredEntries);
    const currentAct = useStoryStore(s => s.currentAct);

    const [activeCategory, setActiveCategory] = useState<JournalCategory | 'all'>('all');

    // Release pointer lock when journal opens
    useEffect(() => {
        if (journalOpen) {
            document.exitPointerLock?.();
        }
    }, [journalOpen]);

    // ESC or Tab to close
    useEffect(() => {
        if (!journalOpen) return;
        const fn = (e: KeyboardEvent) => {
            if (e.code === 'Escape' || e.code === 'Tab') {
                e.preventDefault();
                toggleJournal();
            }
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [journalOpen, toggleJournal]);

    const displayedEntries = useMemo(() => {
        return discoveredEntries
            .map(id => getEntryById(id))
            .filter((e): e is NonNullable<typeof e> => e !== undefined)
            .filter(e => activeCategory === 'all' || e.category === activeCategory)
            .sort((a, b) => {
                // Current act first, then by category
                if (a.act === currentAct && b.act !== currentAct) return -1;
                if (b.act === currentAct && a.act !== currentAct) return 1;
                return 0;
            });
    }, [discoveredEntries, activeCategory, currentAct]);

    if (!journalOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] flex flex-col">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            {/* Content */}
            <div className="relative z-10 flex flex-col h-full max-w-2xl mx-auto w-full px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white">Journal</h2>
                    <div className="flex items-center gap-3">
                        <span className="text-white/30 text-xs">
                            {discoveredEntries.length}/{journalEntries.length} entries
                        </span>
                        <button
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors cursor-pointer"
                            onClick={toggleJournal}
                        >
                            X
                        </button>
                    </div>
                </div>

                {/* Category tabs */}
                <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                                activeCategory === cat.id
                                    ? 'bg-white/15 text-white'
                                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                            }`}
                            onClick={() => setActiveCategory(cat.id)}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Entries list */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {displayedEntries.length === 0 ? (
                        <div className="text-center text-white/30 text-sm py-12">
                            {discoveredEntries.length === 0
                                ? 'No entries discovered yet. Explore the forest to find inscriptions and notes.'
                                : 'No entries in this category yet.'
                            }
                        </div>
                    ) : (
                        displayedEntries.map(entry => (
                            <JournalEntryCard key={entry.id} entry={entry} />
                        ))
                    )}
                </div>

                {/* Footer hint */}
                <div className="mt-4 text-center text-white/20 text-xs">
                    Press TAB or ESC to close
                </div>
            </div>
        </div>
    );
}
