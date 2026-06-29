'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import { UPGRADES, UPGRADE_MAP } from '@/lib/temple-of-joy/data/upgrades';
import { computeIsUpgradeVisible, computeUpgradeCost } from '@/lib/temple-of-joy/engine';
import type { UpgradePath } from '@/lib/temple-of-joy/types';
import { useTap } from './useTap';
import { Panel3D } from './ui3d/Panel3D';
import { Label3D } from './ui3d/Label3D';
import { Button3D } from './ui3d/Button3D';

const PATH_COLOR: Record<UpgradePath, string> = {
  carnal: '#ff6b6b',
  social: '#ffa94d',
  mind: '#74c0fc',
  spirit: '#b197fc',
  indulgence: '#ff8cc8',
  philosophy: '#ffe066',
  offering: '#63e6be',
  synergy: '#f783ac',
};

const MAX_ORBS = 24; // keep the halo readable; full list still lives in the panel

interface OrbProps {
  id: string;
  slot: number;
  total: number;
  affordable: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}

function UpgradeOrb({ id, slot, total, affordable, selected, onSelect }: OrbProps) {
  const def = UPGRADE_MAP[id];
  const color = useMemo(() => new THREE.Color(PATH_COLOR[def.path] ?? '#ffd27a'), [def.path]);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);

  // Distribute on a dome around the sun.
  const base = useMemo(() => {
    const a = (slot / Math.max(1, total)) * Math.PI * 2;
    const ringRadius = 4.6;
    const y = 4.6 + Math.sin(slot * 1.3) * 1.2;
    return new THREE.Vector3(Math.cos(a) * ringRadius, y, Math.sin(a) * ringRadius);
  }, [slot, total]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (mesh.current) {
      mesh.current.position.set(base.x, base.y + Math.sin(t * 1.2 + slot) * 0.2, base.z);
      mesh.current.scale.setScalar((selected ? 0.42 : 0.28) * (affordable ? 1 + Math.sin(t * 4 + slot) * 0.08 : 1));
    }
    if (mat.current) {
      mat.current.emissiveIntensity = (affordable ? 1.8 : 0.45) + (selected ? 1.2 : 0);
    }
  });

  const tap = useTap(() => onSelect(id));

  return (
    <mesh ref={mesh} position={base} {...tap}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={1} metalness={0.3} roughness={0.25} toneMapped={false} />
    </mesh>
  );
}

/**
 * Available upgrades hover as a halo of glowing orbs around the sun (colour-coded
 * by path). Affordable ones pulse; tapping one raises a buy-card. The full,
 * scrollable list still lives in the Upgrades panel for browsing.
 */
export function UpgradeOrbs() {
  const orbit = useRef<THREE.Group>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState<{ ids: string[]; affordable: Set<string> }>({ ids: [], affordable: new Set() });

  useEffect(() => {
    const sample = () => {
      const s = useTempleStore.getState();
      const available = UPGRADES.filter((u) => !s.upgrades.has(u.id) && computeIsUpgradeVisible(u.id, s));
      available.sort((a, b) => computeUpgradeCost(a.id, s) - computeUpgradeCost(b.id, s));
      const top = available.slice(0, MAX_ORBS);
      const affordable = new Set<string>();
      for (const u of top) if (s.happiness >= computeUpgradeCost(u.id, s)) affordable.add(u.id);
      setSnap({ ids: top.map((u) => u.id), affordable });
      setSelected((cur) => (cur && top.some((u) => u.id === cur) ? cur : null));
    };
    sample();
    const id = window.setInterval(sample, 600);
    return () => window.clearInterval(id);
  }, []);

  useFrame((_s, dt) => {
    if (orbit.current) orbit.current.rotation.y += dt * 0.08;
  });

  const selSlot = selected ? snap.ids.indexOf(selected) : -1;

  return (
    <group ref={orbit}>
      {snap.ids.map((id, i) => (
        <UpgradeOrb
          key={id}
          id={id}
          slot={i}
          total={snap.ids.length}
          affordable={snap.affordable.has(id)}
          selected={selected === id}
          onSelect={(uid) => setSelected((cur) => (cur === uid ? null : uid))}
        />
      ))}

      {selected && selSlot >= 0 && (
        <UpgradeCard3D
          id={selected}
          position={[
            Math.cos((selSlot / Math.max(1, snap.ids.length)) * Math.PI * 2) * 4.6,
            4.6 + Math.sin(selSlot * 1.3) * 1.2 + 1.4,
            Math.sin((selSlot / Math.max(1, snap.ids.length)) * Math.PI * 2) * 4.6,
          ]}
          onClose={() => setSelected(null)}
        />
      )}
    </group>
  );
}

function UpgradeCard3D({ id, position, onClose }: { id: string; position: [number, number, number]; onClose: () => void }) {
  const { t } = useTranslation('c-temple-of-joy');
  const numberFormat = useTempleStore((st) => st.numberFormat);
  const s = useTempleStore.getState();
  const def = UPGRADE_MAP[id];
  const cost = computeUpgradeCost(id, s);
  const canAfford = s.happiness >= cost;
  const accent = PATH_COLOR[def.path] ?? '#d4a847';

  return (
    <Panel3D width={3} height={2} position={position} accent={accent}>
      <Label3D text={def.name} height={0.24} options={{ color: accent, fontSize: 50, maxWidth: 580 }} position={[0, 0.66, 0.05]} />
      <Label3D text={def.flavor} height={0.5} options={{ color: '#cbb48a', fontSize: 30, italic: true, maxWidth: 560 }} position={[0, 0.12, 0.05]} />
      <Label3D text={`💰 ${fmt(cost, numberFormat)}`} height={0.2} options={{ color: '#e8d5b0', fontSize: 38 }} position={[0, -0.3, 0.05]} />
      <Button3D label={t('purchase', { defaultValue: 'Purchase' })} onClick={() => useTempleStore.getState().purchaseUpgrade(id)} enabled={canAfford} pulse={canAfford} width={2.2} height={0.45} fontSize={40} color={accent} position={[-0.4, -0.7, 0.08]} billboard={false} />
      <Button3D label="✕" onClick={onClose} width={0.5} height={0.45} fontSize={40} color="#6b4c2a" position={[1.05, -0.7, 0.08]} billboard={false} />
    </Panel3D>
  );
}
