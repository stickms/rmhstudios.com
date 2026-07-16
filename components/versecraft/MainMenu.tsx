'use client';

import { useState, useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/versecraft/store';
import { loadGame } from '@/lib/versecraft/persistence';
import { spriteUrl } from '@/lib/versecraft/sprites/registry';
import { ShareSeed } from './ShareSeed';
import { GeneratingState } from './GeneratingState';

const FLOATING_WORDS = [
  'whisper', 'shadow', 'bloom', 'echo', 'ember', 'drift', 'moonlight', 'silence',
  'dream', 'verse', 'solitude', 'aurora', 'cadence', 'infinity', 'luminous', 'tender',
];

const TAGLINES = [
  'A new emotional story every time — written for you.',
  'Your cast. Your bonds. Your seed to share.',
  'No two playthroughs are ever the same.',
  'Prompt a life, or let fate deal the cards.',
];

function FloatingWord({ word, index }: { word: string; index: number }) {
  const duration = 16 + ((index * 37) % 18);
  const startX = (index * 53) % 100;
  return (
    <motion.span
      className="absolute pointer-events-none"
      style={{ left: `${startX}%`, color: '#c4a35a', fontFamily: 'var(--font-patrick-hand, serif)', fontSize: `${12 + (index % 4) * 3}px` }}
      initial={{ y: '110vh', opacity: 0 }}
      animate={{ y: '-10vh', opacity: [0, 0.16, 0.16, 0] }}
      transition={{ duration, delay: index * 0.9, repeat: Infinity, ease: 'linear' }}
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
  const reducedMotion = useGameStore(s => s.settings.reducedMotion);

  const [hasSave, setHasSave] = useState(false);
  const [checking, setChecking] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [tagline, setTagline] = useState(0);

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

  useEffect(() => {
    if (reducedMotion) return;
    const i = setInterval(() => setTagline(v => (v + 1) % TAGLINES.length), 4200);
    return () => clearInterval(i);
  }, [reducedMotion]);

  if (continuing) {
    return (
      <GeneratingState title="Loading your story…" note="Restoring your cast and where you left off."
        steps={['Finding your save…', 'Waking the cast…', 'Returning to the scene…']} />
    );
  }

  const tile = 'group rounded-xl px-4 py-3.5 text-left transition-all active:scale-[0.98] flex items-center gap-3';
  const tileStyle = { backgroundColor: 'rgba(26,21,32,0.66)', border: '1px solid rgba(196,163,90,0.16)', color: '#e8e0d0', minHeight: 56 } as const;

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      {/* Atmosphere */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% -10%, #2a2038 0%, #1a1520 55%, #100d16 100%)' }} />
      {!reducedMotion && (
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {FLOATING_WORDS.map((w, i) => <FloatingWord key={w} word={w} index={i} />)}
        </div>
      )}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, #100d16 95%)' }} />

      <div className="relative z-10 min-h-[100dvh] flex flex-col items-center justify-center px-5 py-10">
        {/* Title */}
        <motion.div className="text-center mb-7" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }}>
          <div className="text-[11px] tracking-[0.6em] uppercase mb-3" style={{ color: '#c4a35a', opacity: 0.7 }}>✦ poetry · romance · fate ✦</div>
          <h1 className="text-6xl md:text-8xl font-bold tracking-wide" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#e8e0d0', textShadow: '0 0 50px rgba(196,163,90,0.35)' }}>
            VERSECRAFT
          </h1>
          <div className="h-6 mt-3 relative w-full max-w-md mx-auto">
            <AnimatePresence mode="wait">
              <motion.p key={tagline} className="absolute inset-x-0 text-sm md:text-base italic px-4"
                style={{ fontFamily: 'var(--font-playfair, serif)', color: '#a89888' }}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.5 }}>
                {TAGLINES[tagline]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="w-full max-w-sm flex flex-col gap-3">
          {/* Active story panel */}
          <AnimatePresence>
            {world && (
              <motion.div
                className="rounded-2xl p-4"
                style={{ background: `linear-gradient(150deg, ${world.characters[0]?.color ?? '#4A3B6B'}26, rgba(26,21,32,0.8))`, border: '1px solid rgba(196,163,90,0.22)' }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              >
                <div className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: '#c4a35a' }}>Your current story</div>
                <div className="text-lg leading-tight mb-0.5" style={{ fontFamily: 'var(--font-playfair, serif)', color: '#e8e0d0' }}>{world.title}</div>
                <div className="text-xs mb-3" style={{ color: '#a89888' }}>Chapter {chapterIndex + 1} of {world.routePlan.totalChapters}</div>
                <div className="flex -space-x-2 mb-3">
                  {world.characters.slice(0, 5).map(c => {
                    const u = spriteUrl(c.packId, 'happy') ?? spriteUrl(c.packId, 'neutral');
                    return (
                      <div key={c.id} className="w-9 h-9 rounded-full overflow-hidden flex items-end justify-center"
                        style={{ background: `linear-gradient(160deg, ${c.color}55, #1a1520)`, border: `2px solid ${c.color}` }}>
                        {u && <img src={u} alt={c.name} className="h-[150%] object-contain object-bottom" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => { setContinuing(true); try { await continueGame(); } finally { setContinuing(false); } }}
                    className="flex-1 rounded-lg py-2.5 text-sm active:scale-95 transition-transform"
                    style={{ backgroundColor: 'rgba(196,163,90,0.25)', border: '1px solid rgba(196,163,90,0.5)', color: '#fff', fontFamily: 'var(--font-playfair, serif)' }}>
                    ▸ Continue
                  </button>
                  <button onClick={() => setScreen('cast')} className="rounded-lg px-4 py-2.5 text-sm active:scale-95 transition-transform"
                    style={{ backgroundColor: 'rgba(42,34,53,0.7)', border: '1px solid rgba(196,163,90,0.2)', color: '#e8e0d0' }}>♥ Cast</button>
                </div>
                <div className="mt-2 flex justify-center"><ShareSeed seed={world.seed} compact /></div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hero: New Story */}
          <motion.button
            onClick={() => setScreen('world_setup')}
            className="relative overflow-hidden rounded-2xl px-5 py-5 text-left active:scale-[0.98] transition-transform"
            style={{ background: 'linear-gradient(135deg, rgba(196,163,90,0.28), rgba(123,63,160,0.28))', border: '1px solid rgba(196,163,90,0.45)' }}
            whileHover={reducedMotion ? undefined : { scale: 1.01 }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          >
            <div className="text-xl mb-0.5" style={{ fontFamily: 'var(--font-cinzel, serif)', color: '#fff' }}>✦ New Story</div>
            <div className="text-xs" style={{ color: '#d8cdb8' }}>Prompt the life you want, or roll the dice.</div>
          </motion.button>

          {/* Continue (if save exists but no world loaded yet) */}
          {hasSave && !world && (
            <button className={tile} style={tileStyle}
              onClick={async () => { setContinuing(true); try { await continueGame(); } finally { setContinuing(false); } }}>
              <span style={{ color: '#c4a35a' }}>▸</span>
              <span className="flex-1">{t('continue', { defaultValue: 'Continue' })}</span>
            </button>
          )}

          {/* Secondary tiles */}
          <div className="grid grid-cols-2 gap-3">
            <button className={tile} style={tileStyle} onClick={() => setScreen('world_setup')}>
              <span style={{ color: '#c4a35a' }}>⧉</span><span className="flex-1 text-sm">Play a seed</span>
            </button>
            <button className={tile} style={tileStyle} onClick={() => setScreen('settings')}>
              <span style={{ color: '#c4a35a' }}>⚙</span><span className="flex-1 text-sm">Settings</span>
            </button>
          </div>
        </div>

        {!isLoggedIn && !checking && (
          <p className="mt-7 text-xs text-center px-6 max-w-xs" style={{ color: '#6f6657' }}>
            {t('sign-in-hint', { defaultValue: 'Sign in to save your stories to the cloud and replay them anywhere.' })}
          </p>
        )}
        <p className="mt-5 text-[11px] tracking-widest" style={{ color: '#4f4a44' }}>RMH STUDIOS</p>
      </div>
    </div>
  );
}
