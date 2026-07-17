'use client';

import { useState } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/versecraft/store';
import { CHARACTERS, getCharacterFirstName } from '@/lib/versecraft/characters';
import type { PoemRecord, Grade } from '@/lib/versecraft/types';

const GRADE_COLORS: Record<Grade, string> = {
  S: '#FFD700', A: '#4CAF50', B: '#2196F3',
  C: '#FF9800', D: '#F44336', F: '#666666',
};

function PoemCard({ poem, isSelected, onClick }: {
  poem: PoemRecord;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      className="w-full text-left px-3 py-2 rounded transition-all"
      style={{
        backgroundColor: isSelected ? 'rgba(196, 163, 90, 0.15)' : 'rgba(42, 34, 53, 0.4)',
        border: `1px solid ${isSelected ? 'rgba(196, 163, 90, 0.4)' : 'transparent'}`,
      }}
      onClick={onClick}
      whileHover={{ backgroundColor: 'rgba(196, 163, 90, 0.1)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: `${GRADE_COLORS[poem.grade]}20`,
            color: GRADE_COLORS[poem.grade],
          }}
        >
          {poem.grade}
        </span>
        <span className="text-xs" style={{ color: '#666' }}>
          {new Date(poem.timestamp).toLocaleDateString()}
        </span>
      </div>
      <p
        className="text-sm truncate italic"
        style={{ color: '#a89888', fontFamily: 'var(--font-playfair, serif)' }}
      >
        {poem.text.slice(0, 60)}{poem.text.length > 60 ? '...' : ''}
      </p>
    </motion.button>
  );
}

export function PoemJournal() {
  const { t } = useTranslation("c-versecraft");
  const poemHistory = useGameStore(s => s.poemHistory);
  const settings = useGameStore(s => s.settings);
  const setScreen = useGameStore(s => s.setScreen);
  const goBack = useGameStore(s => s.goBack);
  const [selectedPoem, setSelectedPoem] = useState<PoemRecord | null>(
    poemHistory.length > 0 ? poemHistory[poemHistory.length - 1] : null
  );

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4"
        style={{ backgroundColor: 'rgba(26, 21, 32, 0.9)', borderBottom: '1px solid rgba(196, 163, 90, 0.15)' }}
      >
        <h2
          className="text-xl"
          style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#c4a35a' }}
        >
          {t("poem-journal", { defaultValue: "Poem Journal" })}
        </h2>
        <button
          onClick={goBack}
          className="text-sm px-4 py-1.5 rounded transition-all"
          style={{
            backgroundColor: 'rgba(42, 34, 53, 0.6)',
            border: '1px solid rgba(196, 163, 90, 0.15)',
            color: '#a89888',
          }}
        >
          {t("close", { defaultValue: "Close" })}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Poem list */}
        <div
          className="w-full md:w-72 p-3 space-y-1 overflow-y-auto md:border-r"
          style={{ borderColor: 'rgba(196, 163, 90, 0.1)' }}
        >
          {poemHistory.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#555' }}>
              {t("no-poems-yet", { defaultValue: "No poems written yet." })}
            </p>
          ) : (
            poemHistory.map(poem => (
              <PoemCard
                key={poem.id}
                poem={poem}
                isSelected={selectedPoem?.id === poem.id}
                onClick={() => setSelectedPoem(poem)}
              />
            ))
          )}
        </div>

        {/* Selected poem detail */}
        <div className="flex-1 p-4 md:p-6">
          <AnimatePresence mode="wait">
            {selectedPoem ? (
              <motion.div
                key={selectedPoem.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {/* Poem text */}
                <div
                  className="rounded-lg p-6 mb-4"
                  style={{
                    backgroundColor: 'rgba(245, 240, 232, 0.05)',
                    border: '1px solid rgba(196, 163, 90, 0.15)',
                  }}
                >
                  <p
                    className="text-lg leading-relaxed italic text-center"
                    style={{
                      fontFamily: 'var(--font-playfair, serif)',
                      color: '#e8e0d0',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {selectedPoem.text}
                  </p>
                </div>

                {/* Grade and scores */}
                <div className="flex items-center gap-4 mb-4">
                  <span
                    className="text-3xl font-bold"
                    style={{
                      color: GRADE_COLORS[selectedPoem.grade],
                      fontFamily: 'var(--font-cinzel, serif)',
                    }}
                  >
                    {selectedPoem.grade}
                  </span>
                  <div>
                    <p className="text-xs" style={{ color: '#666' }}>
                      {selectedPoem.puzzleType.replace(/_/g, ' ')} | {selectedPoem.chapter}
                    </p>
                    <p className="text-xs" style={{ color: '#555' }}>
                      {new Date(selectedPoem.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Character scores */}
                <div className="space-y-2">
                  {Object.entries(selectedPoem.scores)
                    .sort(([, a], [, b]) => b - a)
                    .map(([charId, score]) => {
                      const char = CHARACTERS[charId];
                      if (!char) return null;
                      const name = getCharacterFirstName(charId, settings.characterPresentations);
                      return (
                        <div key={charId} className="flex items-center gap-2">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                            style={{ backgroundColor: `${char.color}40`, color: char.accentColor }}
                          >
                            {name[0]}
                          </div>
                          <span className="text-xs w-16" style={{ color: '#a89888' }}>{name}</span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(26, 21, 32, 0.8)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${score}%`, backgroundColor: char.color }}
                            />
                          </div>
                          <span className="text-xs w-8 text-right" style={{ color: '#a89888' }}>{score}</span>
                        </div>
                      );
                    })}
                </div>
              </motion.div>
            ) : (
              <p className="text-sm text-center py-12" style={{ color: '#555' }}>
                {t("select-poem-prompt", { defaultValue: "Select a poem to view details." })}
              </p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
