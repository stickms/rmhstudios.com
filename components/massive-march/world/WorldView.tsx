/**
 * Massive March — the world screen.
 *
 * Holds the Canvas, the HUD over it, and the input plumbing that connects the
 * two. Three things worth knowing:
 *
 * **Pointer lock is a mode, not a state.** Releasing it (Escape, an overlay, a
 * chat field) stops look input and stops movement, because the alternative is
 * that opening the map leaves you jogging into the sea. Every overlay in this
 * game therefore releases the pointer and every dismissal offers it back.
 *
 * **The interact key does exactly one thing**, decided by
 * `resolveInteraction` — the same function the prompt is printed from, so the
 * label and the action cannot disagree.
 *
 * **Throwing is a charge.** Hold, aim, release. It is the only input in the game
 * with a wind-up, and it is there because a throw you cannot modulate is a throw
 * that is either always right or always funny, and this one should be neither.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import AdaptiveQuality from '@/components/render/AdaptiveQuality';
import { useRenderQuality } from '@/lib/render/useRenderQuality';
import { GESTURE_WHEEL } from '@/lib/massive-march/gestures';
import { consume, input, resetInput } from '@/lib/massive-march/input';
import { resolveInteraction, type Interaction } from '@/lib/massive-march/interaction';
import type { ItemKind } from '@/lib/massive-march/items';
import { live } from '@/lib/massive-march/live';
import { mm } from '@/lib/massive-march/net/client';
import { BIT } from '@/lib/massive-march/net/events';
import { settings, useMmSettings } from '@/lib/massive-march/settings';
import type { MemberInfo } from '@/lib/massive-march/net/events';
import { none, useMmStore } from '@/lib/massive-march/store';
import { isTransmitting, setTransmitting } from '@/lib/massive-march/voice';
import { LAND } from '@/lib/massive-march/palette';
import { Hud } from '../hud/Hud';
import { Scene } from './Scene';
import { CAMERA_FAR } from './Sky';
import { useDesktopInput } from './PlayerController';

export function WorldView() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [locked, setLocked] = useState(false);
  const [charge, setCharge] = useState(0);
  const { quality, tier, dpr, downscale } = useRenderQuality();

  const overlay = useMmStore((s) => s.overlay);
  const setOverlay = useMmStore((s) => s.setOverlay);
  const chatOpen = useMmStore((s) => s.chatOpen);
  const setChatOpen = useMmStore((s) => s.setChatOpen);
  const members = useMmStore((s) => s.session?.members ?? none<MemberInfo>());
  const world = useMmStore((s) => s.world);
  const variant = useMmStore((s) => s.session?.variant ?? 'duo');
  const notify = useMmStore((s) => s.notify);

  const puzzles = useMemo(
    () => new Map((world?.puzzles ?? []).map((p) => [p.id, p])),
    [world?.puzzles],
  );

  /** Any overlay or the chat box means hands off the world. */
  const modal = overlay !== 'none' || chatOpen;

  const buildContext = useCallback(() => {
    const carrying: { id: number; kind: ItemKind }[] = [];
    const packWearers: number[] = [];
    for (const item of live.items.values()) {
      if (item.holder < 0) continue;
      if (item.holder === live.selfSlot) carrying.push({ id: item.id, kind: item.kind });
      if (item.kind === 'backpack' && item.where === 'worn') packWearers.push(item.holder);
    }
    return {
      variant,
      carrying,
      puzzles,
      unlocks: world?.unlocks ?? [],
      packWearers,
    };
  }, [puzzles, variant, world?.unlocks]);

  const performInteraction = useCallback(() => {
    const action: Interaction = resolveInteraction(buildContext());
    switch (action.kind) {
      case 'take':
        mm.take(action.itemId);
        break;
      case 'deposit':
        mm.deposit(action.tower);
        break;
      case 'cart':
        mm.cart();
        break;
      case 'turn':
        mm.turn(action.site, action.totem);
        break;
      case 'dig':
        mm.dig(action.site);
        break;
      case 'pack': {
        const member = members.find((m) => m.slot === action.target);
        if (member) mm.openPack(member.socketId);
        break;
      }
      case 'console':
        setOverlay('inventory');
        break;
      default:
        break;
    }
  }, [buildContext, members, setOverlay]);

  useDesktopInput(!modal, host);

  // ── Pointer lock ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!host) return;
    const change = () => {
      const isLocked = document.pointerLockElement === host;
      setLocked(isLocked);
      if (!isLocked) resetInput();
    };
    document.addEventListener('pointerlockchange', change);
    return () => document.removeEventListener('pointerlockchange', change);
  }, [host]);

  useEffect(() => {
    // An overlay opening releases the pointer; the world screen never fights the
    // browser for it, because losing that fight looks like a frozen game.
    if (modal && document.pointerLockElement) document.exitPointerLock();
  }, [modal]);

  const grab = useCallback(() => {
    if (!host || modal) return;
    void host.requestPointerLock?.();
  }, [host, modal]);

  // ── Global keys the controller does not own ──────────────────────────────
  useEffect(() => {
    const keys = settings().keys;

    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const code = event.code;

      if (code === 'Escape') {
        if (chatOpen) setChatOpen(false);
        else if (overlay !== 'none') setOverlay('none');
        else setOverlay('pause');
        return;
      }
      if (input.typing) return;

      if (code === keys.chat) {
        event.preventDefault();
        setChatOpen(true);
        return;
      }
      if (code === keys.map) {
        setOverlay(overlay === 'map' ? 'none' : 'map');
        return;
      }
      if (code === keys.inventory) {
        event.preventDefault();
        setOverlay(overlay === 'inventory' ? 'none' : 'inventory');
        return;
      }
      if (code === keys.gestures) {
        setOverlay(overlay === 'gestures' ? 'none' : 'gestures');
        return;
      }
      if (modal) return;

      if (code === keys.drop) {
        mm.drop();
        return;
      }
      if (code === keys.use) {
        mm.use();
        return;
      }
      if (code === keys.talk) {
        const mode = settings().micMode;
        if (mode === 'push') setTransmitting(true);
        else if (mode === 'toggle') setTransmitting(!isTransmitting());
        return;
      }
      // Number keys fire gestures directly — the wheel is for people who would
      // rather point at a picture than remember that 3 means yes.
      const digit = Number(code.replace('Digit', ''));
      if (code.startsWith('Digit') && digit >= 1 && digit <= GESTURE_WHEEL.length) {
        mm.gesture(GESTURE_WHEEL[digit - 1]);
      }
    };

    const up = (event: KeyboardEvent) => {
      if (event.code === keys.talk && settings().micMode === 'push') setTransmitting(false);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [chatOpen, modal, overlay, setChatOpen, setOverlay]);

  // ── Throw charge ─────────────────────────────────────────────────────────
  const chargeRef = useRef(0);
  useEffect(() => {
    if (modal) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const delta = (now - last) / 1000;
      last = now;
      if (input.throwing) {
        chargeRef.current = Math.min(1, chargeRef.current + delta * 1.35);
        setCharge(chargeRef.current);
      } else if (chargeRef.current > 0) {
        const power = chargeRef.current;
        chargeRef.current = 0;
        setCharge(0);
        const pitch = live.self.pitch;
        const yaw = live.self.yaw;
        mm.throwItem(
          [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + 0.25, Math.cos(yaw) * Math.cos(pitch)],
          power,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [modal]);

  useEffect(() => {
    const up = (event: KeyboardEvent) => {
      if (event.code === settings().keys.throwItem) input.throwing = false;
    };
    window.addEventListener('keyup', up);
    return () => window.removeEventListener('keyup', up);
  }, []);

  // Interact requests that come from the HUD's own buttons (touch, keyboard
  // users who tabbed to it) go through the same path as the key.
  useEffect(() => {
    if (!modal) return;
    // Drain anything queued while an overlay was up, so dismissing a map does
    // not immediately pick up whatever you happened to be standing on.
    consume('interact');
  }, [modal]);

  const blinded = (live.self.bits & BIT.BLIND) !== 0;

  return (
    <div
      ref={setHost}
      className="app-viewport relative select-none"
      style={{ background: LAND.waterDeep, touchAction: 'none' }}
    >
      <Canvas
        shadows={quality.shadows}
        dpr={dpr}
        gl={{ antialias: quality.antialias, powerPreference: 'high-performance' }}
        camera={{ fov: useMmSettings.getState().fov, near: 0.1, far: CAMERA_FAR }}
        onPointerDown={grab}
      >
        <AdaptiveQuality onDownscale={downscale} />
        <Scene quality={quality} tier={tier} onInteract={performInteraction} />
      </Canvas>

      <Hud
        locked={locked}
        charge={charge}
        onGrab={grab}
        onInteract={performInteraction}
        getInteraction={() => resolveInteraction(buildContext())}
        onNotify={notify}
        blinded={blinded}
      />
    </div>
  );
}
