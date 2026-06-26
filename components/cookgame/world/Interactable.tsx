"use client";
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useCookgameStore } from '@/lib/cookgame/store';

export function Interactable({
  id,
  position,
  radius = 2.5,
}: {
  id: string;
  label?: string;
  position: [number, number, number];
  radius?: number;
}) {
  const isNear = useRef(false);

  useFrame(() => {
    const p = useCookgameStore.getState().playerPosition;
    const dx = p[0] - position[0];
    const dz = p[2] - position[2];
    const near = Math.hypot(dx, dz) <= radius;
    if (near !== isNear.current) {
      isNear.current = near;
      const cur = useCookgameStore.getState().nearbyInteractable;
      if (near) useCookgameStore.getState().setNearbyInteractable(id);
      else if (cur === id) useCookgameStore.getState().setNearbyInteractable(null);
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'e') return;
      const s = useCookgameStore.getState();
      if (s.nearbyInteractable === id && !s.activeOverlay) s.setActiveOverlay(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  return null; // proximity-only marker; visual handled by the station/NPC mesh
}
