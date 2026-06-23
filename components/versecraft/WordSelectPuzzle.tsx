'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { CHARACTERS, getCharacterFirstName } from '@/lib/versecraft/characters';
import { scoreWordSelectPoem } from '@/lib/versecraft/scoring';
import { getWordsByIds } from '@/lib/versecraft/words';
import type { WordSelectPuzzleData, Word } from '@/lib/versecraft/types';

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

// Characters present in ch01 puzzle
const TUTORIAL_CHARS = ['luna', 'kai', 'milo'] as const;

const TUTORIAL_STEPS = [
  {
    title: 'Your First Poem',
    content: "You're about to write your first poem by selecting words from the pool. Each word you pick becomes part of your poem — the order you select them in is the order they'll appear.",
    tip: "There's no wrong answer. Write what feels right to you.",
  },
  {
    title: 'Reading the Room',
    content: "Every word is subtly tinted with the color of the character who'd like it most. Pay attention to these hints — they'll guide you toward words that resonate with specific people.",
    tip: "You don't have to please everyone. Targeting one character deeply can be more effective than trying to impress all three.",
  },
  {
    title: 'Bonus Techniques',
    content: 'You can earn bonus points with poetic techniques:',
    bullets: [
      'Alliteration — Pick 3+ words starting with the same letter',
      'Rhyming Pair — Select words that rhyme with each other',
      'Literary Vocabulary — Use rare, sophisticated words',
    ],
    tip: "Bonuses apply to every character's score, so they're always worth pursuing.",
  },
];

function PoemTutorial({ onDismiss, presentations }: {
  onDismiss: () => void;
  presentations: Record<string, string>;
}) {
  const { t } = useTranslation("c-versecraft");
  const [step, setStep] = useState(0);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const isCharStep = step === 1;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 8, 15, 0.85)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="max-w-lg w-full rounded-lg p-6 md:p-8"
        style={{
          backgroundColor: 'rgba(26, 21, 32, 0.98)',
          border: '1px solid rgba(196, 163, 90, 0.3)',
          backdropFilter: 'blur(12px)',
        }}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        key={step}
      >
        {/* Step indicator */}
        <div className="flex gap-2 mb-4">
          {TUTORIAL_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i <= step ? '#c4a35a' : 'rgba(196, 163, 90, 0.15)',
              }}
            />
          ))}
        </div>

        {/* Title */}
        <h3
          className="text-lg md:text-xl mb-3"
          style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#c4a35a' }}
        >
          {step === 0
            ? t("tutorial-step0-title", { defaultValue: "Your First Poem" })
            : step === 1
            ? t("tutorial-step1-title", { defaultValue: "Reading the Room" })
            : t("tutorial-step2-title", { defaultValue: "Bonus Techniques" })}
        </h3>

        {/* Content */}
        <p
          className="text-sm md:text-base leading-relaxed mb-4"
          style={{ color: '#d0c8b8' }}
        >
          {step === 0
            ? t("tutorial-step0-content", { defaultValue: "You're about to write your first poem by selecting words from the pool. Each word you pick becomes part of your poem — the order you select them in is the order they'll appear." })
            : step === 1
            ? t("tutorial-step1-content", { defaultValue: "Every word is subtly tinted with the color of the character who'd like it most. Pay attention to these hints — they'll guide you toward words that resonate with specific people." })
            : t("tutorial-step2-content", { defaultValue: "You can earn bonus points with poetic techniques:" })}
        </p>

        {/* Bullet list for bonus step */}
        {'bullets' in current && current.bullets && (
          <ul className="space-y-2 mb-4 ml-1">
            <li className="flex items-start gap-2 text-sm" style={{ color: '#b8b0a0' }}>
              <span style={{ color: '#c4a35a' }} className="mt-0.5 shrink-0">&#9830;</span>
              {t("tutorial-bullet-alliteration", { defaultValue: "Alliteration — Pick 3+ words starting with the same letter" })}
            </li>
            <li className="flex items-start gap-2 text-sm" style={{ color: '#b8b0a0' }}>
              <span style={{ color: '#c4a35a' }} className="mt-0.5 shrink-0">&#9830;</span>
              {t("tutorial-bullet-rhyming", { defaultValue: "Rhyming Pair — Select words that rhyme with each other" })}
            </li>
            <li className="flex items-start gap-2 text-sm" style={{ color: '#b8b0a0' }}>
              <span style={{ color: '#c4a35a' }} className="mt-0.5 shrink-0">&#9830;</span>
              {t("tutorial-bullet-vocabulary", { defaultValue: "Literary Vocabulary — Use rare, sophisticated words" })}
            </li>
          </ul>
        )}

        {/* Character cards for the targeting step */}
        {isCharStep && (
          <div className="space-y-2 mb-4">
            {TUTORIAL_CHARS.map(id => {
              const char = CHARACTERS[id];
              if (!char) return null;
              const name = getCharacterFirstName(id, presentations);
              // Pick top 3 loved categories as readable labels
              const topTastes = char.lovedWordCategories.slice(0, 3).map(
                c => c.replace(/_/g, ' ')
              );
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 p-3 rounded"
                  style={{
                    backgroundColor: `${char.color}12`,
                    border: `1px solid ${char.color}30`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: `${char.color}40`, color: char.accentColor }}
                  >
                    {name[0]}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold block" style={{ color: char.accentColor }}>
                      {name}
                    </span>
                    <span className="text-xs block" style={{ color: '#8a8070' }}>
                      {t("tutorial-char-loves", { defaultValue: "Loves: {{tastes}}", tastes: topTastes.join(', ') })}
                    </span>
                  </div>
                  {/* Color swatch hint */}
                  <div
                    className="w-4 h-4 rounded-sm shrink-0 ml-auto"
                    style={{ backgroundColor: char.color }}
                    title={t("tutorial-char-color-hint", { defaultValue: "Words tinted this color appeal to {{name}}", name })}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Tip callout */}
        <div
          className="text-xs p-3 rounded mb-5"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.08)',
            border: '1px solid rgba(196, 163, 90, 0.15)',
            color: '#a89878',
          }}
        >
          <span style={{ color: '#c4a35a' }}>{t("tip-label", { defaultValue: "Tip: " })}</span>
          {step === 0
            ? t("tutorial-step0-tip", { defaultValue: "There's no wrong answer. Write what feels right to you." })
            : step === 1
            ? t("tutorial-step1-tip", { defaultValue: "You don't have to please everyone. Targeting one character deeply can be more effective than trying to impress all three." })
            : t("tutorial-step2-tip", { defaultValue: "Bonuses apply to every character's score, so they're always worth pursuing." })}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="text-sm px-4 py-2 rounded transition-all"
              style={{ color: '#a89888', border: '1px solid rgba(196, 163, 90, 0.15)' }}
            >
              {t("back", { defaultValue: "Back" })}
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="text-sm px-4 py-2 rounded transition-all"
              style={{ color: '#666' }}
            >
              {t("skip", { defaultValue: "Skip" })}
            </button>
          )}

          <button
            onClick={isLast ? onDismiss : () => setStep(s => s + 1)}
            className="text-sm px-6 py-2 rounded font-semibold transition-all"
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.25)',
              border: '1px solid rgba(196, 163, 90, 0.5)',
              color: '#c4a35a',
            }}
          >
            {isLast ? t("start-writing", { defaultValue: "Start Writing" }) : t("next", { defaultValue: "Next" })}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function WordSelectPuzzle() {
  const { t } = useTranslation("c-versecraft");
  const {
    currentPuzzle, selectedWords, settings, totalPoemsWritten,
    toggleWord, clearSelectedWords, submitPoem, setScreen,
  } = useGameStore();

  const puzzle = currentPuzzle as WordSelectPuzzleData | null;
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  const showTutorial = totalPoemsWritten === 0 && !tutorialDismissed;

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
        <p style={{ color: '#a89888' }}>{t("no-puzzle-loaded", { defaultValue: "No puzzle loaded." })}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tutorial overlay for first poem */}
      <AnimatePresence>
        {showTutorial && (
          <PoemTutorial
            onDismiss={() => setTutorialDismissed(true)}
            presentations={settings.characterPresentations}
          />
        )}
      </AnimatePresence>

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
          {t("select-words-prompt", { defaultValue: "Select {{count}} words to compose your poem", count: puzzle.requiredWordCount })}
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
                {t("poem-placeholder", { defaultValue: "Your poem will appear here..." })}
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
                {t("words-selected-count", { defaultValue: "{{selected}}/{{total}} selected", selected: selectedWords.length, total: puzzle.requiredWordCount })}
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
                {t("clear", { defaultValue: "Clear" })}
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
                {t("submit-poem", { defaultValue: "Submit Poem" })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
