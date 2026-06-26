"use client";
import { useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { useCookgameStore } from '@/lib/cookgame/store';
import { TownScene, STATION_POSITIONS, BUYER_POSITIONS, PLOT_POSITIONS, DRYING_POSITION, CHEM_POSITION } from './world/TownScene';
import { PlayerController } from './world/PlayerController';
import { Interactable } from './world/Interactable';
import { InteractionPrompt } from './world/InteractionPrompt';
import { BuyerNPC } from './npc/BuyerNPC';
import { SellOverlay } from './npc/SellOverlay';
import { SupplierShopOverlay } from './stations/SupplierShopOverlay';
import { MixingStationOverlay } from './stations/MixingStationOverlay';
import { PackagingOverlay } from './stations/PackagingOverlay';
import { GrowPlotOverlay } from './stations/GrowPlotOverlay';
import { DryingRackOverlay } from './stations/DryingRackOverlay';
import { ChemistryStationOverlay } from './stations/ChemistryStationOverlay';
import { HUD } from './ui/HUD';
import { RecipeJournal } from './ui/RecipeJournal';
import { MenuOverlay } from './ui/MenuOverlay';

// Drives heat decay each frame (lives inside <Canvas> for useFrame access).
function HeatTicker() {
  useFrame((_, delta) => useCookgameStore.getState().tickHeat(delta));
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
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 12, 6]} intensity={1.2} castShadow />
        <Physics>
          <TownScene />
          <PlayerController />
          <HeatTicker />

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

          {/* buyer NPCs */}
          <BuyerNPC buyerId="doug" position={BUYER_POSITIONS.doug} />
          <BuyerNPC buyerId="kim" position={BUYER_POSITIONS.kim} />
          <BuyerNPC buyerId="pablo" position={BUYER_POSITIONS.pablo} />
        </Physics>
      </Canvas>

      {/* DOM overlays (outside the canvas) */}
      <HUD />
      <InteractionPrompt />
      <SupplierShopOverlay />
      <MixingStationOverlay />
      <PackagingOverlay />
      <SellOverlay />
      <GrowPlotOverlay />
      <DryingRackOverlay />
      <ChemistryStationOverlay />
      <RecipeJournal />
      <MenuOverlay />
    </div>
  );
}
