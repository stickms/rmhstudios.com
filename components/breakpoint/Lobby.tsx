'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBreakpointStore, type MatchConfig } from '@/lib/breakpoint/store';
import { roomClient, type RoomState, type StartPayload } from '@/lib/breakpoint/net/room';
import { getAgent, ROLE_LABEL } from '@/lib/breakpoint/agents';
import type { Team } from '@/lib/breakpoint/types';

type Status = 'connecting' | 'in' | 'error';

export function Lobby() {
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const setAgentReturn = useBreakpointStore((s) => s.setAgentReturn);
  const selectedAgent = useBreakpointStore((s) => s.selectedAgent);
  const playerName = useBreakpointStore((s) => s.playerName);
  const botDifficulty = useBreakpointStore((s) => s.botDifficulty);
  const setMatchConfig = useBreakpointStore((s) => s.setMatchConfig);
  const buildPracticeConfig = useBreakpointStore((s) => s.buildPracticeConfig);

  const [status, setStatus] = useState<Status>('connecting');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [starting, setStarting] = useState(false);
  const startedRef = useRef(false);

  // connect + join + subscribe
  useEffect(() => {
    let alive = true;
    const subs: (() => void)[] = [];
    roomClient.connect().then(() => {
      if (!alive) return;
      setStatus('in');
      roomClient.join(playerName || 'Agent', selectedAgent);
      subs.push(roomClient.on('lobby', (d) => setRoom((d as { room: RoomState }).room)));
      subs.push(roomClient.on('start', (d) => {
        if (startedRef.current) return;
        startedRef.current = true;
        startMatch(d as StartPayload);
      }));
      subs.push(roomClient.on('error', () => { /* surfaced in-match */ }));
    }).catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; subs.forEach((u) => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep server in sync with our chosen agent
  useEffect(() => { if (status === 'in') roomClient.selectAgent(selectedAgent); }, [selectedAgent, status]);

  const startMatch = (payload: StartPayload) => {
    const meId = roomClient.id;
    const me = payload.players.find((p) => p.id === meId);
    const config: MatchConfig = {
      mode: payload.mode,
      netMode: payload.hostId === meId ? 'host' : 'guest',
      localId: meId,
      localAgentId: me?.agentId ?? selectedAgent,
      localTeam: payload.mode === 'zombies' ? 'attackers' : (me?.team ?? 'attackers'),
      botDifficulty,
      humans: payload.players.map((p) => ({
        id: p.id, name: p.name, agentId: p.agentId,
        team: payload.mode === 'zombies' ? 'attackers' : p.team, isLocal: p.id === meId,
      })),
      fillToPerSide: 5,
    };
    setMatchConfig(config);
    setPhase('match');
  };

  const leave = () => { roomClient.leave(); setPhase('menu'); };
  const playOffline = () => { buildPracticeConfig('standard'); setPhase('match'); };
  const changeAgent = () => { setAgentReturn('lobby'); setPhase('agentSelect'); };

  if (status === 'connecting') {
    return <div className="bp-lobby"><div className="bp-loading">CONNECTING TO SERVERS…</div></div>;
  }
  if (status === 'error') {
    return (
      <div className="bp-lobby">
        <div className="bp-menu-inner" style={{ textAlign: 'center', margin: 'auto' }}>
          <div className="bp-lock-title" style={{ fontSize: 36 }}>SERVERS UNREACHABLE</div>
          <p className="bp-menu-foot">The matchmaking server isn't responding right now.</p>
          <div className="bp-result-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="bp-cta" onClick={playOffline}>PLAY OFFLINE VS BOTS</button>
            <button className="bp-cta bp-cta-ghost" onClick={() => setPhase('menu')}>BACK</button>
          </div>
        </div>
      </div>
    );
  }

  const me = room?.players.find((p) => p.id === roomClient.id);
  const isHost = !!me?.isHost;
  const isZombies = room?.mode === 'zombies';
  const att = room?.players.filter((p) => p.team === 'attackers') ?? [];
  const def = room?.players.filter((p) => p.team === 'defenders') ?? [];

  const TeamCol = ({ team, title, color, players }: { team: Team; title: string; color: string; players: typeof att }) => (
    <div className="bp-team-col" style={{ ['--c' as string]: color }}>
      <div className="bp-team-head">
        <span>{title}</span><span className="bp-team-count">{players.length}/5</span>
      </div>
      <div className="bp-team-slots">
        {Array.from({ length: 5 }).map((_, i) => {
          const p = players[i];
          if (!p) {
            const canJoin = !isZombies && me?.team !== team && players.length < 5;
            return (
              <button key={i} className={`bp-slot empty ${canJoin ? 'joinable' : ''}`} disabled={!canJoin} onClick={() => roomClient.selectTeam(team)}>
                {canJoin ? '+ JOIN' : '—'}
              </button>
            );
          }
          const ag = getAgent(p.agentId ?? '');
          return (
            <div key={p.id} className={`bp-slot filled ${p.id === roomClient.id ? 'me' : ''}`}>
              <span className="bp-slot-fig" style={{ background: ag.color }} />
              <div className="bp-slot-info">
                <div className="bp-slot-name">{p.name}{p.isHost ? ' 👑' : ''}</div>
                <div className="bp-slot-agent" style={{ color: ag.color }}>{ag.name} · {ROLE_LABEL[ag.role]}</div>
              </div>
              <span className={`bp-slot-ready ${p.ready ? 'on' : ''}`}>{p.ready ? 'READY' : '…'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="bp-lobby">
      <div className="bp-lobby-nav">
        <button className="bp-back" onClick={leave}>← LEAVE</button>
        <div className="bp-lobby-eventpass">ROCHESTER OFFENSIVE · {isZombies ? 'CO-OP ZOMBIES' : 'COMPETITIVE'}</div>
        <button className="bp-back" onClick={changeAgent}>AGENT: {getAgent(selectedAgent).name} ›</button>
      </div>

      {isHost && (
        <div className="bp-lobby-modebar">
          <span>MODE</span>
          <div className="bp-pillrow bp-pillrow-sm">
            <button className={!isZombies ? 'on' : ''} onClick={() => roomClient.setMode('standard')}>STANDARD 5V5</button>
            <button className={isZombies ? 'on' : ''} onClick={() => roomClient.setMode('zombies')}>ZOMBIES</button>
          </div>
        </div>
      )}

      <div className="bp-lobby-teams">
        {isZombies ? (
          <TeamCol team="attackers" title="SURVIVORS" color="#16e0a3" players={att} />
        ) : (
          <>
            <TeamCol team="attackers" title="ATTACKERS" color="#ff4655" players={att} />
            <div className="bp-team-vs">VS</div>
            <TeamCol team="defenders" title="DEFENDERS" color="#16e0a3" players={def} />
          </>
        )}
      </div>

      <div className="bp-lobby-bar">
        <button className={`bp-lobby-btn ${me?.ready ? 'ready-on' : ''}`} onClick={() => roomClient.ready(!me?.ready)}>
          {me?.ready ? '✓ READY' : 'READY UP'}
        </button>
        {isHost ? (
          <button className="bp-lobby-play" onClick={() => { setStarting(true); roomClient.start(); }} disabled={starting}>
            START MATCH <span className="bp-lobby-play-diamond">◈</span>
          </button>
        ) : (
          <div className="bp-lobby-waiting">WAITING FOR HOST…</div>
        )}
        <button className="bp-lobby-btn" onClick={leave}>LEAVE</button>
      </div>

      <div className="bp-lobby-hint">
        {isZombies
          ? 'Up to 5 survivors. Buy between waves, hold out, stay alive.'
          : 'Click an empty slot to switch teams. Empty slots and missing players are filled with AI.'}
      </div>

      <AnimatePresence>
        {starting && (
          <motion.div className="bp-matchfound" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="bp-mf-text">MATCH STARTING</div>
            <div className="bp-mf-sub">Deploying to Foundry…</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
