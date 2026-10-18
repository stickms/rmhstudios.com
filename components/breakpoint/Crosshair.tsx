'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_CROSSHAIR,
  getCrosshair,
  subscribeCrosshair,
  type CrosshairSettings,
} from '@/lib/breakpoint/crosshair';

/** The player's crosshair. `spread` is extra recoil gap in px; omit `settings` to use the saved ones. */
export function Crosshair({
  spread = 0,
  settings,
}: {
  spread?: number;
  settings?: CrosshairSettings;
}) {
  const saved = useSyncExternalStore(subscribeCrosshair, getCrosshair, () => DEFAULT_CROSSHAIR);
  const c = settings ?? saved;
  const gap = c.gap + spread;
  const bar = {
    position: 'absolute',
    background: `#${c.color}`,
    boxShadow: '0 0 1px #000',
  } as const;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 0,
        height: 0,
        opacity: c.opacity / 100,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          ...bar,
          width: c.thickness,
          height: c.length,
          left: -c.thickness / 2,
          bottom: gap,
        }}
      />
      <span
        style={{ ...bar, width: c.thickness, height: c.length, left: -c.thickness / 2, top: gap }}
      />
      <span
        style={{ ...bar, height: c.thickness, width: c.length, top: -c.thickness / 2, right: gap }}
      />
      <span
        style={{ ...bar, height: c.thickness, width: c.length, top: -c.thickness / 2, left: gap }}
      />
      {c.dot && (
        <span
          style={{
            ...bar,
            width: c.thickness,
            height: c.thickness,
            left: -c.thickness / 2,
            top: -c.thickness / 2,
          }}
        />
      )}
    </div>
  );
}
