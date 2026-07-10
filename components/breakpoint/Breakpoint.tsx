'use client';

import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useBreakpointStore } from '@/lib/breakpoint/store';
import { MainMenu } from './MainMenu';
import { AgentSelect } from './AgentSelect';
import { Lobby } from './Lobby';
import { ResultScreen } from './ResultScreen';
import './breakpoint.css';

const GameView = lazy(() => import('./GameView').then((m) => ({ default: m.GameView })));

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.35 },
};

export default function Breakpoint() {
  const phase = useBreakpointStore((s) => s.phase);

  // lock body scroll while in the game
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="bp-root">
      <AnimatePresence mode="wait">
        {phase === 'menu' && (
          <motion.div key="menu" className="bp-screen" {...fade}><MainMenu /></motion.div>
        )}
        {phase === 'agentSelect' && (
          <motion.div key="agent" className="bp-screen" {...fade}><AgentSelect /></motion.div>
        )}
        {phase === 'lobby' && (
          <motion.div key="lobby" className="bp-screen" {...fade}><Lobby /></motion.div>
        )}
        {(phase === 'match' || phase === 'loading') && (
          <motion.div key="match" className="bp-screen" {...fade}>
            <Suspense fallback={<div className="bp-loading">DEPLOYING…</div>}>
              <GameView />
            </Suspense>
          </motion.div>
        )}
        {phase === 'result' && (
          <motion.div key="result" className="bp-screen" {...fade}><ResultScreen /></motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
