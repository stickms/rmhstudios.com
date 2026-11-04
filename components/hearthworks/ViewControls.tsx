'use client';

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Footprints, Hand, Map as MapIcon } from 'lucide-react';
import { runtime } from '@/lib/hearthworks/runtime-instance';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { interactAt, tileInFront } from '@/lib/hearthworks/tools';

const STICK_RADIUS = 52;

/** The switch between the plan view and the walking view. */
export function ViewToggle() {
  const { t } = useTranslation('c-hearthworks');
  const view = useHearthworks((s) => s.view);
  const walking = view === 'third';
  const label = walking
    ? t('view-plan', { defaultValue: 'Plan' })
    : t('view-walk', { defaultValue: 'Walk' });
  return (
    <button
      type="button"
      className="hw-chip hw-chip--button"
      aria-pressed={walking}
      title={t('view-toggle-hint', { defaultValue: 'Switch view (V)' })}
      onClick={() => hearthworksStore.getState().toggleView()}
    >
      {walking ? <MapIcon aria-hidden size={18} /> : <Footprints aria-hidden size={18} />}
      <span>{label}</span>
    </button>
  );
}

/** Keyboard hint on desktop, a thumb stick and a Use button on touch — only while walking. */
export function WalkControls() {
  const { t } = useTranslation('c-hearthworks');
  const walking = useHearthworks((s) => s.view === 'third');
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);

  if (!walking) return null;

  const move = (clientX: number, clientY: number) => {
    const o = origin.current;
    if (!o) return;
    let dx = clientX - o.x;
    let dy = clientY - o.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    runtime.input.right = dx / STICK_RADIUS;
    runtime.input.forward = -dy / STICK_RADIUS;
    runtime.input.run = Math.hypot(dx, dy) > STICK_RADIUS * 0.92;
  };
  const release = () => {
    origin.current = null;
    if (knob.current) knob.current.style.transform = 'translate(0, 0)';
    runtime.input.right = 0;
    runtime.input.forward = 0;
    runtime.input.run = false;
  };

  return (
    <>
      <p className="hw-hint" aria-hidden="true">
        {t('hint-walk', { defaultValue: 'WASD move · Q/E turn · Space use · V plan view' })}
      </p>
      <div
        ref={stick}
        className="hw-stick"
        role="presentation"
        onPointerDown={(e) => {
          const r = stick.current?.getBoundingClientRect();
          if (!r) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (origin.current?.id === e.pointerId) move(e.clientX, e.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div ref={knob} className="hw-stick__knob" />
      </div>
      <button
        type="button"
        className="hw-use"
        aria-label={t('use-label', { defaultValue: 'Use tool' })}
        onClick={() => {
          const a = runtime.avatar;
          const tile = tileInFront(a.x, a.z, a.yaw);
          interactAt(hearthworksStore, tile.x, tile.z);
        }}
      >
        <Hand aria-hidden size={26} />
      </button>
    </>
  );
}
