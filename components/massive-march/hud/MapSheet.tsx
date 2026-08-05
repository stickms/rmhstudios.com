/**
 * Massive March — the paper map.
 *
 * There is no minimap and no always-available navigation screen (§9.2). This
 * sheet opens only when somebody in the group is carrying an actual map object,
 * it shows only what the group has already walked past, and there is no marker
 * for where you are standing — because a paper map does not know that.
 *
 * The coastline is traced from the same `shoreAt` the terrain is built from, so
 * the map is a drawing of the real island rather than an illustration that will
 * drift away from it the first time the land is retuned.
 */

'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LAND, TOY } from '@/lib/massive-march/palette';
import type { PuzzleStatus, TowerStatus } from '@/lib/massive-march/net/events';
import { none, useMmStore } from '@/lib/massive-march/store';
import { LANDMARKS, REGIONS } from '@/lib/massive-march/world/regions';
import { PUZZLE_SITES, TOWERS } from '@/lib/massive-march/world/sites';
import { shoreAt, WORLD_EXTENT } from '@/lib/massive-march/world/terrain';
import { BOARD, INK, Panel } from '../ui';

const VIEW = 900;

/** World metres → sheet units, with north at the top. */
function project(x: number, z: number): [number, number] {
  const scale = VIEW / (WORLD_EXTENT * 1.55);
  return [VIEW / 2 + x * scale, VIEW / 2 + z * scale];
}

export function MapSheet({ hasMap }: { hasMap: boolean }) {
  const { t } = useTranslation('c-massive-march');
  const discovered = useMmStore((s) => s.world?.discovered ?? none<string>());
  const puzzles = useMmStore((s) => s.world?.puzzles ?? none<PuzzleStatus>());
  const towers = useMmStore((s) => s.world?.towers ?? none<TowerStatus>());

  const coast = useMemo(() => {
    const points: string[] = [];
    for (let i = 0; i <= 180; i++) {
      const theta = (i / 180) * Math.PI * 2;
      const radius = shoreAt(theta);
      const [px, py] = project(Math.cos(theta) * radius, Math.sin(theta) * radius);
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return points.join(' ');
  }, []);

  if (!hasMap) {
    return (
      <Panel className="w-[min(24rem,86vw)] space-y-2">
        <h2 className="text-lg font-black">{t('no-map-title', { defaultValue: 'No map' })}</h2>
        <p className="text-sm leading-relaxed opacity-80">
          {t('no-map-body', {
            defaultValue:
              'Somebody left one at the landing and there is another at the north halt. Until one of you is carrying it, you navigate by looking at things.',
          })}
        </p>
      </Panel>
    );
  }

  const solved = new Set(puzzles.filter((p) => p.state === 'solved' || p.state === 'skipped').map((p) => p.id));

  return (
    <Panel className="w-[min(38rem,92vw)] space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-black tracking-tight">
          {t('map-title', { defaultValue: 'The island' })}
        </h2>
        <p className="text-[11px] font-bold tracking-[0.14em] uppercase opacity-60">
          {t('map-note', { defaultValue: 'Only what you have found' })}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="w-full"
        style={{ background: LAND.waterShallow, borderRadius: 3, border: `3px solid ${INK}` }}
        role="img"
        aria-label={t('map-alt', { defaultValue: 'A hand-drawn map of the island' })}
      >
        <polygon points={coast} fill={LAND.sandDry} stroke={INK} strokeWidth={4} />

        {/* Region names, printed the way a paper map prints them. */}
        {REGIONS.map((region) => {
          const [x, y] = project(region.x, region.z);
          return (
            <text
              key={region.id}
              x={x}
              y={y}
              textAnchor="middle"
              fill={INK}
              opacity={0.42}
              fontSize={19}
              fontWeight={800}
              letterSpacing={2}
            >
              {region.name.toUpperCase()}
            </text>
          );
        })}

        {/* Towers are printed on the map from the start — they are visible from
            half the island, so pretending they are secret would be a lie. */}
        {TOWERS.map((tower) => {
          const [x, y] = project(tower.x, tower.z);
          const status = towers.find((entry) => entry.id === tower.id);
          const fill =
            tower.id === 'yellow'
              ? TOY.yellow
              : tower.id === 'blue'
                ? TOY.blue
                : tower.id === 'red'
                  ? TOY.red
                  : TOY.white;
          return (
            <g key={tower.id}>
              <rect
                x={x - 11}
                y={y - 11}
                width={22}
                height={22}
                fill={fill}
                stroke={INK}
                strokeWidth={4}
              />
              {status?.satisfied ? (
                <circle cx={x} cy={y} r={4.5} fill={INK} />
              ) : null}
              <text x={x} y={y + 30} textAnchor="middle" fill={INK} fontSize={15} fontWeight={800}>
                {status ? `${status.deposited}/${status.threshold}` : ''}
              </text>
            </g>
          );
        })}

        {/* Landmarks the group has walked past. */}
        {LANDMARKS.map((landmark) => {
          const [x, y] = project(landmark.x, landmark.z);
          return (
            <g key={landmark.id}>
              <circle cx={x} cy={y} r={5} fill={landmark.color} stroke={INK} strokeWidth={2.5} />
            </g>
          );
        })}

        {/* Puzzle sites, only once somebody has stood at one. */}
        {PUZZLE_SITES.filter((site) => discovered.includes(site.id)).map((site) => {
          const [x, y] = project(site.x, site.z);
          return (
            <g key={site.id}>
              <circle
                cx={x}
                cy={y}
                r={9}
                fill={solved.has(site.id) ? TOY.green : BOARD}
                stroke={INK}
                strokeWidth={3.5}
              />
              <text
                x={x}
                y={y - 15}
                textAnchor="middle"
                fill={INK}
                fontSize={16}
                fontWeight={800}
              >
                {site.name}
              </text>
            </g>
          );
        })}

        {/* A compass rose, because every paper map has one. */}
        <g transform={`translate(${VIEW - 76} 76)`}>
          <circle r={34} fill={BOARD} stroke={INK} strokeWidth={3.5} />
          <path d="M0,-26 L7,0 L0,26 L-7,0 Z" fill={INK} />
          <text y={-36} textAnchor="middle" fill={INK} fontSize={19} fontWeight={900}>
            N
          </text>
        </g>
      </svg>

      <p className="text-xs leading-snug opacity-70">
        {t('map-footer', {
          defaultValue:
            'It does not show where you are. Work that out from what you can see, and say it out loud.',
        })}
      </p>
    </Panel>
  );
}
