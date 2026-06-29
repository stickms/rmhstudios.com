'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import {
  computeSourceCost,
  computeSourceCostN,
  computeMaxAffordable,
  computeSourcePrestigeReq,
} from '@/lib/temple-of-joy/engine';
import type { SourceId, GameState } from '@/lib/temple-of-joy/types';
import { useTap } from './useTap';

function isUnlocked(state: GameState, id: SourceId): boolean {
  const def = SOURCES.find((s) => s.id === id)!;
  const count = state.sources[id] ?? 0;
  const prestigeReq = computeSourcePrestigeReq(id, state);
  if (prestigeReq > 0 && state.prestigeCount < prestigeReq) return false;
  if (count > 0) return true;
  if (state.peakHappiness >= def.baseCost * 0.1) return true;
  if (def.lifetimeHPUnlock !== undefined && state.lifetimeHappiness >= def.lifetimeHPUnlock) return true;
  return false;
}

// Ring layout: sources arrange in expanding concentric rings around the temple.
const PER_RING = 12;
function layout(index: number): [number, number, number] {
  const ring = Math.floor(index / PER_RING);
  const slot = index % PER_RING;
  const radius = 7.5 + ring * 1.7;
  const a = (slot / PER_RING) * Math.PI * 2 + ring * 0.4;
  return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
}

interface PedestalProps {
  id: SourceId;
  index: number;
  count: number;
  affordable: boolean;
  selected: boolean;
  onSelect: (id: SourceId) => void;
}

function SourcePedestal({ id, index, count, affordable, selected, onSelect }: PedestalProps) {
  const pos = useMemo(() => layout(index), [index]);
  const crystalColor = useMemo(() => new THREE.Color().setHSL((0.09 + index * 0.014) % 1, 0.7, 0.6), [index]);
  const crystal = useRef<THREE.Mesh>(null);
  const crystalMat = useRef<THREE.MeshStandardMaterial>(null);
  const bump = useRef(0);
  const prevCount = useRef(count);

  if (count > prevCount.current) bump.current = 1;
  prevCount.current = count;

  const height = Math.min(3.2, 0.5 + Math.log10(count + 1) * 0.55);

  useFrame((state, dt) => {
    bump.current = Math.max(0, bump.current - dt * 3);
    const t = state.clock.elapsedTime;
    if (crystal.current) {
      crystal.current.position.y = height + 0.35 + Math.sin(t * 1.5 + index) * 0.06 + bump.current * 0.3;
      crystal.current.rotation.y += dt * 0.6;
      const s = (selected ? 1.35 : 1) * (1 + bump.current * 0.4);
      crystal.current.scale.setScalar(s * 0.28);
    }
    if (crystalMat.current) {
      crystalMat.current.emissiveIntensity = (affordable ? 1.6 : 0.5) + (selected ? 1 : 0) + Math.sin(t * 3 + index) * 0.2;
    }
  });

  const tap = useTap(() => onSelect(id));

  return (
    <group position={pos}>
      {/* Pillar — height grows with how many you own */}
      <mesh position={[0, height / 2, 0]} {...tap}>
        <cylinderGeometry args={[0.28, 0.36, height, 6]} />
        <meshStandardMaterial
          color={affordable ? '#caa15a' : '#6f4e25'}
          emissive={affordable ? '#ff9d2a' : '#000000'}
          emissiveIntensity={affordable ? 0.4 : 0}
          metalness={0.5}
          roughness={0.5}
        />
      </mesh>
      {/* Floating crystal */}
      <mesh ref={crystal} position={[0, height + 0.35, 0]} {...tap}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          ref={crystalMat}
          color={crystalColor}
          emissive={crystalColor}
          emissiveIntensity={1}
          metalness={0.4}
          roughness={0.2}
          toneMapped={false}
        />
      </mesh>
      {/* Count ring base */}
      {count > 0 && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 24]} />
          <meshStandardMaterial color="#ff9d2a" emissive="#ff9d2a" emissiveIntensity={0.6} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Sources rendered as interactive structures standing on the temple grounds.
 * Tapping a pedestal selects it and raises a themed buy-card; buying grows the
 * pedestal. The grounds visibly expand outward (new rings) as more sources unlock.
 */
export function SourceStructures() {
  const { t } = useTranslation('c-temple-of-joy');
  const [selected, setSelected] = useState<SourceId | null>(null);
  const [snap, setSnap] = useState<{ unlocked: SourceId[]; counts: Record<string, number>; affordable: Set<string> }>(
    { unlocked: [], counts: {}, affordable: new Set() },
  );

  useEffect(() => {
    const sample = () => {
      const s = useTempleStore.getState();
      const unlocked: SourceId[] = [];
      const counts: Record<string, number> = {};
      const affordable = new Set<string>();
      for (const def of SOURCES) {
        if (!isUnlocked(s, def.id)) continue;
        unlocked.push(def.id);
        counts[def.id] = s.sources[def.id] ?? 0;
        if (s.happiness >= computeSourceCost(def.id, s.sources[def.id] ?? 0, s)) affordable.add(def.id);
      }
      setSnap({ unlocked, counts, affordable });
    };
    sample();
    const id = window.setInterval(sample, 400);
    return () => window.clearInterval(id);
  }, []);

  const selDef = selected ? SOURCES.find((s) => s.id === selected)! : null;
  const selIndex = selected ? snap.unlocked.indexOf(selected) : -1;
  const selPos = selIndex >= 0 ? layout(selIndex) : [0, 0, 0];

  return (
    <group>
      {snap.unlocked.map((id) => (
        <SourcePedestal
          key={id}
          id={id}
          index={snap.unlocked.indexOf(id)}
          count={snap.counts[id] ?? 0}
          affordable={snap.affordable.has(id)}
          selected={selected === id}
          onSelect={(sid) => setSelected((cur) => (cur === sid ? null : sid))}
        />
      ))}

      {selDef && (
        <Html position={[selPos[0], 3.2, selPos[2]]} center distanceFactor={14} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
          <BuyCard id={selDef.id} onClose={() => setSelected(null)} />
        </Html>
      )}

      {/* Hint when nothing selected */}
      {!selDef && snap.unlocked.length > 0 && (
        <Html position={[0, 0.4, 9.5]} center distanceFactor={16} style={{ pointerEvents: 'none' }}>
          <div className="temple-world-hint">{t('tap-a-source', { defaultValue: 'Tap a structure to expand it' })}</div>
        </Html>
      )}
    </group>
  );
}

function BuyCard({ id, onClose }: { id: SourceId; onClose: () => void }) {
  const { t } = useTranslation('c-temple-of-joy');
  // Pull a fresh snapshot each render (parent re-renders on the 400ms tick).
  const s = useTempleStore.getState();
  const def = SOURCES.find((x) => x.id === id)!;
  const count = s.sources[id] ?? 0;
  const buyQty = useTempleStore((st) => st.sourceBuyQty);
  const numberFormat = useTempleStore((st) => st.numberFormat);

  let cost: number;
  let label: string;
  if (buyQty === 'max') {
    const n = computeMaxAffordable(id, s);
    cost = n > 0 ? computeSourceCostN(id, count, n, s) : computeSourceCost(id, count, s);
    label = t('buy-max-n', { defaultValue: 'MAX ({{n}})', n });
  } else {
    cost = computeSourceCostN(id, count, buyQty, s);
    label = `×${buyQty}`;
  }
  const canAfford = buyQty === 'max' ? computeMaxAffordable(id, s) > 0 : s.happiness >= cost;

  const buy = () => {
    const st = useTempleStore.getState();
    if (buyQty === 'max') st.buySourceMax(id);
    else if (buyQty === 1) st.buySource(id);
    else st.buySourceN(id, buyQty);
  };

  return (
    <div className="temple-world-card" style={{ pointerEvents: 'auto' }}>
      <div className="temple-world-card-head">
        <span style={{ fontSize: 20 }}>{def.icon}</span>
        <span className="temple-world-card-title">{def.name}</span>
        <button className="temple-world-card-x" onClick={onClose} aria-label="close">✕</button>
      </div>
      <div className="temple-world-card-sub">{def.tagline}</div>
      <div className="temple-world-card-row">
        <span>{t('owned', { defaultValue: 'Owned' })}: <b>{count}</b></span>
      </div>
      <button className="temple-world-buy" disabled={!canAfford} onClick={buy}>
        <span style={{ opacity: 0.85, fontSize: 11 }}>💰 {fmt(cost, numberFormat)}</span>
        <span>{t('buy', { defaultValue: 'Buy' })} {label}</span>
      </button>
    </div>
  );
}
