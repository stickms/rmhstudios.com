"use client";
import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { useCookgameStore } from '@/lib/cookgame/store';
import { TownScene, STATION_POSITIONS, BUYER_POSITIONS, PLOT_POSITIONS, DRYING_POSITION, CHEM_POSITION, PROPERTY_POSITION, HARDWARE_POSITION, AFTERHOURS_POSITION, MARCUS_POSITION, VERA_POSITION, SILAS_POSITION } from './world/TownScene';
import { PlayerController } from './world/PlayerController';
import { Interactable } from './world/Interactable';
import { InteractionPrompt } from './world/InteractionPrompt';
import { BuyerNPC } from './npc/BuyerNPC';
import { SellOverlay } from './npc/SellOverlay';
import { ShopOverlay } from './stations/ShopOverlay';
import { MixingStationOverlay } from './stations/MixingStationOverlay';
import { PackagingOverlay } from './stations/PackagingOverlay';
import { GrowPlotOverlay } from './stations/GrowPlotOverlay';
import { DryingRackOverlay } from './stations/DryingRackOverlay';
import { ChemistryStationOverlay } from './stations/ChemistryStationOverlay';
import { PropertyOverlay } from './stations/PropertyOverlay';
import { HUD } from './ui/HUD';
import { RecipeJournal } from './ui/RecipeJournal';
import { MenuOverlay } from './ui/MenuOverlay';
import { DistrictMap } from './ui/DistrictMap';
import Lighting from './models/Lighting';

// Throttled district detector — reads playerPosition every 10 frames and calls setCurrentDistrict
// only when the district changes, to avoid per-frame store writes.
function RegionDetector() {
  const frameRef = useRef(0);
  useFrame(() => {
    frameRef.current = (frameRef.current + 1) % 10;
    if (frameRef.current !== 0) return;
    const state = useCookgameStore.getState();
    const [x, , z] = state.playerPosition;
    let next = 'suburbs';
    if (x >= -16 && x <= 16 && z >= -58 && z <= -22) next = 'downtown';
    else if (x >= -58 && x <= -22 && z >= -16 && z <= 16) next = 'docks';
    else if (x >= -14 && x <= 14 && z >= -94 && z <= -60) next = 'warehouse';
    if (next !== state.currentDistrict) state.setCurrentDistrict(next);
  });
  return null;
}

// Drives heat decay, passive income, and the day clock each frame
// (lives inside <Canvas> for useFrame access).
function WorldTicker() {
  useFrame((_, delta) => {
    const s = useCookgameStore.getState();
    s.tickHeat(delta);
    s.tickPassiveIncome(delta);
    s.tickClock(delta * 1000); // delta is seconds; clock is ms
  });
  return null;
}

export function CookGameGame() {
  // Load saved game (or start fresh) once on mount.
  useEffect(() => {
    useCookgameStore.getState().loadOrNew();
  }, []);

  // Debounced autosave on state changes + save on tab close.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = useCookgameStore.subscribe(() => {
      if (t) return;
      t = setTimeout(() => {
        useCookgameStore.getState().saveNow();
        t = null;
      }, 3000);
    });
    const onUnload = () => useCookgameStore.getState().saveNow();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      unsub();
      if (t) clearTimeout(t);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <Canvas shadows camera={{ position: [0, 7, 17], fov: 55 }} className="w-full h-full">
        <Lighting />
        <Physics>
          <TownScene />
          <PlayerController />
          <WorldTicker />
          <RegionDetector />

          {/* station interactables */}
          <Interactable id="supplier" position={STATION_POSITIONS.supplier} />
          <Interactable id="mixing" position={STATION_POSITIONS.mixing} />
          <Interactable id="packaging" position={STATION_POSITIONS.packaging} />

          {/* grow plot interactables */}
          {PLOT_POSITIONS.map((pos, i) => (
            <Interactable key={`plot:${i}`} id={`plot:${i}`} position={pos} />
          ))}
          <Interactable id="drying" position={DRYING_POSITION} />
          <Interactable id="chem" position={CHEM_POSITION} />
          <Interactable id="property" position={PROPERTY_POSITION} />

          {/* buyer NPCs — suburbs */}
          <BuyerNPC buyerId="doug" position={BUYER_POSITIONS.doug} />
          <BuyerNPC buyerId="kim" position={BUYER_POSITIONS.kim} />
          <BuyerNPC buyerId="pablo" position={BUYER_POSITIONS.pablo} />

          {/* district shop interactables */}
          <Interactable id="hardware" position={HARDWARE_POSITION} />
          <Interactable id="afterhours" position={AFTERHOURS_POSITION} />

          {/* district buyer NPCs */}
          <BuyerNPC buyerId="marcus" position={MARCUS_POSITION} />
          <BuyerNPC buyerId="vera" position={VERA_POSITION} />
          <BuyerNPC buyerId="silas" position={SILAS_POSITION} />
        </Physics>
      </Canvas>

      {/* DOM overlays (outside the canvas) */}
      <HUD />
      <InteractionPrompt />
      <ShopOverlay />
      <MixingStationOverlay />
      <PackagingOverlay />
      <SellOverlay />
      <GrowPlotOverlay />
      <DryingRackOverlay />
      <ChemistryStationOverlay />
      <PropertyOverlay />
      <RecipeJournal />
      <MenuOverlay />
      <DistrictMap />
    </div>
  );
}
