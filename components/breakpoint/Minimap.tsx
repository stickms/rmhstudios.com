'use client';

import { useEffect, useRef } from 'react';
import type { MatchSnapshot } from '@/lib/breakpoint/types';
import { MAP_BOXES, ARENA, SITES } from '@/lib/breakpoint/map';
import { PALETTE } from '@/lib/breakpoint/constants';

const SIZE = 168;

/** Top-down north-up radar: walls, sites, allies, revealed enemies, spike. */
export function Minimap({ snap }: { snap: MatchSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const span = ARENA.maxX - ARENA.minX;
    const toX = (x: number) => ((x - ARENA.minX) / span) * SIZE;
    const toY = (z: number) => ((z - ARENA.minZ) / span) * SIZE;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // sites
    for (const s of Object.values(SITES)) {
      ctx.fillStyle = 'rgba(255,70,85,0.16)';
      ctx.beginPath();
      ctx.arc(toX(s.x), toY(s.z), (s.r / span) * SIZE, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4655';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(s.label, toX(s.x) - 3, toY(s.z) + 4);
    }

    // walls / cover
    ctx.fillStyle = 'rgba(150,160,180,0.45)';
    for (const b of MAP_BOXES) {
      if (!b.solid) continue;
      const w = (b.hx * 2 / span) * SIZE;
      const h = (b.hz * 2 / span) * SIZE;
      ctx.fillRect(toX(b.cx) - w / 2, toY(b.cz) - h / 2, Math.max(1, w), Math.max(1, h));
    }

    const local = snap.actors.find((a) => a.isLocal);

    // spike
    if (snap.spike.planted && snap.spike.pos) {
      const blink = Math.sin(snap.now * 0.012) > 0;
      ctx.fillStyle = blink ? '#ff2222' : '#882222';
      ctx.fillRect(toX(snap.spike.pos.x) - 3, toY(snap.spike.pos.z) - 3, 6, 6);
    }

    // actors
    for (const a of snap.actors) {
      if (!a.alive) continue;
      const isAlly = local && a.team === local.team;
      const isZombie = a.team === 'zombies';
      if (!isAlly && !isZombie && a.revealedUntil <= snap.now) continue; // enemies only when revealed
      const px = toX(a.pos.x), py = toY(a.pos.z);
      ctx.fillStyle = isZombie ? '#7fae3a' : a.team === 'attackers' ? '#ff4655' : '#3b6fe0';
      if (a.isLocal) {
        // arrow pointing in yaw direction
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a.yaw);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
        if (!isAlly && !isZombie) { // revealed enemy ring
          ctx.strokeStyle = '#ffd35a'; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = PALETTE.groundLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
  }, [snap]);

  return <canvas ref={ref} width={SIZE} height={SIZE} className="bp-minimap" />;
}
