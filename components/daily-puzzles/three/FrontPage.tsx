// components/daily-puzzles/three/FrontPage.tsx
'use client';

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button3D } from './ui3d/Button3D';
import { Label3D } from './ui3d/Label3D';
import { gridLayout } from '@/lib/daily-puzzles/desk-layout';
import { DESK_MODES } from '@/lib/daily-puzzles/desk-modes';
import { useDeskStore } from '@/lib/daily-puzzles/desk-store';
import { PAGE_W, PAGE_H } from './Newspaper';
import { hasCompleted } from '@/lib/daily-puzzles/persistence';
import { formatDateKey, getTodayEST } from '@/lib/daily-puzzles/seed';

// SP1 wires only Spectrum into the desk; others arrive in SP2–SP7.
const WIRED_MODES = new Set<string>(['spectrum']);

export function FrontPage({ onSelect }: { onSelect: (id: string) => void }) {
  const { t } = useTranslation('c-daily-puzzles');
  const navigate = useNavigate();
  const dateKey = formatDateKey(getTodayEST());

  const layout = useMemo(
    () => gridLayout(DESK_MODES.length, PAGE_W, { cellW: 2.3, cellH: 0.9, gapX: 0.3, gapY: 0.45, maxPerRow: 2 }),
    [],
  );

  // Headline above the clipping grid (printed on the page)
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Label3D
        text={t('todays-puzzles-headline', { defaultValue: "TODAY'S PUZZLES" })}
        height={0.32}
        billboard={false}
        options={{ color: '#1c1a16', fontSize: 60, bold: true }}
        position={[0, PAGE_H / 2 - 1.55, 0.02]}
      />
      <group position={[0, -0.4, 0.04]}>
        {DESK_MODES.map((m, i) => {
          const [x, y] = layout.positions[i];
          const done = hasCompleted(m.id, dateKey);
          const wired = WIRED_MODES.has(m.id);
          const label = wired
            ? `${m.emoji}  ${m.title}${done ? '  ✓' : ''}`
            : `${m.emoji}  ${m.title}  · soon`;
          return (
            <Button3D
              key={m.id}
              label={label}
              onClick={() => {
                useDeskStore.getState().setFocusedMode(m.id);
                onSelect(m.id);
                navigate({ to: `/daily/${m.id}` as string });
              }}
              billboard={false}
              width={layout.cellW}
              height={layout.cellH}
              fontSize={32}
              color={m.accent}
              enabled={wired}
              pulse={wired && !done}
              position={[x, y, 0]}
            />
          );
        })}
      </group>
    </group>
  );
}
