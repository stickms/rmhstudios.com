'use client';

import { useEffect, useState } from 'react';
import { Hud, PerspectiveCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { saveToServer } from '@/lib/temple-of-joy/persistence';
import { fmt } from '@/lib/temple-of-joy/numbers';
import type { GameState } from '@/lib/temple-of-joy/types';
import { Button3D } from './ui3d/Button3D';
import { Label3D } from './ui3d/Label3D';
import { CodexPanel3D } from './CodexPanel3D';

type Tab = GameState['activeTab'];

const TAB_DEFS: { id: Tab; label: string }[] = [
  { id: 'temple', label: '🛕 Temple' },
  { id: 'sources', label: '🌿 Sources' },
  { id: 'upgrades', label: '⬆ Upgrades' },
  { id: 'relics', label: '💍 Relics' },
  { id: 'wheel', label: '🔄 Wheel' },
  { id: 'ascension', label: '☀ Ascension' },
  { id: 'objectives', label: '🎯 Goals' },
  { id: 'achievements', label: '🏆 Trophies' },
  { id: 'settings', label: '⚙ Settings' },
];

/** Light interval poll of store values (avoids per-frame React renders). */
function useSnap<T>(read: (s: ReturnType<typeof useTempleStore.getState>) => T, ms = 200): T {
  const [v, setV] = useState(() => read(useTempleStore.getState()));
  useEffect(() => {
    const id = window.setInterval(() => setV(read(useTempleStore.getState())), ms);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return v;
}

function HudReadout({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const fmtMode = useTempleStore((s) => s.numberFormat);
  const snap = useSnap((s) => ({ happiness: s.happiness, hps: s.getHPS(), radiance: s.radiance, lifeRad: s.lifetimeRadiance }), 200);
  const top = h / 2;
  return (
    <group position={[0, top - 0.55, 0]}>
      <Label3D text={fmt(snap.happiness, fmtMode)} height={Math.min(0.7, w * 0.06)} options={{ color: '#f0c84a', fontSize: 96 }} position={[0, 0, 0]} />
      <Label3D text={`${fmt(snap.hps, fmtMode)} ${t('happiness-per-sec', { defaultValue: 'happiness/sec' })}`} height={0.26} options={{ color: '#e8d5b0', fontSize: 44 }} position={[0, -0.55, 0]} />
      {snap.lifeRad > 0 && (
        <Label3D text={`☀ ${fmt(snap.radiance, fmtMode)} ${t('radiance', { defaultValue: 'Radiance' })}`} height={0.26} options={{ color: '#ffd27a', fontSize: 44 }} position={[0, -0.9, 0]} />
      )}
    </group>
  );
}

function Controls({ h }: { h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const snap = useSnap((s) => ({
    pilgrimageActive: s.pilgrimageActive,
    pilgrimageTimer: s.pilgrimageTimer,
    pilgrimageCooldown: s.pilgrimageCooldown,
    ritualCooldown: s.ritualCooldown,
  }), 250);
  const bottom = -h / 2;
  const onCd = snap.pilgrimageCooldown > 0;

  return (
    <group position={[0, bottom + 1.55, 0]}>
      {(snap.pilgrimageActive || snap.ritualCooldown > 0) && (
        <Label3D
          text={snap.pilgrimageActive
            ? `🕯 ${t('pilgrimage-label', { defaultValue: 'PILGRIMAGE' })} · ${Math.ceil(snap.pilgrimageTimer)}s`
            : `✨ ${t('ritual-label', { defaultValue: 'RITUAL!' })} · ${Math.ceil(snap.ritualCooldown)}s`}
          height={0.24}
          options={{ color: '#ffd27a', fontSize: 40 }}
          position={[0, 0.5, 0]}
        />
      )}
      {!snap.pilgrimageActive && (
        <Button3D
          label={onCd
            ? `${t('pilgrimage-cooldown-short', { defaultValue: 'Pilgrimage' })} ${Math.ceil(snap.pilgrimageCooldown)}s`
            : `🕯 ${t('make-pilgrimage-short', { defaultValue: 'Pilgrimage' })}`}
          onClick={() => useTempleStore.getState().triggerPilgrimage()}
          enabled={!onCd}
          pulse={!onCd}
          width={2.4}
          height={0.5}
          fontSize={40}
        />
      )}
    </group>
  );
}

function TabBar({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const active = useSnap((s) => s.activeTab, 150);

  // Responsive grid: fit as many per row as the width allows.
  const perRow = Math.max(3, Math.min(TAB_DEFS.length, Math.floor(w / 1.45)));
  const rows = Math.ceil(TAB_DEFS.length / perRow);
  const btnW = Math.min(1.75, (w * 0.97) / perRow);
  const btnH = 0.42;
  const gapY = 0.12;
  const bottom = -h / 2;

  return (
    <group position={[0, bottom + 0.45, 0]}>
      {TAB_DEFS.map((tab, i) => {
        const row = Math.floor(i / perRow);
        const inRow = Math.min(perRow, TAB_DEFS.length - row * perRow);
        const col = i % perRow;
        const x = (col - (inRow - 1) / 2) * btnW;
        const y = (rows - 1 - row) * (btnH + gapY);
        const isActive = active === tab.id;
        return (
          <Button3D
            key={tab.id}
            label={t(`tab-${tab.id}`, { defaultValue: tab.label })}
            onClick={() => useTempleStore.getState().setActiveTab(isActive && tab.id !== 'temple' ? 'temple' : tab.id)}
            width={btnW * 0.94}
            height={btnH}
            fontSize={34}
            color={isActive ? '#f0c84a' : '#8b6914'}
            pulse={isActive}
            position={[x, y, 0]}
          />
        );
      })}
    </group>
  );
}

function BackButton({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const back = () => {
    saveToServer(useTempleStore.getState()).catch(() => {}).finally(() => { window.location.href = '/builds'; });
  };
  return (
    <Button3D
      label={t('back-to-builds', { defaultValue: '← Builds' })}
      onClick={back}
      width={1.5}
      height={0.4}
      fontSize={34}
      color="#8b6914"
      position={[-w / 2 + 0.95, h / 2 - 0.35, 0]}
    />
  );
}

function Layout() {
  const { viewport } = useThree();
  const w = viewport.width;
  const h = viewport.height;
  const active = useSnap((s) => s.activeTab, 150);
  return (
    <>
      <BackButton w={w} h={h} />
      <HudReadout w={w} h={h} />
      <Controls h={h} />
      <TabBar w={w} h={h} />
      {active !== 'temple' && <CodexPanel3D tab={active} w={w} h={h} />}
    </>
  );
}

/**
 * All persistent UI chrome — happiness read-out, pilgrimage/ritual controls and
 * the tab navigation — rendered as real, animated 3D meshes in a screen-anchored
 * HUD layer (drei <Hud>) that draws on top of the world and stays put while the
 * camera orbits.
 */
export function Chrome3D() {
  return (
    <Hud renderPriority={2}>
      <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={50} />
      <ambientLight intensity={1.2} />
      <pointLight position={[3, 4, 8]} intensity={40} color="#ffe6b0" decay={2} />
      <pointLight position={[-4, -2, 6]} intensity={20} color="#9bbcff" decay={2} />
      <Layout />
    </Hud>
  );
}
