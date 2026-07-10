'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
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
import { Panel3D } from './ui3d/Panel3D';
import { Label3D } from './ui3d/Label3D';
import { Button3D } from './ui3d/Button3D';

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
        <SourceBuyCard3D id={selDef.id} position={[selPos[0], 4.2, selPos[2]]} onClose={() => setSelected(null)} />
      )}

      {/* Hint when nothing selected */}
      {!selDef && snap.unlocked.length > 0 && (
        <Label3D text={t('tap-a-source', { defaultValue: 'Tap a structure to expand it' })} height={0.4} options={{ color: '#e8d5b0', fontSize: 40 }} position={[0, 0.8, 9.5]} />
      )}
    </group>
  );
}

function SourceBuyCard3D({ id, position, onClose }: { id: SourceId; position: [number, number, number]; onClose: () => void }) {
  const { t } = useTranslation('c-temple-of-joy');
  const buyQty = useTempleStore((st) => st.sourceBuyQty);
  const numberFormat = useTempleStore((st) => st.numberFormat);
  // Re-render on the parent's 400ms tick is enough for cost/affordability.
  const s = useTempleStore.getState();
  const def = SOURCES.find((x) => x.id === id)!;
  const count = s.sources[id] ?? 0;

  let cost: number;
  let qtyLabel: string;
  if (buyQty === 'max') {
    const n = computeMaxAffordable(id, s);
    cost = n > 0 ? computeSourceCostN(id, count, n, s) : computeSourceCost(id, count, s);
    qtyLabel = t('buy-max-n', { defaultValue: 'MAX ({{n}})', n });
  } else {
    cost = computeSourceCostN(id, count, buyQty, s);
    qtyLabel = `×${buyQty}`;
  }
  const canAfford = buyQty === 'max' ? computeMaxAffordable(id, s) > 0 : s.happiness >= cost;

  const buy = () => {
    const st = useTempleStore.getState();
    if (buyQty === 'max') st.buySourceMax(id);
    else if (buyQty === 1) st.buySource(id);
    else st.buySourceN(id, buyQty);
  };

  return (
    <Panel3D width={3} height={2} position={position}>
      <Label3D text={`${def.icon} ${def.name}`} height={0.26} options={{ color: '#f0c84a', fontSize: 52 }} position={[0, 0.66, 0.05]} />
      <Label3D text={def.tagline} height={0.34} options={{ color: '#cbb48a', fontSize: 30, italic: true, maxWidth: 560 }} position={[0, 0.24, 0.05]} />
      <Label3D text={`${t('owned', { defaultValue: 'Owned' })}: ${count}   💰 ${fmt(cost, numberFormat)}`} height={0.2} options={{ color: '#e8d5b0', fontSize: 38 }} position={[0, -0.22, 0.05]} />
      <Button3D label={`${t('buy', { defaultValue: 'Buy' })} ${qtyLabel}`} onClick={buy} enabled={canAfford} pulse={canAfford} width={2.2} height={0.45} fontSize={40} position={[-0.4, -0.66, 0.08]} billboard={false} />
      <Button3D label="✕" onClick={onClose} width={0.5} height={0.45} fontSize={40} color="#6b4c2a" position={[1.05, -0.66, 0.08]} billboard={false} />
    </Panel3D>
  );
}
