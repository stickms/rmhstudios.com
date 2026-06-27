'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBreakpointStore, type MatchConfig } from '@/lib/breakpoint/store';
import { roomClient, type RoomState, type StartPayload } from '@/lib/breakpoint/net/room';
import { getAgent, ROLE_LABEL } from '@/lib/breakpoint/agents';
import type { Team, MatchMode } from '@/lib/breakpoint/types';

type Status = 'connecting' | 'browser' | 'room' | 'error';
interface RoomListItem { id: string; name: string; mode: MatchMode; count: number; max: number; hasPassword: boolean; state: string }

export function Lobby() {
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const setAgentReturn = useBreakpointStore((s) => s.setAgentReturn);
  const selectedAgent = useBreakpointStore((s) => s.selectedAgent);
  const playerName = useBreakpointStore((s) => s.playerName);
  const botDifficulty = useBreakpointStore((s) => s.botDifficulty);
  const setMatchConfig = useBreakpointStore((s) => s.setMatchConfig);
  const buildPracticeConfig = useBreakpointStore((s) => s.buildPracticeConfig);

  const [status, setStatus] = useState<Status>('connecting');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [starting, setStarting] = useState(false);
  const [createMode, setCreateMode] = useState<MatchMode>('standard');
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createPass, setCreatePass] = useState('');
  const [joinPass, setJoinPass] = useState<{ id: string; pass: string } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const subs: (() => void)[] = [];
    let pollId = 0;
    roomClient.connect().then(() => {
      if (!alive) return;
      setStatus('browser');
      subs.push(roomClient.on('roomList', (d) => setRooms(((d as { rooms: RoomListItem[] }).rooms) || [])));
      subs.push(roomClient.on('lobby', (d) => { setRoom((d as { room: RoomState }).room); setStatus('room'); }));
      subs.push(roomClient.on('error', (d) => { const m = (d as { message: string }).message; if (/host left/i.test(m)) setStatus('browser'); }));
      subs.push(roomClient.on('start', (d) => { if (startedRef.current) return; startedRef.current = true; startMatch(d as StartPayload); }));
      roomClient.listRooms();
      pollId = window.setInterval(() => { if (alive) roomClient.listRooms(); }, 2500);
    }).catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; subs.forEach((u) => u()); if (pollId) clearInterval(pollId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (status === 'room') roomClient.selectAgent(selectedAgent); }, [selectedAgent, status]);

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
      humans: payload.players.map((p) => ({ id: p.id, name: p.name, agentId: p.agentId, team: payload.mode === 'zombies' ? 'attackers' : p.team, isLocal: p.id === meId })),
      fillToPerSide: Math.max(1, Math.min(5, payload.cpuPerSide ?? 5)),
    };
    setMatchConfig(config);
    setPhase('match');
  };

  const name = playerName || 'Agent';
  const changeAgent = () => { setAgentReturn('lobby'); setPhase('agentSelect'); };
  const playOffline = () => { buildPracticeConfig('standard'); setPhase('match'); };

  if (status === 'connecting') return <div className="bp-lobby"><div className="bp-loading">CONNECTING…</div></div>;
  if (status === 'error') {
    return (
      <div className="bp-lobby"><div className="bp-menu-inner" style={{ textAlign: 'center', margin: 'auto' }}>
        <div className="bp-lock-title" style={{ fontSize: 36 }}>SERVERS UNREACHABLE</div>
        <div className="bp-result-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="bp-cta" onClick={playOffline}>PLAY OFFLINE VS BOTS</button>
          <button className="bp-cta bp-cta-ghost" onClick={() => setPhase('menu')}>BACK</button>
        </div>
      </div></div>
    );
  }

  // ── Room browser ──
  if (status === 'browser') {
    return (
      <div className="bp-lobby">
        <div className="bp-lobby-nav">
          <button className="bp-back" onClick={() => setPhase('menu')}>← MENU</button>
          <div className="bp-lobby-eventpass">FIND A MATCH</div>
          <button className="bp-back" onClick={changeAgent}>AGENT: {getAgent(selectedAgent).name} ›</button>
        </div>

        <div className="bp-browser">
          <div className="bp-browser-actions">
            <button className="bp-cta" onClick={() => roomClient.quickJoin(name, selectedAgent)}>⚡ QUICK PLAY</button>
            <div className="bp-create">
              <div className="bp-create-row">
                <div className="bp-pillrow bp-pillrow-sm">
                  <button className={createMode === 'standard' ? 'on' : ''} onClick={() => setCreateMode('standard')}>STANDARD</button>
                  <button className={createMode === 'zombies' ? 'on' : ''} onClick={() => setCreateMode('zombies')}>ZOMBIES</button>
                </div>
                <button className={`bp-toggle ${createPrivate ? 'on' : ''}`} onClick={() => setCreatePrivate((v) => !v)}>{createPrivate ? '🔒 PRIVATE' : '🌐 PUBLIC'}</button>
              </div>
              {createPrivate && <input className="bp-text" placeholder="Password (optional)" value={createPass} maxLength={24} onChange={(e) => setCreatePass(e.target.value)} />}
              <button className="bp-cta bp-cta-ghost" onClick={() => roomClient.createRoom({ name, agentId: selectedAgent, roomName: `${name}'s Lobby`, isPublic: !createPrivate, password: createPrivate && createPass ? createPass : null, mode: createMode })}>
                CREATE {createPrivate ? 'PRIVATE' : 'PUBLIC'} ROOM
              </button>
            </div>
          </div>

          <div className="bp-roomlist">
            <div className="bp-roomlist-head">PUBLIC LOBBIES <button className="bp-back" onClick={() => roomClient.listRooms()}>↻ REFRESH</button></div>
            {rooms.length === 0 && <div className="bp-roomlist-empty">No public lobbies yet — Quick Play or create one.</div>}
            {rooms.map((r) => (
              <div key={r.id} className="bp-room-row">
                <span className="bp-room-name">{r.hasPassword ? '🔒 ' : ''}{r.name}</span>
                <span className="bp-room-mode">{r.mode === 'zombies' ? 'ZOMBIES' : '5V5'}</span>
                <span className="bp-room-count">{r.count}/{r.max}</span>
                <span className="bp-room-state">{r.state === 'playing' ? 'IN GAME' : 'OPEN'}</span>
                {joinPass?.id === r.id ? (
                  <span className="bp-room-joinpass">
                    <input className="bp-text" placeholder="password" autoFocus value={joinPass.pass} onChange={(e) => setJoinPass({ id: r.id, pass: e.target.value })} />
                    <button className="bp-mini-btn" onClick={() => roomClient.joinRoom(r.id, name, selectedAgent, joinPass.pass)}>GO</button>
                  </span>
                ) : (
                  <button className="bp-mini-btn" disabled={r.state === 'playing' || r.count >= r.max}
                    onClick={() => { if (r.hasPassword) setJoinPass({ id: r.id, pass: '' }); else roomClient.joinRoom(r.id, name, selectedAgent, null); }}>
                    {r.state === 'playing' ? '—' : 'JOIN'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── In a room (team select) ──
  const me = room?.players.find((p) => p.id === roomClient.id);
  const isHost = !!me?.isHost;
  const isZombies = room?.mode === 'zombies';
  const att = room?.players.filter((p) => p.team === 'attackers') ?? [];
  const def = room?.players.filter((p) => p.team === 'defenders') ?? [];
  const leave = () => { roomClient.leave(); setStatus('browser'); roomClient.listRooms(); };

  const TeamCol = ({ team, title, color, players }: { team: Team; title: string; color: string; players: typeof att }) => (
    <div className="bp-team-col" style={{ ['--c' as string]: color }}>
      <div className="bp-team-head"><span>{title}</span><span className="bp-team-count">{players.length}/5</span></div>
      <div className="bp-team-slots">
        {Array.from({ length: 5 }).map((_, i) => {
          const p = players[i];
          if (!p) {
            const canJoin = !isZombies && me?.team !== team && players.length < 5;
            return <button key={i} className={`bp-slot empty ${canJoin ? 'joinable' : ''}`} disabled={!canJoin} onClick={() => roomClient.selectTeam(team)}>{canJoin ? '+ JOIN' : '—'}</button>;
          }
          const ag = getAgent(p.agentId ?? '');
          return (
            <div key={p.id} className={`bp-slot filled ${p.id === roomClient.id ? 'me' : ''}`}>
              <span className="bp-slot-fig" style={{ background: color }} />
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
        <div className="bp-lobby-eventpass">{room?.name ?? 'LOBBY'} · {isZombies ? 'ZOMBIES' : 'COMPETITIVE'}{room?.isPublic ? '' : ' 🔒'}</div>
        <button className="bp-back" onClick={changeAgent}>AGENT: {getAgent(selectedAgent).name} ›</button>
      </div>

      {isHost && (
        <div className="bp-lobby-modebar">
          <span>MODE</span>
          <div className="bp-pillrow bp-pillrow-sm">
            <button className={!isZombies ? 'on' : ''} onClick={() => roomClient.setMode('standard')}>STANDARD 5V5</button>
            <button className={isZombies ? 'on' : ''} onClick={() => roomClient.setMode('zombies')}>ZOMBIES</button>
          </div>
          <span style={{ marginLeft: 18 }}>TEAM SIZE (AI FILL)</span>
          <div className="bp-pillrow bp-pillrow-sm">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} className={(room?.cpuPerSide ?? 4) === n ? 'on' : ''} onClick={() => roomClient.setCpu(n)}>{n}</button>)}
          </div>
        </div>
      )}

      <div className="bp-lobby-teams">
        {isZombies
          ? <TeamCol team="attackers" title="SURVIVORS" color="#16e0a3" players={att} />
          : <><TeamCol team="attackers" title="ATTACKERS" color="#ff4655" players={att} /><div className="bp-team-vs">VS</div><TeamCol team="defenders" title="DEFENDERS" color="#3b6fe0" players={def} /></>}
      </div>

      <div className="bp-lobby-bar">
        <button className={`bp-lobby-btn ${me?.ready ? 'ready-on' : ''}`} onClick={() => roomClient.ready(!me?.ready)}>{me?.ready ? '✓ READY' : 'READY UP'}</button>
        {isHost
          ? <button className="bp-lobby-play" onClick={() => { setStarting(true); roomClient.start(); }} disabled={starting}>START MATCH <span className="bp-lobby-play-diamond">◈</span></button>
          : <div className="bp-lobby-waiting">WAITING FOR HOST…</div>}
        <button className="bp-lobby-btn" onClick={leave}>LEAVE</button>
      </div>

      <div className="bp-lobby-hint">{isZombies ? 'Up to 5 survivors. Buy between waves and hold out.' : 'Click an empty slot to switch teams. Empty slots fill with AI (host sets team size).'}</div>

      <AnimatePresence>
        {starting && <motion.div className="bp-matchfound" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="bp-mf-text">MATCH STARTING</div><div className="bp-mf-sub">Deploying to Foundry…</div></motion.div>}
      </AnimatePresence>
    </div>
  );
}
