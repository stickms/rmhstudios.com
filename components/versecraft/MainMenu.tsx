'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/versecraft/store';
import { loadGame } from '@/lib/versecraft/persistence';

const FLOATING_WORDS = [
  'whisper', 'shadow', 'bloom', 'echo', 'ember',
  'drift', 'moonlight', 'silence', 'dream', 'verse',
  'solitude', 'trembling', 'aurora', 'cadence', 'infinity',
  'crystal', 'ephemeral', 'luminous', 'tender', 'shatter',
];

function FloatingWord({ word, index }: { word: string; index: number }) {
  const duration = 15 + Math.random() * 20;
  const delay = index * 0.8;
  const startX = Math.random() * 100;

  return (
    <motion.span
      className="absolute text-sm pointer-events-none"
      style={{
        left: `${startX}%`,
        color: '#c4a35a',
        opacity: 0,
        fontFamily: 'var(--font-patrick-hand, serif)',
        fontSize: `${12 + Math.random() * 8}px`,
      }}
      initial={{ y: '110vh', opacity: 0 }}
      animate={{
        y: '-10vh',
        opacity: [0, 0.15, 0.15, 0],
        x: [0, (Math.random() - 0.5) * 80],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      {word}
    </motion.span>
  );
}

export function MainMenu() {
  const startNewGame = useGameStore(s => s.startNewGame);
  const continueGame = useGameStore(s => s.continueGame);
  const setScreen = useGameStore(s => s.setScreen);
  const isLoggedIn = useGameStore(s => s.isLoggedIn);
  const [hasSave, setHasSave] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSave() {
      // Check localStorage first (fast)
      if (loadGame(0)) {
        if (!cancelled) { setHasSave(true); setChecking(false); }
        return;
      }
      // Check DB if logged in
      if (isLoggedIn) {
        try {
          const res = await fetch('/api/versecraft/save');
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && data?.saveData) setHasSave(true);
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setChecking(false);
    }

    checkSave();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const menuItems = [
    { label: 'New Game', action: startNewGame, always: true },
    { label: 'Continue', action: () => continueGame(), always: false },
    { label: 'Load Save', action: () => setScreen('load'), always: false },
    { label: 'Progress', action: () => setScreen('progress'), always: false },
    { label: 'Poem Journal', action: () => setScreen('journal'), always: false },
    { label: 'Settings', action: () => setScreen('settings'), always: true },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden">
      {/* Floating words background */}
      <div className="absolute inset-0 overflow-hidden">
        {FLOATING_WORDS.map((word, i) => (
          <FloatingWord key={word} word={word} index={i} />
        ))}
      </div>

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, #1a1520 90%)',
        }}
      />

      {/* Title */}
      <motion.div
        className="relative z-10 text-center mb-12"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      >
        <motion.div
          className="text-sm tracking-[0.5em] uppercase mb-4"
          style={{ color: '#c4a35a' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.5, duration: 1 }}
        >
          ✦
        </motion.div>
        <h1
          className="text-5xl md:text-7xl font-bold tracking-wide mb-3"
          style={{
            fontFamily: 'var(--font-cinzel, serif)',
            color: '#e8e0d0',
            textShadow: '0 0 40px rgba(196, 163, 90, 0.3)',
          }}
        >
          VERSECRAFT
        </h1>
        <p
          className="text-lg md:text-xl italic tracking-wider"
          style={{
            fontFamily: 'var(--font-playfair, serif)',
            color: '#a89888',
          }}
        >
          Whispers of the Muse
        </p>
      </motion.div>

      {/* Menu options */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-3 min-w-[260px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.8 }}
      >
        <AnimatePresence>
          {menuItems
            .filter(item => item.always || hasSave)
            .map((item, i) => (
              <motion.button
                key={item.label}
                className="w-full px-8 py-3 text-lg tracking-wider rounded-sm transition-all duration-200 border border-transparent"
                style={{
                  fontFamily: 'var(--font-playfair, serif)',
                  color: '#e8e0d0',
                  backgroundColor: 'rgba(42, 34, 53, 0.6)',
                }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.1, duration: 0.4 }}
                whileHover={{
                  backgroundColor: 'rgba(196, 163, 90, 0.15)',
                  borderColor: 'rgba(196, 163, 90, 0.4)',
                  scale: 1.02,
                  x: 5,
                }}
                whileTap={{ scale: 0.98 }}
                onClick={item.action}
              >
                <span className="mr-2" style={{ color: '#c4a35a' }}>▸</span>
                {item.label}
              </motion.button>
            ))}
        </AnimatePresence>
      </motion.div>

      {/* Sign-in hint */}
      {!isLoggedIn && !checking && (
        <motion.p
          className="relative z-10 mt-6 text-xs text-center"
          style={{ color: '#666' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 1.5, duration: 1 }}
        >
          Sign in to save progress to the cloud
        </motion.p>
      )}

      {/* Tagline */}
      <motion.p
        className="relative z-10 mt-6 text-sm italic text-center max-w-md px-4"
        style={{ color: '#a89888' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 1.5, duration: 1 }}
      >
        "Every poem is a door. What will you find on the other side?"
      </motion.p>

      {/* Studio credit */}
      <motion.p
        className="absolute bottom-4 text-xs tracking-widest"
        style={{ color: '#555' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 2, duration: 1 }}
      >
        RMH STUDIOS
      </motion.p>
    </div>
  );
}
