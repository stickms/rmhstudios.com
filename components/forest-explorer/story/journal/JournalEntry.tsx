'use client';

import type { JournalEntryData } from '@/lib/forest-explorer/types';

const CATEGORY_COLORS: Record<string, string> = {
    lore: 'text-blue-300 bg-blue-900/30 border-blue-700/30',
    hint: 'text-amber-300 bg-amber-900/30 border-amber-700/30',
    creature: 'text-green-300 bg-green-900/30 border-green-700/30',
    history: 'text-purple-300 bg-purple-900/30 border-purple-700/30',
    personal: 'text-white/70 bg-white/5 border-white/10',
};

export function JournalEntryCard({ entry }: { entry: JournalEntryData }) {
    const colorClass = CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS.personal;

    return (
        <div className="p-4 rounded-xl border border-white/10 bg-black/30 space-y-2">
            <div className="flex items-center justify-between">
                <h3 className="text-white/90 text-sm font-medium">{entry.title}</h3>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${colorClass}`}>
                    {entry.category}
                </span>
            </div>
            <p className="text-white/60 text-xs leading-relaxed">{entry.content}</p>
            {entry.hintLevel > 0 && (
                <div className="flex items-center gap-1 pt-1">
                    {Array.from({ length: entry.hintLevel }, (_, i) => (
                        <span key={i} className="text-amber-400 text-xs">*</span>
                    ))}
                    <span className="text-amber-400/50 text-[10px]">hint</span>
                </div>
            )}
        </div>
    );
}
