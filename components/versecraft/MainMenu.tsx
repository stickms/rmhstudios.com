'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/versecraft/store';
import { loadGame } from '@/lib/versecraft/persistence';
import { ShareSeed } from './ShareSeed';

const FLOATING_WORDS = [
  'whisper', 'shadow', 'bloom', 'echo', 'ember', 'drift', 'moonlight', 'silence',
  'dream', 'verse', 'solitude', 'trembling', 'aurora', 'cadence', 'infinity',
  'crystal', 'ephemeral', 'luminous', 'tender', 'shatter',
];

function FloatingWord({ word, index }: { word: string; index: number }) {
  const duration = 15 + ((index * 37) % 20);
  const startX = (index * 53) % 100;
  return (
    <motion.span
      className="absolute pointer-events-none"
      style={{ left: `${startX}%`, color: '#c4a35a', fontFamily: 'var(--font-patrick-hand, serif)', fontSize: `${12 + (index % 4) * 3}px` }}
      initial={{ y: '110vh', opacity: 0 }}
      animate={{ y: '-10vh', opacity: [0, 0.15, 0.15, 0] }}
      transition={{ duration, delay: index * 0.8, repeat: Infinity, ease: 'linear' }}
    >
      {word}
    </motion.span>
  );
}

export function MainMenu() {
  const { t } = useTranslation('c-versecraft');
  const continueGame = useGameStore(s => s.continueGame);
  const setScreen = useGameStore(s => s.setScreen);
  const isLoggedIn = useGameStore(s => s.isLoggedIn);
  const world = useGameStore(s => s.world);
  const chapterIndex = useGameStore(s => s.currentChapterIndex);
  const [hasSave, setHasSave] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loadGame(0)) { if (!cancelled) { setHasSave(true); setChecking(false); } return; }
      if (isLoggedIn) {
        try {
          const res = await fetch('/api/versecraft/save');
          if (res.ok) { const d = await res.json(); if (!cancelled && d?.saveData) setHasSave(true); }
        } catch { /* ignore */ }
      }
      if (!cancelled) setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const btn = 'w-full px-6 rounded-md transition-all duration-200 border flex items-center justify-center gap-2';
  const primaryStyle = { minHeight: 52, backgroundColor: 'rgba(196,163,90,0.2)', borderColor: 'rgba(196,163,90,0.5)', color: '#e8e0d0', fontFamily: 'var(--font-playfair, serif)' } as const;
  const ghostStyle = { minHeight: 48, backgroundColor: 'rgba(42,34,53,0.6)', borderColor: 'transparent', color: '#e8e0d0', fontFamily: 'var(--font-playfair, serif)' } as const;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[100dvh] overflow-hidden px-5 py-10">
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        {FLOATING_WORDS.map((w, i) => <FloatingWord key={w} word={w} index={i} />)}
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, #1a1520 90%)' }} />

      <motion.div className="relative z-10 text-center mb-8" initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
        <div className="text-xs tracking-[0.5em] uppercase mb-3" style={{ color: '#c4a35a', opacity: 0.7 }}>✦</div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-wide mb-2" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0', textShadow: '0 0 40px rgba(196,163,90,0.3)' }}>
          VERSECRAFT
        </h1>
        <p className="text-base md:text-lg italic tracking-wide px-4" style={{ fontFamily: 'var(--font-playfair, serif)', color: '#a89888' }}>
          A new emotional story every time — written for you.
        </p>
      </motion.div>

      <motion.div className="relative z-10 flex flex-col items-stretch gap-2.5 w-full max-w-xs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.7 }}>
        <button className={btn} style={primaryStyle} onClick={() => setScreen('world_setup')}>
          <span style={{ color: '#c4a35a' }}>✦</span> {t('new-story', { defaultValue: 'New Story' })}
        </button>

        {(hasSave || world) && (
          <button className={btn} style={ghostStyle} onClick={() => void continueGame()}>
            <span style={{ color: '#c4a35a' }}>▸</span> {t('continue', { defaultValue: 'Continue' })}
          </button>
        )}
        {world && (
          <button className={btn} style={ghostStyle} onClick={() => setScreen('cast')}>
            <span style={{ color: '#c4a35a' }}>♥</span> {t('cast', { defaultValue: 'Cast & Bonds' })}
          </button>
        )}
        <button className={btn} style={ghostStyle} onClick={() => setScreen('settings')}>
          <span style={{ color: '#c4a35a' }}>⚙</span> {t('settings', { defaultValue: 'Settings' })}
        </button>
      </motion.div>

      {/* Active version chip */}
      <AnimatePresence>
        {world && (
          <motion.div className="relative z-10 mt-6 flex flex-col items-center gap-1.5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.8 }}>
            <span className="text-xs" style={{ color: '#a89888' }}>
              {world.title} · Ch.{chapterIndex + 1}/{world.routePlan.totalChapters}
            </span>
            <ShareSeed seed={world.seed} compact />
          </motion.div>
        )}
      </AnimatePresence>

      {!isLoggedIn && !checking && (
        <p className="relative z-10 mt-6 text-xs text-center px-6" style={{ color: '#666' }}>
          {t('sign-in-hint', { defaultValue: 'Sign in to save your stories to the cloud and replay them anywhere.' })}
        </p>
      )}

      <p className="absolute bottom-4 text-xs tracking-widest" style={{ color: '#555' }}>RMH STUDIOS</p>
    </div>
  );
}
