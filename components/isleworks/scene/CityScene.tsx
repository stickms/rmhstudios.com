'use client';

/**
 * Isleworks — the scene root.
 *
 * Owns the `<Canvas>`, the render-quality tier, and the wiring between pointer
 * events in 3D and actions in the store. Everything below it is a layer that
 * draws one thing.
 *
 * ## Where the game loop lives
 *
 * In `GameClock`, inside the canvas, on `useFrame`. A city builder's clock has
 * to advance smoothly and pause when the tab is hidden, which is exactly what
 * the render loop already does — a parallel `setInterval` would drift against
 * the animation it drives and keep running in a background tab.
 *
 * ## Pointer flow
 *
 * The layers report *what is under the pointer* into a ref (`aim`); the camera
 * rig decides *whether that was a click or a drag*; the store decides *what the
 * armed tool does about it*. Keeping those three apart is what lets left-drag
 * paint roads without also panning the camera, and lets a tap on a tower select
 * the tower rather than the tile behind it.
 */

import { useCallback, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

import { purchasableParcels } from '@/lib/isleworks/city';
import { getDefinition } from '@/lib/isleworks/catalog';
import { index } from '@/lib/isleworks/grid';
import {
  MONTH_SECONDS,
  SPEED_MULTIPLIER,
  useIsleworks,
  useIsleworksClock,
} from '@/lib/isleworks/store';
import { useRenderQuality } from '@/lib/render/useRenderQuality';
import { useReducedMotion } from '@/hooks/useReducedMotion';

import { Atmosphere } from './Atmosphere';
import { Buildings } from './Buildings';
import { CameraRig, type RigHandle } from './CameraRig';
import { daylightFor, world } from './clock';
import { DemolishCursor, Ghost } from './Ghost';
import { ParcelOverlay, Terrain } from './Terrain';
import { Roads } from './Roads';
import { Smoke } from './Smoke';

/** What the pointer is currently over. Written by the layers, read on click. */
interface Aim {
  tile: { x: number; y: number } | null;
  buildingId: string | null;
}

export function CityScene({ rigRef }: { rigRef: React.MutableRefObject<RigHandle | null> }) {
  const quality = useRenderQuality('auto');
  const reducedMotion = useReducedMotion();

  const city = useIsleworks((s) => s.city);
  const tool = useIsleworks((s) => s.tool);
  const overlay = useIsleworks((s) => s.overlay);
  const hover = useIsleworks((s) => s.hover);
  const selectedId = useIsleworks((s) => s.selectedId);
  const freshIds = useIsleworks((s) => s.freshIds);
  const setHover = useIsleworks((s) => s.setHover);

  const aim = useRef<Aim>({ tile: null, buildingId: null });
  const paintingRef = useRef(false);
  const lastPainted = useRef<string>('');

  /** Run the armed tool against a tile. The single place a tool "does" anything. */
  const applyAt = useCallback((x: number, y: number) => {
    const store = useIsleworks.getState();
    switch (store.tool.kind) {
      case 'place':
        store.placeAt(x, y);
        break;
      case 'bulldoze':
        store.bulldozeAt(x, y);
        break;
      case 'buy-land':
        store.buyParcelAt(x, y);
        break;
      default: {
        const tile = store.city.tiles[index(x, y, store.city.width)];
        store.select(tile?.buildingId ?? null);
      }
    }
  }, []);

  const onHoverTile = useCallback(
    (x: number, y: number) => {
      aim.current = { tile: { x, y }, buildingId: null };
      const current = useIsleworks.getState().hover;
      if (current?.x !== x || current?.y !== y) setHover({ x, y });
      const key = `${x},${y}`;
      if (paintingRef.current && lastPainted.current !== key) {
        lastPainted.current = key;
        applyAt(x, y);
      }
    },
    [applyAt, setHover],
  );

  const onHoverBuilding = useCallback(
    (instanceId: string | null) => {
      aim.current.buildingId = instanceId;
      if (!instanceId) return;
      const store = useIsleworks.getState();
      const building = store.city.buildings.find((b) => b.instanceId === instanceId);
      if (building) onHoverTile(building.gridX, building.gridY);
    },
    [onHoverTile],
  );

  const onClick = useCallback(() => {
    const target = aim.current.tile;
    if (!target) return;
    applyAt(target.x, target.y);
  }, [applyAt]);

  const onPaintStart = useCallback(() => {
    paintingRef.current = true;
    lastPainted.current = '';
    const target = aim.current.tile;
    if (target) {
      lastPainted.current = `${target.x},${target.y}`;
      applyAt(target.x, target.y);
    }
  }, [applyAt]);

  const onPaintEnd = useCallback(() => {
    paintingRef.current = false;
  }, []);

  const onLeave = useCallback(() => {
    aim.current = { tile: null, buildingId: null };
    setHover(null);
  }, [setHover]);

  const radius = Math.max(city.width, city.height) / 2;
  const parcels = useMemo(
    () => (tool.kind === 'buy-land' ? purchasableParcels(city) : []),
    [tool.kind, city],
  );

  const toolArmed = tool.kind !== 'none';

  return (
    <Canvas
      orthographic
      shadows={quality.quality.shadows}
      dpr={quality.dpr}
      gl={{ antialias: quality.quality.antialias, powerPreference: 'high-performance' }}
      camera={{ position: [30, 30, 30], zoom: 46, near: -200, far: 400 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      onPointerMissed={onLeave}
    >
      {/* The sky colour is owned by <Atmosphere>, which drives it from the world
          clock; the wrapper's CSS background covers the single frame before it
          first runs. */}
      <GameClock />

      <CameraRig
        radius={radius}
        toolArmed={toolArmed}
        reducedMotion={reducedMotion}
        onClick={onClick}
        onPaintStart={onPaintStart}
        onPaintEnd={onPaintEnd}
        handleRef={rigRef}
      />

      <Atmosphere
        radius={radius}
        shadows={quality.quality.shadows}
        shadowMapSize={quality.quality.shadowMapSize}
        reducedMotion={reducedMotion}
      />

      <Terrain city={city} overlay={overlay} onHoverTile={onHoverTile} onLeave={onLeave} />

      <Roads city={city} population={city.stats.population} reducedMotion={reducedMotion} />

      <Buildings
        city={city}
        freshIds={freshIds}
        selectedId={selectedId}
        onPick={(id) => {
          aim.current.buildingId = id;
        }}
        onHoverBuilding={onHoverBuilding}
      />

      <Smoke city={city} reducedMotion={reducedMotion} />

      {tool.kind === 'buy-land' && <ParcelOverlay city={city} parcels={parcels} hover={hover} />}

      {tool.kind === 'place' && hover && (
        <Ghost
          city={city}
          definition={getDefinition(tool.definitionId)}
          rotation={tool.rotation}
          tile={hover}
        />
      )}

      {tool.kind === 'bulldoze' && hover && <DemolishCursor city={city} tile={hover} />}
    </Canvas>
  );
}

/**
 * The month clock.
 *
 * Advances `world` every frame and calls `advance()` on rollover. The progress
 * value is mirrored into its own tiny store at 10 Hz so the HUD's clock ring can
 * subscribe to it without every other panel re-rendering with it.
 */
function GameClock() {
  const lastPush = useRef(0);

  useFrame((_, delta) => {
    // `world.time` is real seconds and drives idle motion (sway, smoke, walkers)
    // even while the game is paused — a paused city should still breathe.
    world.time += delta;

    const store = useIsleworks.getState();
    const multiplier = SPEED_MULTIPLIER[store.speed];

    if (multiplier > 0) {
      world.monthProgress += (delta * multiplier) / MONTH_SECONDS;
      while (world.monthProgress >= 1) {
        world.monthProgress -= 1;
        store.advance();
      }
    }

    world.daylight = daylightFor(world.monthProgress);
    world.night = world.daylight < 0.4;

    lastPush.current += delta;
    if (lastPush.current > 0.1) {
      lastPush.current = 0;
      useIsleworksClock.getState().set(world.monthProgress);
    }
  });

  return null;
}
