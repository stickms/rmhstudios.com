'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { World, freshInput, type LocalInput } from '@/lib/breakpoint/engine/world';
import type { MatchSnapshot } from '@/lib/breakpoint/types';
import { useBreakpointStore } from '@/lib/breakpoint/store';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { PIXEL_SCALE_DESKTOP, PIXEL_SCALE_MOBILE, PALETTE } from '@/lib/breakpoint/constants';
import { GameScene } from './arena/GameScene';
import { HUD } from './HUD';
import { BuyMenu } from './BuyMenu';
import { Scoreboard } from './Scoreboard';
import { MobileControls } from './MobileControls';

const LOOK_SENS = 0.0024;

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
  const canvasWrap = useRef<HTMLDivElement>(null);

  // Build the world once for this match.
  if (!worldRef.current && matchConfig) {
    const w = new World(matchConfig);
    w.input = inputRef.current;
    worldRef.current = w;
  }

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
        // auto-open the buy menu when a buy phase begins; auto-close when it ends
        if (s.phase === 'buy' && prevPhase.current !== 'buy') setShowBuy(true);
        if (s.phase !== 'buy' && prevPhase.current === 'buy') setShowBuy(false);
        prevPhase.current = s.phase;
        if (s.over && s.winner && !endedRef.current) {
          endedRef.current = true;
          setResult(s.winner, s.scoreAttackers, s.scoreDefenders);
          window.setTimeout(() => setPhase('result'), 2600);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setPhase, setResult]);

  // Free the cursor while the buy menu is open so the player can click items.
  useEffect(() => {
    if (showBuy && document.pointerLockElement) document.exitPointerLock();
  }, [showBuy]);

  // ── Desktop input ──
  useEffect(() => {
    if (isMobile) return;
    const inp = inputRef.current;
    const keys = new Set<string>();

    const recompute = () => {
      inp.moveZ = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
      inp.moveX = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      inp.run = !keys.has('shift'); // walk while holding shift (Valorant-style)
      inp.crouch = keys.has('control');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', ' ', 'shift', 'control', 'tab', 'r', 'e', 'q', 'f', 'x', '1', '2', '3'].includes(k) || k === 'control') {
        e.preventDefault();
      }
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
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement == null) return;
      if (e.button === 0) inp.firing = true;
      if (e.button === 2) inp.ads = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) inp.firing = false;
      if (e.button === 2) inp.ads = false;
    };
    const onContext = (e: Event) => e.preventDefault();
    const onPointerLockChange = () => setLocked(document.pointerLockElement != null);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [isMobile]);

  const requestLock = useCallback(() => {
    if (isMobile) return;
    canvasWrap.current?.requestPointerLock?.();
  }, [isMobile]);

  if (!matchConfig || !worldRef.current) return null;
  const world = worldRef.current;
  const dpr = isMobile ? PIXEL_SCALE_MOBILE : PIXEL_SCALE_DESKTOP;

  return (
    <div className="bp-match" style={{ position: 'absolute', inset: 0, background: PALETTE.bg, overflow: 'hidden' }}>
      <div
        ref={canvasWrap}
        onClick={requestLock}
        style={{ position: 'absolute', inset: 0, cursor: locked ? 'none' : 'pointer' }}
      >
        <Canvas
          shadows
          dpr={dpr}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          camera={{ fov: 78, near: 0.05, far: 100, position: [0, 1.6, 0] }}
          style={{ imageRendering: 'pixelated', width: '100%', height: '100%' }}
        >
          <GameScene world={world} input={inputRef.current} />
        </Canvas>
      </div>

      {snap && <HUD snap={snap} />}
      {snap && showBuy && snap.phase === 'buy' && (
        <BuyMenu world={world} onClose={() => setShowBuy(false)} />
      )}
      {snap && showScore && <Scoreboard snap={snap} />}

      {/* Click-to-play prompt (desktop) */}
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
