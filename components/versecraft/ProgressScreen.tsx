'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/versecraft/store';
import { CHARACTERS } from '@/lib/versecraft/characters';
import { formatPlaytime } from '@/lib/versecraft/persistence';
import {
  ALL_CHAPTERS, ALL_ROUTES, ALL_ENDINGS,
  getProgressPercentage, DEFAULT_PROGRESS,
  type ProgressData,
} from '@/lib/versecraft/progress';

export function ProgressScreen() {
  const setScreen = useGameStore(s => s.setScreen);
  const isLoggedIn = useGameStore(s => s.isLoggedIn);
  const completedChapters = useGameStore(s => s.completedChapters);
  const affinity = useGameStore(s => s.affinity);
  const totalPoemsWritten = useGameStore(s => s.totalPoemsWritten);
  const playtime = useGameStore(s => s.playtime);

  const { t } = useTranslation("c-versecraft");

  const [dbProgress, setDbProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch progress from DB if logged in
  useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    fetch('/api/versecraft/progress')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.progress) setDbProgress(data.progress);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  // Merge local state with DB progress (use whichever has more progress)
  const localProgress: ProgressData = {
    completedChapters,
    unlockedEndings: [],
    completedRoutes: Object.entries(affinity)
      .filter(([, a]) => a.routeCompleted)
      .map(([id]) => id),
    totalPoemsWritten,
    totalPlaytime: playtime,
  };

  const progress = dbProgress
    ? {
        completedChapters: dbProgress.completedChapters.length > localProgress.completedChapters.length
          ? dbProgress.completedChapters as string[]
          : localProgress.completedChapters,
        unlockedEndings: (dbProgress.unlockedEndings ?? []) as string[],
        completedRoutes: dbProgress.completedRoutes.length > localProgress.completedRoutes.length
          ? dbProgress.completedRoutes as string[]
          : localProgress.completedRoutes,
        totalPoemsWritten: Math.max(dbProgress.totalPoemsWritten, localProgress.totalPoemsWritten),
        totalPlaytime: Math.max(dbProgress.totalPlaytime, localProgress.totalPlaytime),
      }
    : localProgress;

  const overallPct = getProgressPercentage(progress ?? DEFAULT_PROGRESS);

  // Group chapters by act
  const chaptersByAct = ALL_CHAPTERS.reduce<Record<number, typeof ALL_CHAPTERS>>((acc, ch) => {
    (acc[ch.act] ??= []).push(ch);
    return acc;
  }, {});

  // Find highest-affinity character
  const favoriteChar = Object.entries(affinity)
    .sort(([, a], [, b]) => b.affinity - a.affinity)
    .find(([id]) => CHARACTERS[id]);

  return (
    <div className="min-h-screen p-4 md:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h1
              className="text-3xl md:text-4xl font-bold"
              style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0' }}
            >
              {t("your-journey", { defaultValue: "Your Journey" })}
            </h1>
            <button
              onClick={() => setScreen('menu')}
              className="px-4 py-2 text-sm rounded transition-all"
              style={{
                backgroundColor: 'rgba(42, 34, 53, 0.6)',
                border: '1px solid rgba(196, 163, 90, 0.2)',
                color: '#a89888',
              }}
            >
              {t("back", { defaultValue: "Back" })}
            </button>
          </div>

          {/* Overall progress bar */}
          <div className="mb-2 flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(42, 34, 53, 0.8)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: '#c4a35a' }}
                initial={{ width: 0 }}
                animate={{ width: `${overallPct}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
            <span className="text-sm font-semibold" style={{ color: '#c4a35a' }}>{overallPct}%</span>
          </div>

          {loading && (
            <p className="text-xs" style={{ color: '#666' }}>{t("syncing-progress", { defaultValue: "Syncing progress..." })}</p>
          )}
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {[
            { label: t("stat-poems-written", { defaultValue: "Poems Written" }), value: String(progress.totalPoemsWritten) },
            { label: t("stat-playtime", { defaultValue: "Playtime" }), value: formatPlaytime(progress.totalPlaytime) },
            { label: t("stat-chapters", { defaultValue: "Chapters" }), value: `${progress.completedChapters.length}/${ALL_CHAPTERS.length}` },
            { label: t("stat-favorite", { defaultValue: "Favorite" }), value: favoriteChar ? CHARACTERS[favoriteChar[0]]?.names.feminine.first ?? '—' : '—' },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-lg p-3 text-center"
              style={{ backgroundColor: 'rgba(42, 34, 53, 0.5)', border: '1px solid rgba(196, 163, 90, 0.1)' }}
            >
              <div className="text-lg font-bold" style={{ color: '#c4a35a' }}>{stat.value}</div>
              <div className="text-xs" style={{ color: '#888' }}>{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Chapters by Act */}
        <motion.section
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h2
            className="text-xl font-semibold mb-4"
            style={{ fontFamily: 'var(--font-playfair, serif)', color: '#e8e0d0' }}
          >
            {t("chapters-heading", { defaultValue: "Chapters" })}
          </h2>
          {Object.entries(chaptersByAct).map(([act, chapters]) => (
            <div key={act} className="mb-4">
              <h3 className="text-sm mb-2" style={{ color: '#c4a35a' }}>{t("act-label", { defaultValue: "Act {{act}}", act })}</h3>
              <div className="grid grid-cols-5 gap-2">
                {chapters.map(ch => {
                  const completed = progress.completedChapters.includes(ch.id);
                  return (
                    <div
                      key={ch.id}
                      className="rounded p-2 text-center text-xs"
                      style={{
                        backgroundColor: completed ? 'rgba(196, 163, 90, 0.15)' : 'rgba(42, 34, 53, 0.4)',
                        border: `1px solid ${completed ? 'rgba(196, 163, 90, 0.3)' : 'rgba(255,255,255,0.05)'}`,
                        color: completed ? '#e8e0d0' : '#555',
                      }}
                      title={completed ? ch.title : t("locked", { defaultValue: "Locked" })}
                    >
                      {completed ? (
                        <>
                          <div style={{ color: '#c4a35a' }}>&#10003;</div>
                          <div className="truncate">{ch.title}</div>
                        </>
                      ) : (
                        <>
                          <div>&#128274;</div>
                          <div>{t("chapter-number", { defaultValue: "Ch. {{number}}", number: ch.number })}</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </motion.section>

        {/* Character Routes */}
        <motion.section
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <h2
            className="text-xl font-semibold mb-4"
            style={{ fontFamily: 'var(--font-playfair, serif)', color: '#e8e0d0' }}
          >
            {t("character-routes-heading", { defaultValue: "Character Routes" })}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ALL_ROUTES.map(route => {
              const char = CHARACTERS[route.characterId];
              const charAffinity = affinity[route.characterId];
              const isCompleted = progress.completedRoutes.includes(route.id);
              const isStarted = charAffinity?.routeStarted ?? false;
              const charColor = char?.color ?? '#666';

              return (
                <div
                  key={route.id}
                  className="rounded-lg p-4 flex items-center gap-4"
                  style={{
                    backgroundColor: 'rgba(42, 34, 53, 0.5)',
                    border: `1px solid ${isCompleted ? charColor + '60' : isStarted ? charColor + '30' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  {/* Color indicator */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm shrink-0"
                    style={{
                      backgroundColor: isCompleted || isStarted ? charColor + '25' : 'rgba(42, 34, 53, 0.8)',
                      border: `2px solid ${isCompleted ? charColor : '#333'}`,
                      color: isCompleted ? charColor : '#555',
                    }}
                  >
                    {isCompleted ? '&#10003;' : isStarted ? '...' : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold" style={{ color: isCompleted || isStarted ? '#e8e0d0' : '#666' }}>
                      {route.id === 'muse' && !isStarted ? '???' : route.name}
                    </div>
                    <div className="text-xs truncate" style={{ color: '#888' }}>
                      {isCompleted ? t("route-complete", { defaultValue: "Route Complete" }) : isStarted ? t("in-progress", { defaultValue: "In Progress" }) : route.id === 'muse' ? t("hidden-route", { defaultValue: "Hidden Route" }) : t("locked", { defaultValue: "Locked" })}
                    </div>
                    {charAffinity && charAffinity.affinity > 0 && (
                      <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(42, 34, 53, 0.8)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{ backgroundColor: charColor, width: `${Math.min(100, (charAffinity.affinity / 1800) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* Endings */}
        <motion.section
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <h2
            className="text-xl font-semibold mb-4"
            style={{ fontFamily: 'var(--font-playfair, serif)', color: '#e8e0d0' }}
          >
            {t("endings-heading", { defaultValue: "Endings ({{unlocked}}/{{total}})", unlocked: progress.unlockedEndings.length, total: ALL_ENDINGS.length })}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ALL_ENDINGS.map(ending => {
              const unlocked = progress.unlockedEndings.includes(ending.id);
              const route = ALL_ROUTES.find(r => r.id === ending.route);
              const char = route?.characterId ? CHARACTERS[route.characterId] : null;
              const endingColor = char?.color ?? '#c4a35a';

              return (
                <div
                  key={ending.id}
                  className="rounded-lg p-3"
                  style={{
                    backgroundColor: unlocked ? 'rgba(196, 163, 90, 0.08)' : 'rgba(42, 34, 53, 0.4)',
                    border: `1px solid ${unlocked ? endingColor + '40' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <div className="text-sm font-semibold mb-1" style={{ color: unlocked ? '#e8e0d0' : '#555' }}>
                    {unlocked ? ending.name : '???'}
                  </div>
                  <div className="text-xs" style={{ color: unlocked ? '#a89888' : '#444' }}>
                    {unlocked ? ending.description : t("ending-not-discovered", { defaultValue: "Ending not yet discovered" })}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        {!isLoggedIn && (
          <motion.p
            className="text-center text-sm mt-4 mb-8"
            style={{ color: '#666' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            transition={{ delay: 0.6 }}
          >
            {t("sign-in-to-save", { defaultValue: "Sign in to save your progress to the cloud" })}
          </motion.p>
        )}
      </div>
    </div>
  );
}
