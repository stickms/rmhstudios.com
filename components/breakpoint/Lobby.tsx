'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBreakpointStore, BOT_NAMES } from '@/lib/breakpoint/store';
import { AGENTS, getAgent, ROLE_LABEL } from '@/lib/breakpoint/agents';
import type { LobbyMember } from '@/lib/breakpoint/types';

export function Lobby() {
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const teamSize = useBreakpointStore((s) => s.teamSize);
  const setTeamSize = useBreakpointStore((s) => s.setTeamSize);
  const selectedAgent = useBreakpointStore((s) => s.selectedAgent);
  const partyCode = useBreakpointStore((s) => s.partyCode);
  const buildMatchConfig = useBreakpointStore((s) => s.buildMatchConfig);
  const [inQueue, setInQueue] = useState(false);
  const [queueTime, setQueueTime] = useState(0);

  // Build the visible squad: you + filler AI party members up to teamSize.
  const squad: LobbyMember[] = useMemo(() => {
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const usedAgents = new Set([selectedAgent]);
    const pick = () => {
      const pool = AGENTS.filter((a) => !usedAgents.has(a.id));
      const a = (pool.length ? pool : AGENTS)[Math.floor(Math.random() * (pool.length || AGENTS.length))];
      usedAgents.add(a.id);
      return a.id;
    };
    const out: LobbyMember[] = [
      { id: 'local', name: 'You', agentId: selectedAgent, ready: true, isHost: true, isBot: false, rank: 168 },
    ];
    for (let i = 1; i < teamSize; i++) {
      out.push({ id: `p${i}`, name: names[i] ?? `Ally${i}`, agentId: pick(), ready: true, isHost: false, isBot: true, rank: 100 + Math.floor(Math.random() * 600) });
    }
    return out;
    // re-roll only when size/agent changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSize, selectedAgent]);

  const startMatch = () => {
    setInQueue(true);
    // brief "queue found" beat, then deploy
    const start = Date.now();
    const iv = setInterval(() => setQueueTime(Math.floor((Date.now() - start) / 1000)), 250);
    setTimeout(() => {
      clearInterval(iv);
      buildMatchConfig();
      setPhase('match');
    }, 1600);
  };

  return (
    <div className="bp-lobby">
      {/* top nav (mimics Valorant header) */}
      <div className="bp-lobby-nav">
        <button className="bp-back" onClick={() => setPhase('menu')}>← BACK // PLAY</button>
        <div className="bp-lobby-eventpass">ROCHESTER OFFENSIVE EVENT PASS ✦✦✦✦✦</div>
        <div className="bp-lobby-wallet">⬡ 125 · ◈ 465 · 8,166</div>
      </div>

      <div className="bp-lobby-main">
        {/* left rail */}
        <div className="bp-lobby-rail">
          <div className="bp-rail-item"><span className="bp-rail-k">QUEUE</span><span className="bp-rail-v">COMPETITIVE</span></div>
          <div className="bp-rail-item"><span className="bp-rail-k">PARTY CODE</span><span className="bp-rail-v bp-code">{partyCode}</span></div>
          <div className="bp-rail-item"><span className="bp-rail-k">SQUAD</span>
            <div className="bp-pillrow bp-pillrow-sm">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={teamSize === n ? 'on' : ''} onClick={() => !inQueue && setTeamSize(n)}>{n}</button>
              ))}
            </div>
          </div>
          <div className="bp-rail-note">Empty slots and the entire enemy team are filled by AI agents.</div>
        </div>

        {/* party cards */}
        <div className="bp-lobby-cards">
          {Array.from({ length: 5 }).map((_, i) => {
            const m = squad[i];
            if (!m) return <div key={i} className="bp-pcard bp-pcard-empty" />;
            const agent = getAgent(m.agentId ?? '');
            return (
              <motion.div
                key={m.id}
                className={`bp-pcard ${m.id === 'local' ? 'me' : ''}`}
                style={{ ['--c' as string]: agent.color }}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.06 }}
              >
                <div className="bp-pcard-rank">{m.rank}</div>
                <div className="bp-pcard-art" style={{ background: `linear-gradient(160deg, ${agent.color}40, #0b0e13)` }}>
                  <div className="bp-pcard-figure" style={{ background: agent.color }} />
                </div>
                <div className="bp-pcard-ready">READY</div>
                <div className="bp-pcard-name">{m.name}</div>
                <div className="bp-pcard-agent" style={{ color: agent.color }}>{agent.name} · {ROLE_LABEL[agent.role]}</div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* bottom action bar */}
      <div className="bp-lobby-bar">
        <button className="bp-lobby-btn" onClick={() => setPhase('agentSelect')} disabled={inQueue}>AGENT</button>
        <button className={`bp-lobby-play ${inQueue ? 'queuing' : ''}`} onClick={startMatch} disabled={inQueue}>
          {inQueue ? `IN QUEUE  0:${queueTime.toString().padStart(2, '0')}` : 'START MATCH'}
          <span className="bp-lobby-play-diamond">◈</span>
        </button>
        <button className="bp-lobby-btn" onClick={() => setPhase('menu')} disabled={inQueue}>LEAVE</button>
      </div>

      <AnimatePresence>
        {inQueue && (
          <motion.div className="bp-matchfound" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="bp-mf-text">MATCH FOUND</div>
            <div className="bp-mf-sub">Deploying to Foundry…</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
