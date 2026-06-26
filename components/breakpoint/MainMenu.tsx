'use client';

import { motion } from 'framer-motion';
import { useBreakpointStore } from '@/lib/breakpoint/store';

export function MainMenu() {
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const teamSize = useBreakpointStore((s) => s.teamSize);
  const setTeamSize = useBreakpointStore((s) => s.setTeamSize);
  const botDifficulty = useBreakpointStore((s) => s.botDifficulty);
  const setBotDifficulty = useBreakpointStore((s) => s.setBotDifficulty);

  const diffLabel = botDifficulty < 0.35 ? 'RECRUIT' : botDifficulty < 0.7 ? 'COMPETITIVE' : 'ELITE';

  return (
    <div className="bp-menu">
      <div className="bp-menu-bg" />
      <motion.div
        className="bp-menu-inner"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05 }}
      >
        <div className="bp-logo">
          <span className="bp-logo-mark">▰▰ MENTAL-HOSPITAL ▰▰</span>
          <h1>ROCHESTER<br /><span>OFFENSIVE</span></h1>
          <div className="bp-logo-sub">TACTICAL 5V5 · FIRST TO 13</div>
        </div>

        <div className="bp-menu-card">
          <label className="bp-field">
            <span>SQUAD SIZE — {teamSize}v{teamSize}</span>
            <div className="bp-pillrow">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={teamSize === n ? 'on' : ''} onClick={() => setTeamSize(n)}>{n}</button>
              ))}
            </div>
          </label>

          <label className="bp-field">
            <span>ENEMY SKILL — {diffLabel}</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={botDifficulty}
              onChange={(e) => setBotDifficulty(parseFloat(e.target.value))}
            />
          </label>

          <button className="bp-cta" onClick={() => setPhase('agentSelect')}>
            SELECT AGENT →
          </button>
          <button className="bp-cta bp-cta-ghost" onClick={() => setPhase('lobby')}>
            PARTY LOBBY
          </button>
        </div>

        <div className="bp-menu-foot">
          A pixel-art tactical shooter · classes, abilities, an economy, the spike, and MR13.
          Plays on desktop (mouse + keyboard) and mobile (on-screen joystick).
        </div>
      </motion.div>
    </div>
  );
}
