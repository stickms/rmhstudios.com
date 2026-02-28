'use client';

import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/rmhpoetry/store';
import { CHARACTERS, getCharacterFirstName } from '@/lib/rmhpoetry/characters';
import { formatPlaytime } from '@/lib/rmhpoetry/persistence';
import { CHAPTER_1 } from '@/lib/rmhpoetry/chapters/ch01';

export function ChapterSummary() {
  const { affinity, poemHistory, totalPoemsWritten, playtime, settings, setScreen } = useGameStore();

  // Get the latest poems from this chapter
  const chapterPoems = poemHistory.filter(p => p.chapter === 'ch01');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-6">
      <motion.div
        className="max-w-md w-full rounded-lg p-6 md:p-8"
        style={{
          backgroundColor: 'rgba(42, 34, 53, 0.9)',
          border: '1px solid rgba(196, 163, 90, 0.25)',
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2
          className="text-2xl text-center mb-1"
          style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#c4a35a' }}
        >
          Chapter Complete
        </h2>
        <p
          className="text-center text-sm mb-6 italic"
          style={{ color: '#a89888', fontFamily: 'var(--font-playfair, serif)' }}
        >
          {CHAPTER_1.title}
        </p>

        {/* Stats */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <span style={{ color: '#a89888' }}>Poems Written</span>
            <span style={{ color: '#e8e0d0' }}>{chapterPoems.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#a89888' }}>Playtime</span>
            <span style={{ color: '#e8e0d0' }}>{formatPlaytime(playtime)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#a89888' }}>Total Poems</span>
            <span style={{ color: '#e8e0d0' }}>{totalPoemsWritten}</span>
          </div>
        </div>

        {/* Character affinity changes */}
        <div className="mb-6">
          <h3 className="text-sm mb-3" style={{ color: '#a89888' }}>Relationships</h3>
          <div className="space-y-2">
            {Object.entries(affinity)
              .filter(([, a]) => a.affinity > 0)
              .sort(([, a], [, b]) => b.affinity - a.affinity)
              .map(([charId, charAff]) => {
                const char = CHARACTERS[charId];
                if (!char) return null;
                const name = getCharacterFirstName(charId, settings.characterPresentations);
                return (
                  <div key={charId} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: `${char.color}40`, color: char.accentColor }}
                    >
                      {name[0]}
                    </div>
                    <span className="text-sm flex-1" style={{ color: '#e8e0d0' }}>{name}</span>
                    <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(26, 21, 32, 0.8)' }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: char.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (charAff.affinity / 50) * 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                      />
                    </div>
                    <span className="text-xs w-8 text-right" style={{ color: '#c4a35a' }}>
                      {charAff.affinity}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setScreen('menu')}
            className="px-6 py-2.5 rounded text-sm font-semibold transition-all"
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.25)',
              border: '1px solid rgba(196, 163, 90, 0.5)',
              color: '#c4a35a',
            }}
          >
            Main Menu
          </button>
        </div>
      </motion.div>
    </div>
  );
}
