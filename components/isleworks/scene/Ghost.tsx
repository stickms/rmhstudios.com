'use client';

/**
 * Isleworks — the placement preview.
 *
 * Three things at once, and each answers a different question the player is
 * holding in their head while they hover:
 *
 *  - the **footprint tiles**, green or red, answer *will it fit*
 *  - the **translucent model**, at the rotation you will get, answers *which way
 *    is it facing*
 *  - the **effect ring**, at the definition's own radius, answers *what will it
 *    reach* — which is the only way a player can learn what "radius 6" means
 *    before spending the money
 *
 * Rendered as ordinary meshes rather than instances: there is exactly one ghost,
 * and it changes every time the pointer moves a tile.
 */

import { useMemo } from 'react';

import { checkPlacement, footprintTiles, tileToWorld } from '@/lib/isleworks/grid';
import { buildingModel } from '@/lib/isleworks/models';
import type { BuildingDefinition, CityState } from '@/lib/isleworks/types';

import { GEOMETRY } from './geometry';
import { tileTop } from './Terrain';

const OK = '#5ecfa2';
const BAD = '#ef7370';

interface GhostProps {
  city: CityState;
  definition: BuildingDefinition;
  rotation: number;
  tile: { x: number; y: number };
}

export function Ghost({ city, definition, rotation, tile }: GhostProps) {
  const check = useMemo(
    () =>
      checkPlacement(definition, tile.x, tile.y, rotation, {
        tiles: city.tiles,
        width: city.width,
        height: city.height,
        money: city.money,
        placedUnique: new Set(city.buildings.map((b) => b.definitionId)),
      }),
    [city, definition, rotation, tile.x, tile.y],
  );

  const tiles = useMemo(
    () => footprintTiles(tile.x, tile.y, definition.footprint, rotation),
    [tile.x, tile.y, definition.footprint, rotation],
  );

  const model = useMemo(() => buildingModel(definition.modelId, 1, 0), [definition.modelId]);

  const anchor = city.tiles[tile.y * city.width + tile.x];
  const baseY = anchor ? tileTop(anchor) : 0;
  const [ax, az] = tileToWorld(tile.x, tile.y, city.width, city.height);
  const fw = rotation % 2 === 0 ? definition.footprint.width : definition.footprint.height;
  const fd = rotation % 2 === 0 ? definition.footprint.height : definition.footprint.width;
  const cx = ax + (fw - 1) / 2;
  const cz = az + (fd - 1) / 2;
  const tint = check.ok ? OK : BAD;

  return (
    <group>
      {tiles.map((t) => {
        const inside = t.x >= 0 && t.y >= 0 && t.x < city.width && t.y < city.height;
        const cell = inside ? city.tiles[t.y * city.width + t.x] : undefined;
        const [wx, wz] = tileToWorld(t.x, t.y, city.width, city.height);
        return (
          <mesh
            key={`${t.x},${t.y}`}
            position={[wx, (cell ? tileTop(cell) : 0) + 0.035, wz]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => null}
          >
            <planeGeometry args={[0.94, 0.94]} />
            <meshBasicMaterial
              color={tint}
              transparent
              opacity={0.5}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        );
      })}

      <group position={[cx, baseY, cz]} rotation={[0, (rotation * Math.PI) / 2, 0]}>
        {model.parts.map((part, i) => (
          <mesh
            key={i}
            geometry={GEOMETRY[part.shape]}
            position={part.p}
            // `spin` parts (turbine blades) carry their angle separately from
            // `r`, so the preview has to fold it in or all three blades stack.
            rotation={[part.r?.[0] ?? 0, part.r?.[1] ?? 0, (part.r?.[2] ?? 0) + (part.spin ?? 0)]}
            scale={part.s}
            raycast={() => null}
          >
            <meshBasicMaterial
              color={tint}
              transparent
              opacity={0.34}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {definition.effectRadius ? (
        <mesh
          position={[cx, baseY + 0.04, cz]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <ringGeometry
            args={[definition.effectRadius + 0.35, definition.effectRadius + 0.5, 56]}
          />
          <meshBasicMaterial
            color={tint}
            transparent
            opacity={0.35}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

/**
 * The bulldoze cursor — a red pad over whatever the pointer is on.
 *
 * Separate from `Ghost` because demolition previews a *tile*, not a building:
 * showing the model that is about to disappear reads as "place this here".
 */
export function DemolishCursor({
  city,
  tile,
}: {
  city: CityState;
  tile: { x: number; y: number };
}) {
  const cell = city.tiles[tile.y * city.width + tile.x];
  if (!cell) return null;
  const [wx, wz] = tileToWorld(tile.x, tile.y, city.width, city.height);
  return (
    <mesh
      position={[wx, tileTop(cell) + 0.04, wz]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
    >
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial
        color={BAD}
        transparent
        opacity={0.55}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
