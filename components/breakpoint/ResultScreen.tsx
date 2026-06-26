'use client';

import { motion } from 'framer-motion';
import { useBreakpointStore } from '@/lib/breakpoint/store';
import { roomClient } from '@/lib/breakpoint/net/room';

export function ResultScreen() {
  const lastWinner = useBreakpointStore((s) => s.lastWinner);
  const lastScore = useBreakpointStore((s) => s.lastScore);
  const lastMode = useBreakpointStore((s) => s.lastMode);
  const lastWave = useBreakpointStore((s) => s.lastWave);
  const matchConfig = useBreakpointStore((s) => s.matchConfig);
  const localTeam = matchConfig?.localTeam ?? 'attackers';
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const buildPracticeConfig = useBreakpointStore((s) => s.buildPracticeConfig);

  const isMP = matchConfig && matchConfig.netMode !== 'solo';
  const isZombies = lastMode === 'zombies';
  const won = isZombies ? lastWinner === 'attackers' : lastWinner === localTeam;

  const verdict = isZombies ? (won ? 'SURVIVED' : 'OVERRUN') : (won ? 'VICTORY' : 'DEFEAT');
  const sub = isZombies
    ? (won ? `You held out all 10 waves.` : `Wave ${lastWave} got the better of you.`)
    : (won ? 'Site secured. GG.' : 'Better luck next time, agent.');

  const again = () => {
    if (isMP) { roomClient.returnLobby(); setPhase('lobby'); }
    else { buildPracticeConfig(lastMode); setPhase('match'); }
  };
  const menu = () => { if (isMP) roomClient.leave(); setPhase('menu'); };

  return (
    <div className={`bp-result ${won ? 'win' : 'lose'}`}>
      <motion.div className="bp-result-inner" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
        <div className="bp-result-verdict">{verdict}</div>
        {isZombies ? (
          <div className="bp-result-score"><span className="def">WAVE {Math.max(lastWave, won ? 10 : lastWave)}</span></div>
        ) : (
          <div className="bp-result-score">
            <span className="att">{lastScore.att}</span><span className="sep">:</span><span className="def">{lastScore.def}</span>
          </div>
        )}
        <div className="bp-result-sub">{sub}</div>
        <div className="bp-result-actions">
          <button className="bp-cta" onClick={again}>{isMP ? 'BACK TO LOBBY' : 'PLAY AGAIN'}</button>
          <button className="bp-cta bp-cta-ghost" onClick={menu}>MAIN MENU</button>
        </div>
      </motion.div>
    </div>
  );
}
