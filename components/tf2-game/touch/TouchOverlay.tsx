/**
 * On-screen controls for touch-first devices. They write the same InputState
 * as the keyboard and gamepad (source 'touch'), so the tick's UserCmd comes
 * from `buildUserCmd` either way:
 *
 *   - left side: a floating thumbstick — it appears where the thumb lands and
 *     moves `analog.touch`;
 *   - right side: drag to look (degrees per pixel from the settings), and the
 *     fire button looks too while held, as mobile shooters do;
 *   - buttons per game: fire / alt-fire (labelled per TF2 class: zoom, cloak,
 *     über, detonate…), jump, crouch, reload, use, weapon next / previous and
 *     slot taps, scoreboard, chat, voice, the menu; TF2 class extras (call for
 *     a Medic; the Engineer's build/destroy PDAs; the Spy's disguise kit),
 *     HL2's sprint and flashlight, Portal's blue / orange portals.
 *
 * Multi-touch by pointer id; `touch-action: none` and an iOS gesture guard stop
 * scrolling, pinch zoom and overscroll; every control sits inside the safe
 * area and off the screen edges. Presses tick the haptics motor when allowed.
 */
'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowBigDown,
  ArrowBigUp,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Flashlight,
  Hand,
  ListOrdered,
  Menu,
  MessageSquare,
  Megaphone,
  RotateCcw,
  Zap,
} from 'lucide-react';
import type { HudGame, HudLocalPlayer } from '@/lib/tf2-game/client/hud-state';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import type { GameSettings } from '@/lib/tf2-game/client/settings';
import type { HeldAction, ImpulseAction } from '@/lib/tf2-game/client/input/actions';
import { pushImpulse, setHeld, type InputState, type Vec2 } from '@/lib/tf2-game/client/input/input-state';
import { dragToLook, floatingOrigin, knobOffset, stickVector, STICK_RADIUS } from '@/lib/tf2-game/client/input/touch';
import { hapticsEnabled, vibrate } from '@/lib/shared/platform';
import {
  TF_CLASS_DEMOMAN,
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SNIPER,
  TF_CLASS_SPY,
} from '@/lib/tf2-game/core/constants';

interface ButtonSpec {
  id: string;
  label: string;
  icon?: ReactNode;
  text?: string;
  /** Held while pressed. */
  hold?: HeldAction;
  /** Fired on press. */
  impulse?: ImpulseAction;
  /** Custom press handler. */
  onPress?: () => void;
  /** Drags on it also turn the view. */
  look?: boolean;
  /** Offsets from the bottom-right (px at scale 1), or top-left when `top`. */
  right?: number;
  left?: number;
  bottom?: number;
  top?: number;
  size?: number;
  tone?: 'blue' | 'orange';
  /** A weapon slot tap (hidden in landscape, where next/previous are enough). */
  slot?: boolean;
}

function TouchButton({
  spec,
  input,
  settings,
}: {
  spec: ButtonSpec;
  input: InputState;
  settings: GameSettings;
}) {
  const [pressed, setPressed] = useState(false);
  const last = useRef<Vec2 | null>(null);
  const tick = () => {
    if (settings.touch.haptics && hapticsEnabled()) vibrate(8);
  };
  const style: CSSProperties & Record<string, string | number> = {
    '--size': `${spec.size ?? 56}px`,
  };
  const inset = (v: number, side: 'right' | 'left' | 'bottom' | 'top') =>
    `calc(env(safe-area-inset-${side}, 0px) + ${v}px * var(--touch-scale))`;
  if (spec.right !== undefined) style.right = inset(spec.right, 'right');
  if (spec.left !== undefined) style.left = inset(spec.left, 'left');
  if (spec.bottom !== undefined) style.bottom = inset(spec.bottom, 'bottom');
  if (spec.top !== undefined) style.top = inset(spec.top, 'top');
  const release = () => {
    setPressed(false);
    last.current = null;
    if (spec.hold) setHeld(input, 'touch', spec.hold, false);
  };
  return (
    <button
      type="button"
      className="tf2g-touch-btn"
      style={style}
      data-pressed={pressed}
      data-tone={spec.tone}
      data-slot-button={spec.slot}
      aria-label={spec.label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setPressed(true);
        last.current = { x: e.clientX, y: e.clientY };
        tick();
        if (spec.hold) setHeld(input, 'touch', spec.hold, true);
        if (spec.impulse) pushImpulse(input, spec.impulse);
        spec.onPress?.();
      }}
      onPointerMove={(e) => {
        if (!spec.look || !last.current) return;
        const d = dragToLook(e.clientX - last.current.x, e.clientY - last.current.y, settings.touch.lookSensitivity, settings.invertY);
        input.lookYaw += d.yaw;
        input.lookPitch += d.pitch;
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {spec.icon}
      {spec.text ? <span>{spec.text}</span> : null}
    </button>
  );
}

/** The alt-fire button's label for a TF2 class. */
function useAltLabel(cls: number): string {
  const { t } = useTranslation('c-tf2-game');
  switch (cls) {
    case TF_CLASS_SNIPER:
      return t('touch_zoom', { defaultValue: 'Zoom' });
    case TF_CLASS_SPY:
      return t('touch_cloak', { defaultValue: 'Cloak' });
    case TF_CLASS_MEDIC:
      return t('touch_uber', { defaultValue: 'Über' });
    case TF_CLASS_DEMOMAN:
      return t('touch_detonate', { defaultValue: 'Detonate' });
    case TF_CLASS_HEAVYWEAPONS:
      return t('touch_spin', { defaultValue: 'Spin' });
    case TF_CLASS_PYRO:
      return t('touch_airblast', { defaultValue: 'Airblast' });
    default:
      return t('touch_alt', { defaultValue: 'Alt-fire' });
  }
}

export default function TouchOverlay({
  game,
  input,
  store,
  local,
  settings,
  menuOpen = false,
  onToggleScores,
}: {
  game: HudGame;
  input: InputState;
  store: HudStore;
  local: HudLocalPlayer | null;
  settings: GameSettings;
  /** A menu, PDA panel or the scoreboard is up: taps belong to it, not to the stick or the look zone. */
  menuOpen?: boolean;
  onToggleScores: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const root = useRef<HTMLDivElement>(null);
  const moveZone = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [stick, setStick] = useState<{ origin: Vec2; knob: Vec2 } | null>(null);
  const altLabel = useAltLabel(local?.cls ?? 0);
  const scale = settings.touch.buttonScale;
  const radius = STICK_RADIUS * scale;

  // iOS Safari's own pinch/rotate gestures ignore touch-action on some versions.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', stop);
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', stop);
      el.removeEventListener('touchmove', stop);
    };
  }, []);

  // Lifting the overlay (menu opened, unmount) releases everything it holds.
  useEffect(
    () => () => {
      input.held.touch.clear();
      input.analog.touch.x = 0;
      input.analog.touch.y = 0;
    },
    [input],
  );

  const endStick = useCallback(() => {
    stickPointer.current = null;
    input.analog.touch.x = 0;
    input.analog.touch.y = 0;
    setStick(null);
  }, [input]);

  // A menu opening mid-drag drops the stick and the look drag, so nothing stays held under it.
  useEffect(() => {
    if (!menuOpen) return;
    endStick();
    lookPointer.current = null;
  }, [menuOpen, endStick]);

  const sendPda = (slot: number) => () => pushImpulse(input, `slot${slot}` as ImpulseAction);

  const buttons: ButtonSpec[] = [];
  const fireLook = { look: true };
  if (game === 'portal') {
    buttons.push(
      { id: 'blue', label: t('touch_blue', { defaultValue: 'Fire blue portal' }), icon: <Crosshair aria-hidden="true" />, hold: 'attack', right: 24, bottom: 120, size: 76, tone: 'blue', ...fireLook },
      { id: 'orange', label: t('touch_orange', { defaultValue: 'Fire orange portal' }), icon: <Crosshair aria-hidden="true" />, hold: 'attack2', right: 112, bottom: 160, size: 64, tone: 'orange', ...fireLook },
    );
  } else {
    buttons.push(
      { id: 'fire', label: t('touch_fire', { defaultValue: 'Fire' }), icon: <Crosshair aria-hidden="true" />, hold: 'attack', right: 24, bottom: 120, size: 76, ...fireLook },
      { id: 'alt', label: game === 'tf2' ? altLabel : t('touch_alt', { defaultValue: 'Alt-fire' }), text: game === 'tf2' ? altLabel : t('touch_alt_short', { defaultValue: 'Alt' }), hold: 'attack2', right: 112, bottom: 168, size: 58 },
      { id: 'reload', label: t('touch_reload', { defaultValue: 'Reload' }), icon: <RotateCcw aria-hidden="true" />, hold: 'reload', right: 184, bottom: 36, size: 48 },
      { id: 'next', label: t('touch_next', { defaultValue: 'Next weapon' }), icon: <ChevronRight aria-hidden="true" />, impulse: 'invnext', right: 184, bottom: 160, size: 46 },
      { id: 'prev', label: t('touch_prev', { defaultValue: 'Previous weapon' }), icon: <ChevronLeft aria-hidden="true" />, impulse: 'invprev', right: 240, bottom: 130, size: 46 },
    );
  }
  buttons.push(
    { id: 'jump', label: t('touch_jump', { defaultValue: 'Jump' }), icon: <ArrowBigUp aria-hidden="true" />, hold: 'jump', right: 24, bottom: 28, size: 66 },
    { id: 'duck', label: t('touch_duck', { defaultValue: 'Crouch' }), icon: <ArrowBigDown aria-hidden="true" />, hold: 'duck', right: 104, bottom: 28, size: 58 },
  );
  if (game !== 'tf2') {
    buttons.push({ id: 'use', label: t('touch_use', { defaultValue: 'Use' }), icon: <Hand aria-hidden="true" />, hold: 'use', right: 184, bottom: 98, size: 50 });
  }
  if (game === 'hl2') {
    buttons.push(
      { id: 'sprint', label: t('touch_sprint', { defaultValue: 'Sprint' }), icon: <Zap aria-hidden="true" />, hold: 'speed', left: 28, bottom: 200, size: 50 },
      { id: 'flashlight', label: t('touch_flashlight', { defaultValue: 'Flashlight' }), icon: <Flashlight aria-hidden="true" />, impulse: 'flashlight', left: 28, bottom: 262, size: 44 },
    );
  }
  if (game === 'tf2' && local) {
    buttons.push({ id: 'medic', label: t('touch_medic', { defaultValue: 'Call for a Medic' }), text: '+', impulse: 'medic', right: 184, bottom: 98, size: 46 });
    if (local.cls === TF_CLASS_ENGINEER) {
      buttons.push(
        { id: 'build', label: t('touch_build', { defaultValue: 'Build' }), text: t('touch_build', { defaultValue: 'Build' }), onPress: sendPda(4), left: 28, bottom: 200, size: 50 },
        { id: 'destroy', label: t('touch_destroy', { defaultValue: 'Destroy' }), text: t('touch_destroy_short', { defaultValue: 'Demo' }), onPress: sendPda(5), left: 28, bottom: 260, size: 44 },
      );
    }
    if (local.cls === TF_CLASS_SPY) {
      buttons.push({ id: 'disguise', label: t('touch_disguise', { defaultValue: 'Disguise' }), text: t('touch_disguise', { defaultValue: 'Disguise' }), onPress: sendPda(4), left: 28, bottom: 200, size: 50 });
    }
  }

  const slots = game === 'portal' ? [] : (local?.slots ?? []).filter((s) => s.slot <= 2);

  return (
    <div
      ref={root}
      className="tf2g-touch tf2g-interactive"
      style={{ '--touch-scale': scale } as CSSProperties}
      data-jelly-zone="playfield"
      data-menu-open={menuOpen}
      aria-label={t('touch_aria', { defaultValue: 'Touch controls' })}
      role="group"
    >
      <div
        ref={moveZone}
        className="tf2g-touch-zone"
        data-zone="move"
        onPointerDown={(e) => {
          if (stickPointer.current !== null) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          stickPointer.current = e.pointerId;
          const r = e.currentTarget.getBoundingClientRect();
          const origin = floatingOrigin(
            { x: e.clientX - r.left, y: e.clientY - r.top },
            { left: 16, top: r.height * 0.35, right: r.width - 16, bottom: r.height - 16 },
            radius,
          );
          setStick({ origin, knob: { x: 0, y: 0 } });
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== stickPointer.current || !stick) return;
          const r = e.currentTarget.getBoundingClientRect();
          const p = { x: e.clientX - r.left, y: e.clientY - r.top };
          const v = stickVector(stick.origin, p, radius);
          input.analog.touch.x = v.x;
          input.analog.touch.y = v.y;
          setStick({ origin: stick.origin, knob: knobOffset(stick.origin, p, radius) });
        }}
        onPointerUp={(e) => e.pointerId === stickPointer.current && endStick()}
        onPointerCancel={(e) => e.pointerId === stickPointer.current && endStick()}
      >
        {stick ? (
          <>
            <span className="tf2g-stick-base" style={{ left: stick.origin.x, top: stick.origin.y }} />
            <span className="tf2g-stick-knob" style={{ left: stick.origin.x + stick.knob.x, top: stick.origin.y + stick.knob.y }} />
          </>
        ) : (
          <span className="tf2g-stick-hint" aria-hidden="true" />
        )}
      </div>
      <div
        className="tf2g-touch-zone"
        data-zone="look"
        onPointerDown={(e) => {
          if (lookPointer.current) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          lookPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const l = lookPointer.current;
          if (!l || l.id !== e.pointerId) return;
          const d = dragToLook(e.clientX - l.x, e.clientY - l.y, settings.touch.lookSensitivity, settings.invertY);
          input.lookYaw += d.yaw;
          input.lookPitch += d.pitch;
          l.x = e.clientX;
          l.y = e.clientY;
        }}
        onPointerUp={(e) => {
          if (lookPointer.current?.id === e.pointerId) lookPointer.current = null;
        }}
        onPointerCancel={(e) => {
          if (lookPointer.current?.id === e.pointerId) lookPointer.current = null;
        }}
      />
      {buttons.map((b) => (
        <TouchButton key={b.id} spec={b} input={input} settings={settings} />
      ))}
      <div className="tf2g-touch-side">
        {game === 'tf2' ? (
          <>
            <TouchButton spec={{ id: 'scores', label: t('touch_scores', { defaultValue: 'Scoreboard' }), icon: <ListOrdered aria-hidden="true" />, onPress: onToggleScores, size: 40 }} input={input} settings={settings} />
            <TouchButton spec={{ id: 'chat', label: t('touch_chat', { defaultValue: 'Chat' }), icon: <MessageSquare aria-hidden="true" />, impulse: 'say', size: 40 }} input={input} settings={settings} />
            <TouchButton spec={{ id: 'voice', label: t('touch_voice', { defaultValue: 'Voice commands' }), icon: <Megaphone aria-hidden="true" />, impulse: 'voice_menu_1', size: 40 }} input={input} settings={settings} />
          </>
        ) : null}
        <TouchButton spec={{ id: 'menu', label: t('touch_menu', { defaultValue: 'Menu' }), icon: <Menu aria-hidden="true" />, onPress: () => store.dispatchImpulse('menu'), size: 40 }} input={input} settings={settings} />
        {slots.length > 1
          ? slots.map((s) => (
              <TouchButton
                key={s.slot}
                spec={{
                  id: `slot${s.slot}`,
                  label: t('touch_slot', { defaultValue: 'Weapon {{n}}: {{name}}', n: s.slot + 1, name: s.name }),
                  text: String(s.slot + 1),
                  impulse: `slot${s.slot + 1}` as ImpulseAction,
                  slot: true,
                  size: 40,
                }}
                input={input}
                settings={settings}
              />
            ))
          : null}
      </div>
    </div>
  );
}
