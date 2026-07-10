'use client';

import { useRef, useState, useCallback } from 'react';
import type { LocalInput } from '@/lib/breakpoint/engine/world';
import type { MatchSnapshot } from '@/lib/breakpoint/types';
import { getAgent } from '@/lib/breakpoint/agents';

const JOY_R = 58;
const LOOK_SENS = 0.0052;

interface Props {
  input: LocalInput;
  onReload: () => void;
  onAbility: (slot: 'C' | 'Q' | 'E' | 'X') => void;
  onJump: () => void;
  onBuyToggle: () => void;
  onScoreToggle: () => void;
  snap: MatchSnapshot | null;
}

/** Touch controls: left thumbstick = move, right-screen drag = look,
 *  action buttons for fire / ADS / jump / reload / abilities / plant. */
export function MobileControls({ input, onReload, onAbility, onJump, onBuyToggle, onScoreToggle, snap }: Props) {
  const joyBase = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lastLook = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [ads, setAds] = useState(false);
  const [crouch, setCrouch] = useState(false);

  const local = snap?.actors.find((a) => a.isLocal);
  const agent = local ? getAgent(local.agentId) : null;

  const updateJoy = useCallback((cx: number, cy: number) => {
    const el = joyBase.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > JOY_R) { dx = (dx / mag) * JOY_R; dy = (dy / mag) * JOY_R; }
    setKnob({ x: dx, y: dy });
    input.moveX = dx / JOY_R;
    input.moveZ = -dy / JOY_R; // up = forward
    input.run = true;
  }, [input]);

  const endJoy = useCallback(() => {
    joyId.current = null; setKnob({ x: 0, y: 0 });
    input.moveX = 0; input.moveZ = 0;
  }, [input]);

  // ── look layer (right half) ──
  const onLookStart = (e: React.PointerEvent) => {
    if (lookId.current !== null) return;
    lookId.current = e.pointerId;
    lastLook.current = { x: e.clientX, y: e.clientY };
  };
  const onLookMove = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId) return;
    const dx = e.clientX - lastLook.current.x;
    const dy = e.clientY - lastLook.current.y;
    lastLook.current = { x: e.clientX, y: e.clientY };
    input.yaw += dx * LOOK_SENS;
    input.pitch -= dy * LOOK_SENS;
    input.pitch = Math.max(-1.45, Math.min(1.45, input.pitch));
  };
  const onLookEnd = (e: React.PointerEvent) => { if (lookId.current === e.pointerId) lookId.current = null; };

  const hold = (set: (v: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); set(true); },
    onPointerUp: () => set(false),
    onPointerCancel: () => set(false),
    onPointerLeave: () => set(false),
  });

  return (
    <div className="bp-mobile">
      {/* look layer */}
      <div
        className="bp-look-layer"
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookEnd}
      />

      {/* top-right utility */}
      <div className="bp-m-util">
        <button onPointerDown={(e) => { e.preventDefault(); onScoreToggle(); }}>≣</button>
        {snap?.phase === 'buy' && <button onPointerDown={(e) => { e.preventDefault(); onBuyToggle(); }}>BUY</button>}
      </div>

      {/* joystick */}
      <div
        ref={joyBase}
        className="bp-joy"
        onPointerDown={(e) => { joyId.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); updateJoy(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (joyId.current === e.pointerId) updateJoy(e.clientX, e.clientY); }}
        onPointerUp={endJoy}
        onPointerCancel={endJoy}
      >
        <div className="bp-joy-knob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
      </div>

      {/* right action cluster */}
      <div className="bp-m-actions">
        <button className="bp-m-fire" {...hold((v) => { input.firing = v; })}>FIRE</button>
        <button className={`bp-m-btn ${ads ? 'on' : ''}`} onPointerDown={(e) => { e.preventDefault(); const n = !ads; setAds(n); input.ads = n; }}>ADS</button>
        <button className="bp-m-btn" onPointerDown={(e) => { e.preventDefault(); onJump(); }}>JUMP</button>
        <button className={`bp-m-btn ${crouch ? 'on' : ''}`} onPointerDown={(e) => { e.preventDefault(); const n = !crouch; setCrouch(n); input.crouch = n; }}>CRCH</button>
        <button className="bp-m-btn" onPointerDown={(e) => { e.preventDefault(); onReload(); }}>RELOAD</button>
      </div>

      {/* abilities + plant (bottom centre-left, above joystick) */}
      <div className="bp-m-abilities">
        {(['C', 'Q', 'E', 'X'] as const).map((slot) => {
          const ab = agent?.abilities.find((a) => a.slot === slot);
          if (!ab) return null;
          return (
            <button key={slot} className="bp-m-ability" style={{ borderColor: ab.color, color: ab.color }}
              onPointerDown={(e) => { e.preventDefault(); onAbility(slot); }}>
              {slot}
            </button>
          );
        })}
        <button
          className="bp-m-plant"
          {...hold((v) => { input.plant = v; input.defuse = v; })}
        >
          {snap?.localTeam === 'attackers' ? 'PLANT' : 'DEFUSE'}
        </button>
      </div>
    </div>
  );
}
