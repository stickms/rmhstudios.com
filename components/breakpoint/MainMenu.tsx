'use client';

import { motion } from 'framer-motion';
import { useBreakpointStore } from '@/lib/breakpoint/store';
import { getAgent, ROLE_LABEL } from '@/lib/breakpoint/agents';

export function MainMenu() {
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const setAgentReturn = useBreakpointStore((s) => s.setAgentReturn);
  const botDifficulty = useBreakpointStore((s) => s.botDifficulty);
  const setBotDifficulty = useBreakpointStore((s) => s.setBotDifficulty);
  const mode = useBreakpointStore((s) => s.mode);
  const setMode = useBreakpointStore((s) => s.setMode);
  const playerName = useBreakpointStore((s) => s.playerName);
  const setPlayerName = useBreakpointStore((s) => s.setPlayerName);
  const selectedAgent = useBreakpointStore((s) => s.selectedAgent);
  const buildPracticeConfig = useBreakpointStore((s) => s.buildPracticeConfig);

  const diffLabel = botDifficulty < 0.35 ? 'RECRUIT' : botDifficulty < 0.7 ? 'COMPETITIVE' : 'ELITE';
  const agent = getAgent(selectedAgent);

  const openAgent = () => { setAgentReturn('menu'); setPhase('agentSelect'); };
  const findMatch = () => setPhase('lobby');
  const practice = () => { buildPracticeConfig(mode); setPhase('match'); };

  return (
    <div className="bp-menu">
      <div className="bp-menu-bg" />
      <motion.div className="bp-menu-inner" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}>
        <div className="bp-logo">
          <span className="bp-logo-mark">▰▰ MENTAL-HOSPITAL ▰▰</span>
          <h1>ROCHESTER<br /><span>OFFENSIVE</span></h1>
          <div className="bp-logo-sub">TACTICAL 5V5 · CO-OP ZOMBIES · MR13</div>
        </div>

        <div className="bp-menu-card">
          <label className="bp-field">
            <span>CALLSIGN</span>
            <input className="bp-text" value={playerName} maxLength={18} onChange={(e) => setPlayerName(e.target.value)} placeholder="Your name" />
          </label>

          <button className="bp-agent-pick" onClick={openAgent} style={{ ['--c' as string]: agent.color }}>
            <span className="bp-agent-pick-l">AGENT</span>
            <span className="bp-agent-pick-name" style={{ color: agent.color }}>{agent.name}</span>
            <span className="bp-agent-pick-role">{ROLE_LABEL[agent.role]} · CHANGE ›</span>
          </button>

          <button className="bp-cta" onClick={findMatch}>FIND MATCH →</button>

          <div className="bp-divider"><span>OR PRACTICE OFFLINE</span></div>

          <div className="bp-pillrow">
            <button className={mode === 'standard' ? 'on' : ''} onClick={() => setMode('standard')}>STANDARD 5V5</button>
            <button className={mode === 'zombies' ? 'on' : ''} onClick={() => setMode('zombies')}>ZOMBIES</button>
          </div>

          {mode === 'standard' && (
            <label className="bp-field">
              <span>ENEMY SKILL — {diffLabel}</span>
              <input type="range" min={0} max={1} step={0.05} value={botDifficulty} onChange={(e) => setBotDifficulty(parseFloat(e.target.value))} />
            </label>
          )}

          <button className="bp-cta bp-cta-ghost" onClick={practice}>
            {mode === 'zombies' ? 'PLAY ZOMBIES (SOLO)' : 'PRACTICE VS BOTS'}
          </button>
        </div>

        <div className="bp-menu-foot">
          Find Match drops you into an online lobby — pick a side, swap teams, ready up. Or jump
          straight into practice / solo zombies. Desktop (mouse + keyboard) and mobile (joystick) supported.
        </div>
      </motion.div>
    </div>
  );
}
