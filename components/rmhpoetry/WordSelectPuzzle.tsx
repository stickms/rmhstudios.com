'use client';

import { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/rmhpoetry/store';
import { CHARACTERS, getCharacterFirstName } from '@/lib/rmhpoetry/characters';
import { scoreWordSelectPoem } from '@/lib/rmhpoetry/scoring';
import { getWordsByIds } from '@/lib/rmhpoetry/words';
import type { WordSelectPuzzleData, Word } from '@/lib/rmhpoetry/types';

function WordTile({ word, isSelected, onToggle, disabled }: {
  word: Word;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  // Find which character likes this word most (for hint coloring)
  const bestChar = useMemo(() => {
    let best = { id: '', score: 0 };
    for (const [id, char] of Object.entries(CHARACTERS)) {
      let score = 0;
      for (const cat of word.categories) {
        if (char.lovedWordCategories.includes(cat)) score += 1;
      }
      score += char.preferences.darkness * word.tags.darkness;
      score += char.preferences.sincerity * word.tags.sincerity;
      if (score > best.score) best = { id, score };
    }
    return CHARACTERS[best.id];
  }, [word]);

  const hintColor = bestChar?.color || '#c4a35a';

  return (
    <motion.button
      className="px-3 py-2 rounded text-sm md:text-base transition-all relative"
      style={{
        backgroundColor: isSelected
          ? `${hintColor}30`
          : 'rgba(42, 34, 53, 0.7)',
        border: `1px solid ${isSelected ? `${hintColor}70` : 'rgba(196, 163, 90, 0.15)'}`,
        color: isSelected ? '#e8e0d0' : '#a89888',
        fontFamily: 'var(--font-inter, sans-serif)',
        cursor: disabled && !isSelected ? 'not-allowed' : 'pointer',
        opacity: disabled && !isSelected ? 0.5 : 1,
      }}
      whileHover={!disabled || isSelected ? {
        borderColor: `${hintColor}60`,
        backgroundColor: isSelected ? `${hintColor}40` : 'rgba(196, 163, 90, 0.1)',
        scale: 1.05,
      } : undefined}
      whileTap={!disabled || isSelected ? { scale: 0.95 } : undefined}
      onClick={onToggle}
      layout
    >
      {word.text}
      {isSelected && (
        <motion.div
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs"
          style={{ backgroundColor: hintColor, color: '#1a1520' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        >
          ✓
        </motion.div>
      )}
    </motion.button>
  );
}

export function WordSelectPuzzle() {
  const {
    currentPuzzle, selectedWords, settings,
    toggleWord, clearSelectedWords, submitPoem, setScreen,
  } = useGameStore();

  const puzzle = currentPuzzle as WordSelectPuzzleData | null;

  const selectedWordObjects = useMemo(
    () => getWordsByIds(selectedWords),
    [selectedWords]
  );

  const poemText = useMemo(
    () => selectedWordObjects.map(w => w.text).join(' '),
    [selectedWordObjects]
  );

  const isFull = puzzle ? selectedWords.length >= puzzle.requiredWordCount : false;
  const canSubmit = puzzle ? selectedWords.length === puzzle.requiredWordCount : false;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !puzzle) return;
    const words = getWordsByIds(selectedWords);
    const score = scoreWordSelectPoem(words, settings.characterPresentations);
    submitPoem(score, selectedWords, poemText, 'word_select');
  }, [canSubmit, puzzle, selectedWords, settings.characterPresentations, submitPoem, poemText]);

  if (!puzzle) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: '#a89888' }}>No puzzle loaded.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="p-4 md:p-6 text-center" style={{ backgroundColor: 'rgba(26, 21, 32, 0.9)' }}>
        <h2
          className="text-xl md:text-2xl mb-2"
          style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#c4a35a' }}
        >
          {puzzle.theme}
        </h2>
        <p className="text-sm md:text-base" style={{ color: '#a89888' }}>
          {puzzle.promptText}
        </p>
        <p className="text-sm mt-2" style={{ color: '#666' }}>
          Select {puzzle.requiredWordCount} words to compose your poem
        </p>
      </div>

      {/* Word pool */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-2 justify-center">
          <AnimatePresence mode="popLayout">
            {puzzle.wordPool.map((word, i) => (
              <motion.div
                key={word.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.01, duration: 0.2 }}
              >
                <WordTile
                  word={word}
                  isSelected={selectedWords.includes(word.id)}
                  onToggle={() => toggleWord(word.id)}
                  disabled={isFull && !selectedWords.includes(word.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Selected words / poem area */}
      <div
        className="p-4 md:p-6"
        style={{
          backgroundColor: 'rgba(26, 21, 32, 0.95)',
          borderTop: '1px solid rgba(196, 163, 90, 0.2)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          {/* Poem preview */}
          <div
            className="min-h-[60px] p-3 rounded mb-3"
            style={{
              backgroundColor: 'rgba(245, 240, 232, 0.05)',
              border: '1px solid rgba(196, 163, 90, 0.1)',
            }}
          >
            {selectedWordObjects.length > 0 ? (
              <p
                className="text-base md:text-lg italic leading-relaxed"
                style={{
                  fontFamily: 'var(--font-playfair, serif)',
                  color: '#e8e0d0',
                }}
              >
                {poemText}
              </p>
            ) : (
              <p className="text-sm italic" style={{ color: '#555' }}>
                Your poem will appear here...
              </p>
            )}
          </div>

          {/* Counter & actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span
                className="text-sm font-mono"
                style={{
                  color: canSubmit ? '#c4a35a' : '#a89888',
                }}
              >
                {selectedWords.length}/{puzzle.requiredWordCount} selected
              </span>

              {/* Character reactions (small chibis) */}
              <div className="flex gap-1">
                {Object.entries(CHARACTERS).slice(0, 3).map(([id, char]) => (
                  <div
                    key={id}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                    style={{
                      backgroundColor: `${char.color}30`,
                      border: `1px solid ${char.color}50`,
                      color: char.accentColor,
                    }}
                    title={getCharacterFirstName(id, settings.characterPresentations)}
                  >
                    {char.names[char.defaultPresentation].first[0]}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={clearSelectedWords}
                className="px-4 py-2 rounded text-sm transition-all"
                style={{
                  backgroundColor: 'rgba(42, 34, 53, 0.6)',
                  border: '1px solid rgba(196, 163, 90, 0.15)',
                  color: '#a89888',
                }}
              >
                Clear
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-6 py-2 rounded text-sm font-semibold transition-all"
                style={{
                  backgroundColor: canSubmit ? 'rgba(196, 163, 90, 0.3)' : 'rgba(42, 34, 53, 0.3)',
                  border: `1px solid ${canSubmit ? 'rgba(196, 163, 90, 0.6)' : 'rgba(196, 163, 90, 0.1)'}`,
                  color: canSubmit ? '#c4a35a' : '#555',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                Submit Poem
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
