'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { World, freshInput, type LocalInput } from '@/lib/breakpoint/engine/world';
import type { MatchSnapshot, NetEvent } from '@/lib/breakpoint/types';
import { useBreakpointStore } from '@/lib/breakpoint/store';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { roomClient } from '@/lib/breakpoint/net/room';
import { PIXEL_SCALE_DESKTOP, PIXEL_SCALE_MOBILE, PALETTE, NET_PLAYER_HZ, NET_MATCH_HZ } from '@/lib/breakpoint/constants';
import { GameScene } from './arena/GameScene';
import { HUD } from './HUD';
import { BuyMenu } from './BuyMenu';
import { Scoreboard } from './Scoreboard';
import { MobileControls } from './MobileControls';

const LOOK_SENS = 0.0024;
const nowMs = () => performance.now();

export function GameView() {
  const matchConfig = useBreakpointStore((s) => s.matchConfig);
  const setPhase = useBreakpointStore((s) => s.setPhase);
  const setResult = useBreakpointStore((s) => s.setResult);
  const isMobile = useIsMobile();

  const worldRef = useRef<World | null>(null);
  const inputRef = useRef<LocalInput>(freshInput());
  const [snap, setSnap] = useState<MatchSnapshot | null>(null);
  const [locked, setLocked] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [connLost, setConnLost] = useState(false);
  const canvasWrap = useRef<HTMLDivElement>(null);

  if (!worldRef.current && matchConfig) {
    const w = new World(matchConfig);
    w.input = inputRef.current;
    worldRef.current = w;
  }

  // ── Simulation + net loop (setInterval so it survives backgrounded tabs) ──
  useEffect(() => {
    const world = worldRef.current;
    if (!world || !matchConfig) return;
    const mp = matchConfig.netMode !== 'solo';
    const me = matchConfig.localId;
    const isHost = matchConfig.netMode === 'host';
    const lastNetWall = { t: nowMs() };

    const unsubs: (() => void)[] = [];
    if (mp) {
      unsubs.push(
        roomClient.on('player', (d) => { const { id, state } = d as { id: string; state: unknown }; if (id !== me) world.applyRemotePlayer(id, state as never); }),
        roomClient.on('match', (d) => { if (!isHost) { world.applyMatchState((d as { state: never }).state); lastNetWall.t = nowMs(); setConnLost(false); } }),
        roomClient.on('hit', (d) => { const h = d as { from: string; dmg: number; head: boolean; weapon: string }; world.applyIncomingHit(h.from, h.dmg, h.head, h.weapon); }),
        roomClient.on('death', (d) => { const x = d as { id: string; killer: string; weapon: string; head: boolean }; world.applyRemoteDeath(x.id, x.killer, x.weapon, x.head); }),
        roomClient.on('bhit', (d) => { const x = d as { from: string; target: string; dmg: number; head: boolean; weapon: string }; world.applyBotHit(x.from, x.target, x.dmg, x.head, x.weapon); }),
        roomClient.on('fx', (d) => { world.applyRemoteFx((d as { fx: never }).fx); }),
        roomClient.on('spike', (d) => { const x = d as { playerId: string; type: 'plant' | 'defuse'; active: boolean; pos: never }; world.applySpikeIntent(x.playerId, x.type, x.active, x.pos); }),
        roomClient.on('buy', (d) => { const x = d as { from: string; buyKind: 'weapon' | 'armor' | 'ability'; id: string; value: number; cost: number; max: number }; world.applyBuy(x.from, x); }),
        roomClient.on('ability', (d) => { const x = d as { from: string; slot: 'C' | 'Q' | 'E' | 'X' }; world.applyAbilityIntent(x.from, x.slot); }),
        roomClient.on('playerLeft', (d) => { world.removeActor((d as { id: string }).id); }),
        roomClient.on('error', (d) => { setNetError((d as { message: string }).message || 'Disconnected'); }),
      );
    }

    let prev = nowMs(); let lastPlayer = 0; let lastMatch = 0;
    const playerIv = 1000 / NET_PLAYER_HZ;
    const matchIv = 1000 / NET_MATCH_HZ;
    const id = window.setInterval(() => {
      const t = nowMs();
      const dt = Math.min(120, t - prev); prev = t;
      world.update(dt);
      if (mp) {
        for (const e of world.drainEvents() as NetEvent[]) {
          if (e.kind === 'hit') roomClient.sendHit(e.target, e.dmg, e.head, e.weapon);
          else if (e.kind === 'bhit') roomClient.sendBhit(e.target, e.dmg, e.head, e.weapon);
          else if (e.kind === 'death') roomClient.sendDeath(e.killer, e.weapon, e.head);
          else if (e.kind === 'fx') roomClient.sendFx(e.fx);
          else if (e.kind === 'spike') roomClient.sendSpike(e.type, e.active, e.pos);
          else if (e.kind === 'buy') roomClient.sendBuy(e.buyKind, e.id, e.value, e.cost, e.max);
          else if (e.kind === 'ability') roomClient.sendAbility(e.slot);
        }
        if (t - lastPlayer > playerIv) { lastPlayer = t; const ps = world.getPlayerState(); if (ps) roomClient.sendPlayer(ps); }
        if (isHost && t - lastMatch > matchIv) { lastMatch = t; roomClient.sendMatch(world.getMatchState()); }
        if (!isHost && t - lastNetWall.t > 6000) setConnLost(true);
      }
    }, 1000 / 60);

    return () => { window.clearInterval(id); unsubs.forEach((u) => u()); };
  }, [matchConfig]);

  const prevPhase = useRef<string>('');
  const endedRef = useRef(false);
  // Poll snapshot ~15Hz for the React UI.
  useEffect(() => {
    let raf = 0; let last = 0;
    const tick = (t: number) => {
      if (t - last > 66 && worldRef.current) {
        last = t;
        const s = worldRef.current.getSnapshot();
        setSnap(s);
        if (s.phase === 'buy' && prevPhase.current !== 'buy') setShowBuy(true);
        if (s.phase !== 'buy' && prevPhase.current === 'buy') setShowBuy(false);
        prevPhase.current = s.phase;
        if (s.over && s.winner && !endedRef.current) {
          endedRef.current = true;
          setResult(s.winner, s.scoreAttackers, s.scoreDefenders, s.mode, s.wave);
          window.setTimeout(() => setPhase('result'), 2600);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setPhase, setResult]);

  useEffect(() => { if (showBuy && document.pointerLockElement) document.exitPointerLock(); }, [showBuy]);

  // ── Desktop input ──
  useEffect(() => {
    if (isMobile) return;
    const inp = inputRef.current;
    const keys = new Set<string>();
    const recompute = () => {
      inp.moveZ = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
      inp.moveX = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      inp.run = !keys.has('shift');
      inp.crouch = keys.has('control');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', ' ', 'shift', 'control', 'tab', 'r', 'e', 'q', 'f', 'x', '1', '2', '3'].includes(k)) e.preventDefault();
      if (k === 'tab') { setShowScore(true); return; }
      if (k === 'b') { setShowBuy((v) => !v); return; }
      keys.add(k === ' ' ? 'space' : k);
      if (k === ' ') inp.jump = true;
      if (k === 'control') inp.crouch = true;
      if (k === 'r') inp.reloadEdge = true;
      if (k === 'f') { inp.plant = true; inp.defuse = true; }
      if (k === '1') inp.switchEdge = 'primary';
      if (k === '2') inp.switchEdge = 'sidearm';
      if (k === '3') inp.switchEdge = 'knife';
      if (k === 'c') inp.abilityEdge = 'C';
      if (k === 'q') inp.abilityEdge = 'Q';
      if (k === 'e') inp.abilityEdge = 'E';
      if (k === 'x') inp.abilityEdge = 'X';
      recompute();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'tab') { setShowScore(false); return; }
      keys.delete(k === ' ' ? 'space' : k);
      if (k === ' ') inp.jump = false;
      if (k === 'control') inp.crouch = false;
      if (k === 'f') { inp.plant = false; inp.defuse = false; }
      recompute();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement == null) return;
      inp.yaw += e.movementX * LOOK_SENS;
      inp.pitch -= e.movementY * LOOK_SENS;
      inp.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
    };
    const onMouseDown = (e: MouseEvent) => { if (document.pointerLockElement == null) return; if (e.button === 0) inp.firing = true; if (e.button === 2) inp.ads = true; };
    const onMouseUp = (e: MouseEvent) => { if (e.button === 0) inp.firing = false; if (e.button === 2) inp.ads = false; };
    const onContext = (e: Event) => e.preventDefault();
    const onPlc = () => setLocked(document.pointerLockElement != null);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onPlc);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onPlc);
    };
  }, [isMobile]);

  const requestLock = useCallback(() => { if (!isMobile) canvasWrap.current?.requestPointerLock?.(); }, [isMobile]);

  if (!matchConfig || !worldRef.current) return null;
  const world = worldRef.current;
  const dpr = isMobile ? PIXEL_SCALE_MOBILE : PIXEL_SCALE_DESKTOP;

  return (
    <div className="bp-match" style={{ position: 'absolute', inset: 0, background: PALETTE.bg, overflow: 'hidden' }}>
      <div ref={canvasWrap} onClick={requestLock} style={{ position: 'absolute', inset: 0, cursor: locked ? 'none' : 'pointer' }}>
        <Canvas
          shadows dpr={dpr}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          camera={{ fov: 78, near: 0.05, far: 100, position: [0, 1.6, 0] }}
          style={{ imageRendering: 'pixelated', width: '100%', height: '100%' }}
        >
          <GameScene world={world} input={inputRef.current} />
        </Canvas>
      </div>

      {snap && <HUD snap={snap} />}
      {snap && showBuy && snap.phase === 'buy' && <BuyMenu world={world} onClose={() => setShowBuy(false)} />}
      {snap && showScore && <Scoreboard snap={snap} />}

      {netError && (
        <div className="bp-neterror">
          <div>{netError}</div>
          <button className="bp-cta bp-cta-sm" onClick={() => setPhase('lobby')}>BACK TO LOBBY</button>
        </div>
      )}

      {connLost && !netError && (
        <div className="bp-neterror">
          <div style={{ color: '#ffce4f' }}>RECONNECTING TO HOST…</div>
          <button className="bp-cta bp-cta-sm" onClick={() => setPhase('lobby')}>LEAVE MATCH</button>
        </div>
      )}

      {!isMobile && !locked && !showBuy && (
        <div className="bp-lockprompt" onClick={requestLock}>
          <div className="bp-lockprompt-inner">
            <div className="bp-lock-title">CLICK TO PLAY</div>
            <div className="bp-lock-keys">
              <span><b>WASD</b> Move</span><span><b>Shift</b> Walk</span><span><b>Ctrl</b> Crouch</span>
              <span><b>Space</b> Jump</span><span><b>L-Click</b> Fire</span><span><b>R-Click</b> ADS</span>
              <span><b>R</b> Reload</span><span><b>C Q E X</b> Abilities</span><span><b>F</b> Plant / Defuse</span>
              <span><b>B</b> Buy</span><span><b>Tab</b> Scoreboard</span><span><b>1 2 3</b> Weapons</span>
            </div>
          </div>
        </div>
      )}

      {isMobile && (
        <MobileControls
          input={inputRef.current}
          onReload={() => { inputRef.current.reloadEdge = true; }}
          onAbility={(s) => { inputRef.current.abilityEdge = s; }}
          onJump={() => { inputRef.current.jump = true; setTimeout(() => { inputRef.current.jump = false; }, 120); }}
          onBuyToggle={() => setShowBuy((v) => !v)}
          onScoreToggle={() => setShowScore((v) => !v)}
          snap={snap}
        />
      )}
    </div>
  );
}
