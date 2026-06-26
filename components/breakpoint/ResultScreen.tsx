'use client';

import { motion } from 'framer-motion';
import { useBreakpointStore } from '@/lib/breakpoint/store';

export function ResultScreen() {
  const lastWinner = useBreakpointStore((s) => s.lastWinner);
  const lastScore = useBreakpointStore((s) => s.lastScore);
  const localTeam = useBreakpointStore((s) => s.matchConfig?.localTeam ?? 'attackers');
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const reset = useBreakpointStore((s) => s.reset);

  const won = lastWinner === localTeam;

  return (
    <div className={`bp-result ${won ? 'win' : 'lose'}`}>
      <motion.div
        className="bp-result-inner"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
      >
        <div className="bp-result-verdict">{won ? 'VICTORY' : 'DEFEAT'}</div>
        <div className="bp-result-score">
          <span className="att">{lastScore.att}</span>
          <span className="sep">:</span>
          <span className="def">{lastScore.def}</span>
        </div>
        <div className="bp-result-sub">{won ? 'Site secured. GG.' : 'Better luck next time, agent.'}</div>
        <div className="bp-result-actions">
          <button className="bp-cta" onClick={() => setPhase('lobby')}>PLAY AGAIN</button>
          <button className="bp-cta bp-cta-ghost" onClick={() => { reset(); }}>MAIN MENU</button>
        </div>
      </motion.div>
    </div>
  );
}
