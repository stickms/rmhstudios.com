'use client';

import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { CHARACTERS, getCharacterFirstName } from '@/lib/versecraft/characters';
import { formatPlaytime } from '@/lib/versecraft/persistence';
import { getChapterEntry, getNextChapterId } from '@/lib/versecraft/chapters/registry';
import { ALL_CHAPTERS } from '@/lib/versecraft/progress';

export function ChapterSummary() {
  const { t } = useTranslation("c-versecraft");
  const {
    currentChapter, affinity, poemHistory, totalPoemsWritten,
    playtime, settings, setScreen, completeChapter, advanceToNextChapter,
  } = useGameStore();

  // Look up chapter data from registry
  const chapterEntry = getChapterEntry(currentChapter);
  const chapterTitle = chapterEntry?.data.title
    ?? ALL_CHAPTERS.find(c => c.id === currentChapter)?.title
    ?? 'Unknown Chapter';

  const nextChapterId = getNextChapterId(currentChapter);
  const hasNextChapter = !!nextChapterId;

  // Get the latest poems from this chapter
  const chapterPoems = poemHistory.filter(p => p.chapter === currentChapter);

  const handleNextChapter = () => {
    completeChapter();
    advanceToNextChapter();
  };

  const handleMainMenu = () => {
    completeChapter();
    setScreen('menu');
  };

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
          {t("chapter-complete", { defaultValue: "Chapter Complete" })}
        </h2>
        <p
          className="text-center text-sm mb-6 italic"
          style={{ color: '#a89888', fontFamily: 'var(--font-playfair, serif)' }}
        >
          {chapterTitle}
        </p>

        {/* Stats */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <span style={{ color: '#a89888' }}>{t("poems-written", { defaultValue: "Poems Written" })}</span>
            <span style={{ color: '#e8e0d0' }}>{chapterPoems.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#a89888' }}>{t("playtime", { defaultValue: "Playtime" })}</span>
            <span style={{ color: '#e8e0d0' }}>{formatPlaytime(playtime)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#a89888' }}>{t("total-poems", { defaultValue: "Total Poems" })}</span>
            <span style={{ color: '#e8e0d0' }}>{totalPoemsWritten}</span>
          </div>
        </div>

        {/* Character affinity changes */}
        <div className="mb-6">
          <h3 className="text-sm mb-3" style={{ color: '#a89888' }}>{t("relationships", { defaultValue: "Relationships" })}</h3>
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
            onClick={handleMainMenu}
            className="px-6 py-2.5 rounded text-sm font-semibold transition-all hover:brightness-125"
            style={{
              backgroundColor: 'rgba(196, 163, 90, 0.15)',
              border: '1px solid rgba(196, 163, 90, 0.3)',
              color: '#a89888',
            }}
          >
            {t("main-menu", { defaultValue: "Main Menu" })}
          </button>
          {hasNextChapter ? (
            <button
              onClick={handleNextChapter}
              className="px-6 py-2.5 rounded text-sm font-semibold transition-all hover:brightness-125"
              style={{
                backgroundColor: 'rgba(196, 163, 90, 0.25)',
                border: '1px solid rgba(196, 163, 90, 0.5)',
                color: '#c4a35a',
              }}
            >
              {t("next-chapter", { defaultValue: "Next Chapter" })}
            </button>
          ) : (
            <button
              disabled
              className="px-6 py-2.5 rounded text-sm font-semibold cursor-not-allowed opacity-50"
              style={{
                backgroundColor: 'rgba(196, 163, 90, 0.1)',
                border: '1px solid rgba(196, 163, 90, 0.15)',
                color: '#a89888',
              }}
            >
              {t("coming-soon", { defaultValue: "Coming Soon" })}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
