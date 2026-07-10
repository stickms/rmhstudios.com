'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { CHARACTERS, getCharacterFirstName } from '@/lib/versecraft/characters';
import type { Grade } from '@/lib/versecraft/types';

const GRADE_STYLES: Record<Grade, { color: string; labelKey: string; labelDefault: string; bg: string }> = {
  S: { color: '#FFD700', labelKey: 'grade-masterpiece', labelDefault: 'Masterpiece', bg: 'rgba(255, 215, 0, 0.15)' },
  A: { color: '#4CAF50', labelKey: 'grade-excellent', labelDefault: 'Excellent', bg: 'rgba(76, 175, 80, 0.15)' },
  B: { color: '#2196F3', labelKey: 'grade-good', labelDefault: 'Good', bg: 'rgba(33, 150, 243, 0.15)' },
  C: { color: '#FF9800', labelKey: 'grade-decent', labelDefault: 'Decent', bg: 'rgba(255, 152, 0, 0.15)' },
  D: { color: '#F44336', labelKey: 'grade-needs-work', labelDefault: 'Needs Work', bg: 'rgba(244, 67, 54, 0.15)' },
  F: { color: '#666666', labelKey: 'grade-rough-draft', labelDefault: 'Rough Draft', bg: 'rgba(102, 102, 102, 0.15)' },
};

function AffinityBar({ characterId, score, affinityChange, reaction, delay }: {
  characterId: string;
  score: number;
  affinityChange: number;
  reaction: string;
  delay: number;
}) {
  const char = CHARACTERS[characterId];
  const settings = useGameStore(s => s.settings);
  const affinity = useGameStore(s => s.affinity[characterId]);

  if (!char || !affinity) return null;

  const { t } = useTranslation("c-versecraft");
  const name = getCharacterFirstName(characterId, settings.characterPresentations);
  const grade = score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : score >= 30 ? 'D' : 'F';
  const gs = GRADE_STYLES[grade];

  return (
    <motion.div
      className="flex items-center gap-3 px-3 py-2 rounded"
      style={{ backgroundColor: 'rgba(42, 34, 53, 0.5)' }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
    >
      {/* Character icon */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{ backgroundColor: `${char.color}40`, color: char.accentColor, border: `1px solid ${char.color}` }}
      >
        {name[0]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: '#e8e0d0' }}>{name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: gs.bg, color: gs.color }}>
            {grade}
          </span>
          <span className="text-xs" style={{ color: affinityChange >= 0 ? '#5cb85c' : '#d9534f' }}>
            {affinityChange >= 0 ? '+' : ''}{affinityChange}
          </span>
        </div>
        <p className="text-xs truncate" style={{ color: '#a89888' }}>
          {t("character-reaction", { defaultValue: "{{name}} {{reaction}} this poem", name, reaction })}
        </p>
      </div>

      {/* Score bar */}
      <div className="w-20 h-2 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: 'rgba(26, 21, 32, 0.8)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: char.color }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ delay: delay + 0.3, duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
}

export function PoemPresentation() {
  const { t } = useTranslation("c-versecraft");
  const currentPoemScore = useGameStore(s => s.currentPoemScore);
  const poemHistory = useGameStore(s => s.poemHistory);
  const closePoemPresentation = useGameStore(s => s.closePoemPresentation);
  const [phase, setPhase] = useState<'poem' | 'grade' | 'reactions'>('poem');

  const latestPoem = poemHistory[poemHistory.length - 1];

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('grade'), 2000);
    const t2 = setTimeout(() => setPhase('reactions'), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!currentPoemScore || !latestPoem) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: '#a89888' }}>{t("no-poem", { defaultValue: "No poem to display." })}</p>
      </div>
    );
  }

  const gs = GRADE_STYLES[currentPoemScore.grade];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-6">
      {/* Poem display */}
      <motion.div
        className="max-w-xl w-full rounded-lg p-6 md:p-8 mb-6"
        style={{
          backgroundColor: 'rgba(245, 240, 232, 0.07)',
          border: '1px solid rgba(196, 163, 90, 0.2)',
        }}
        initial={{ opacity: 0, rotateY: -90 }}
        animate={{ opacity: 1, rotateY: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Poem text */}
        <div className="text-center mb-6">
          <p
            className="text-lg md:text-xl leading-relaxed italic"
            style={{
              fontFamily: 'var(--font-playfair, serif)',
              color: '#e8e0d0',
              whiteSpace: 'pre-line',
            }}
          >
            {latestPoem.text}
          </p>
        </div>

        {/* Grade stamp */}
        <AnimatePresence>
          {(phase === 'grade' || phase === 'reactions') && (
            <motion.div
              className="text-center mb-4"
              initial={{ scale: 3, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200 }}
            >
              <div
                className="inline-block px-6 py-3 rounded-lg"
                style={{
                  backgroundColor: gs.bg,
                  border: `2px solid ${gs.color}`,
                }}
              >
                <span className="text-4xl font-bold" style={{ color: gs.color, fontFamily: 'var(--font-cinzel, serif)' }}>
                  {currentPoemScore.grade}
                </span>
                <p className="text-sm mt-1" style={{ color: gs.color }}>
                  {t(gs.labelKey, { defaultValue: gs.labelDefault })}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bonuses */}
        {currentPoemScore.bonuses.length > 0 && phase === 'reactions' && (
          <motion.div
            className="flex flex-wrap gap-2 justify-center mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {currentPoemScore.bonuses.map(bonus => (
              <span
                key={bonus}
                className="text-xs px-2 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(196, 163, 90, 0.2)', color: '#c4a35a' }}
              >
                {bonus}
              </span>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Character reactions */}
      <AnimatePresence>
        {phase === 'reactions' && (
          <motion.div
            className="max-w-xl w-full space-y-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {Object.entries(currentPoemScore.characterScores)
              .sort(([, a], [, b]) => b.score - a.score)
              .slice(0, 3) // Show top 3 reactions (the characters present)
              .map(([charId, charScore], i) => (
                <AffinityBar
                  key={charId}
                  characterId={charId}
                  score={charScore.score}
                  affinityChange={charScore.affinityChange}
                  reaction={charScore.reaction}
                  delay={i * 0.15}
                />
              ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Continue button */}
      {phase === 'reactions' && (
        <motion.button
          className="mt-8 px-8 py-3 rounded text-base font-semibold transition-all"
          style={{
            backgroundColor: 'rgba(196, 163, 90, 0.25)',
            border: '1px solid rgba(196, 163, 90, 0.5)',
            color: '#c4a35a',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          whileHover={{ backgroundColor: 'rgba(196, 163, 90, 0.4)' }}
          onClick={closePoemPresentation}
        >
          {t("continue", { defaultValue: "Continue" })}
        </motion.button>
      )}
    </div>
  );
}
