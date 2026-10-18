'use client';

/** Training room UI: menu entry, DOM panel (frame data, inputs, dummy), and the 3D hitbox overlay. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import type { GameSession } from '@/lib/kowloon-knockout/net/session';
import type { TrainingController, TrainingView } from '@/lib/kowloon-knockout/game/training';
import { PUNCH_DEFS, punchHitFrame } from '@/lib/kowloon-knockout/game/combat/punches';
import {
  FIGHTER_RADIUS,
  HIT_ARC_COS,
  RANGE_SCALE,
} from '@/lib/kowloon-knockout/game/fighters/types';

export function TrainingMenuButton() {
  const { t } = useTranslation('f-action');
  return (
    <button
      type="button"
      className="neon-button neon-button-controls"
      onClick={() => useGameStore.getState().startTraining()}
    >
      {t('kk-training', { defaultValue: 'TRAINING' })}
    </button>
  );
}

const ARROWS: Record<string, string> = { '-1,0': '←', '1,0': '→', '0,-1': '↑', '0,1': '↓' };

function heldLabel(h: TrainingView['held']): string {
  const x = Math.abs(h.moveX) > 0.3 ? Math.sign(h.moveX) : 0;
  const z = Math.abs(h.moveZ) > 0.3 ? Math.sign(h.moveZ) : 0;
  if (x && z) return `${ARROWS[`${x},0`]}${ARROWS[`0,${z}`]}`;
  return ARROWS[`${x},${z}`] ?? '·';
}

export function TrainingPanel({ training }: { training: TrainingController }) {
  const { t } = useTranslation('f-action');
  const [view, setView] = useState<TrainingView>(() => training.view());

  // Same cadence as the HUD poll: ~10 Hz, never per frame.
  useEffect(() => {
    const id = window.setInterval(() => setView(training.view()), 100);
    return () => window.clearInterval(id);
  }, [training]);

  const fd = view.frameData;
  const adv = fd?.advantage;

  return (
    <div className="kk-training-panel" data-floating="feature-overlay">
      <h2>{t('kk-train-title', { defaultValue: 'Training room' })}</h2>

      <section aria-label={t('kk-train-frame-data', { defaultValue: 'Frame data' })}>
        <h3>{t('kk-train-frame-data', { defaultValue: 'Frame data' })}</h3>
        {fd ? (
          <dl>
            <dt>{t('kk-train-move', { defaultValue: 'Move' })}</dt>
            <dd>{fd.move}</dd>
            <dt>{t('kk-train-startup', { defaultValue: 'Startup' })}</dt>
            <dd>{fd.startup}f</dd>
            <dt>{t('kk-train-active', { defaultValue: 'Active' })}</dt>
            <dd>{fd.active}f</dd>
            <dt>{t('kk-train-recovery', { defaultValue: 'Recovery' })}</dt>
            <dd>{fd.recovery}f</dd>
            <dt>{t('kk-train-total', { defaultValue: 'Total' })}</dt>
            <dd>{fd.total}f</dd>
            <dt>{t('kk-train-result', { defaultValue: 'Result' })}</dt>
            <dd>
              {fd.result === 'pending' && t('kk-train-pending', { defaultValue: '...' })}
              {fd.result === 'whiff' && t('kk-train-whiff', { defaultValue: 'Whiff' })}
              {fd.result === 'hit' && t('kk-train-hit', { defaultValue: 'Hit' })}
              {fd.result === 'block' && t('kk-train-block', { defaultValue: 'Blocked' })}
            </dd>
            {(fd.result === 'hit' || fd.result === 'block') && (
              <>
                <dt>{t('kk-train-advantage', { defaultValue: 'Advantage' })}</dt>
                <dd>{adv == null ? '...' : `${adv > 0 ? '+' : ''}${adv}f`}</dd>
              </>
            )}
          </dl>
        ) : (
          <p>{t('kk-train-no-move', { defaultValue: 'Throw a punch (J K L U).' })}</p>
        )}
      </section>

      <section aria-label={t('kk-train-inputs', { defaultValue: 'Inputs' })}>
        <h3>{t('kk-train-inputs', { defaultValue: 'Inputs' })}</h3>
        <p className="kk-train-held" aria-live="off">
          {heldLabel(view.held)}
          {view.held.block ? ` ${t('kk-train-block-held', { defaultValue: 'BLOCK' })}` : ''}
        </p>
        <p className="kk-train-history">{view.inputs.join(' ') || '·'}</p>
      </section>

      <section aria-label={t('kk-train-dummy', { defaultValue: 'Dummy' })}>
        <h3>{t('kk-train-dummy', { defaultValue: 'Dummy' })}</h3>
        <p>
          {view.dummy === 'recording' &&
            t('kk-train-recording', { defaultValue: 'Recording: you control the dummy' })}
          {view.dummy === 'playing' &&
            t('kk-train-playing', { defaultValue: 'Replaying {{n}} frames', n: view.slotLength })}
          {view.dummy === 'idle' &&
            (view.slotLength > 0
              ? t('kk-train-saved', { defaultValue: 'Slot holds {{n}} frames', n: view.slotLength })
              : t('kk-train-empty', { defaultValue: 'Slot empty' }))}
        </p>
        <div className="kk-train-row">
          <button
            type="button"
            onClick={() => training.record()}
            disabled={view.dummy === 'recording'}
          >
            {t('kk-train-record', { defaultValue: 'Record' })}
          </button>
          <button type="button" onClick={() => training.stop()} disabled={view.dummy === 'idle'}>
            {t('kk-train-stop', { defaultValue: 'Stop' })}
          </button>
          <button
            type="button"
            onClick={() => training.play()}
            disabled={view.slotLength === 0 || view.dummy === 'recording'}
          >
            {t('kk-train-play', { defaultValue: 'Play' })}
          </button>
          <button type="button" onClick={() => training.clear()} disabled={view.slotLength === 0}>
            {t('kk-train-clear', { defaultValue: 'Clear' })}
          </button>
        </div>
      </section>

      <div className="kk-train-row">
        <button
          type="button"
          aria-pressed={view.showHitbox}
          onClick={() => training.toggleHitbox()}
        >
          {t('kk-train-hitbox', { defaultValue: 'Hitboxes' })}
        </button>
        <button type="button" onClick={() => training.requestReset()}>
          {t('kk-train-reset', { defaultValue: 'Reset spacing' })}
        </button>
        <button type="button" onClick={() => useGameStore.getState().resetGame()}>
          {t('kk-train-exit', { defaultValue: 'Exit' })}
        </button>
      </div>
    </div>
  );
}

const MAX_SEATS = 4;
const ARC = Math.acos(HIT_ARC_COS);

function wedgeGeometry(): THREE.BufferGeometry {
  const pts: number[] = [0, 0, 0];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = -ARC + (2 * ARC * i) / steps;
    pts.push(Math.cos(a), 0, Math.sin(a));
  }
  const idx: number[] = [];
  for (let i = 1; i <= steps; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  return g;
}

/** Hurtbox rings always; the strike arc while a fighter is mid-punch. Updated in the render loop, no React state. */
export function TrainingOverlay({ session }: { session: GameSession }) {
  const training = session.training;
  const group = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    const wedge = wedgeGeometry();
    const ring = new THREE.RingGeometry(FIGHTER_RADIUS - 0.04, FIGHTER_RADIUS, 32);
    ring.rotateX(-Math.PI / 2);
    return Array.from({ length: MAX_SEATS }, () => {
      const holder = new THREE.Group();
      const hurt = new THREE.Mesh(
        ring,
        new THREE.MeshBasicMaterial({ color: '#33ccff', toneMapped: false, depthWrite: false }),
      );
      const strike = new THREE.Mesh(
        wedge,
        new THREE.MeshBasicMaterial({
          color: '#ff6633',
          toneMapped: false,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      hurt.position.y = 0.05;
      strike.position.y = 0.06;
      holder.add(hurt, strike);
      holder.visible = false;
      return { holder, strike };
    });
  }, []);

  useEffect(
    () => () => {
      for (const p of parts) {
        p.holder.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (mat) mat.dispose();
        });
      }
    },
    [parts],
  );

  useFrame(() => {
    const g = group.current;
    if (!g || !training) return;
    const fighters = session.getRenderFighters();
    for (let i = 0; i < MAX_SEATS; i++) {
      const part = parts[i];
      const f = fighters[i];
      part.holder.visible = !!f && training.showHitbox;
      if (!f || !training.showHitbox) continue;
      part.holder.position.set(f.x, 0, f.z);
      part.holder.rotation.y = -f.yaw;
      const striking = f.state === 'punching' && f.punch;
      part.strike.visible = !!striking;
      if (striking && f.punch) {
        const reach = PUNCH_DEFS[f.punch].range * RANGE_SCALE + FIGHTER_RADIUS * 2;
        part.strike.scale.set(reach, 1, reach);
        (part.strike.material as THREE.MeshBasicMaterial).color.set(
          f.punchFrame >= punchHitFrame(f.punch) ? '#ff2244' : '#ff9933',
        );
      }
    }
  });

  return (
    <group ref={group}>
      {parts.map((p, i) => (
        <primitive key={i} object={p.holder} />
      ))}
    </group>
  );
}
