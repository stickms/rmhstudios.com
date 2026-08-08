import { appendFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { createSimulation } from '@/lib/bums-rush/engine';
import { DEFAULT_ASSISTS, DEFAULT_COSMETICS, PHYSICS } from '@/lib/bums-rush/constants';
import type { GeometryPiece, InputFrame, Level, SeatIndex, Vec2 } from '@/lib/bums-rush/types';

function level(over: Partial<Level>): Level {
  return {
    version: 1, id: 'probe', world: 1, index: 1, name: 'probe', minPlayers: 1, maxPlayers: 4,
    parSeconds: 60, bounds: { x: -8000, y: -8000, w: 20000, h: 20000 },
    palette: { paper: '#fff', ink: '#000', accent: '#f00', flashSafe: true, contrastRatio: 12 },
    spawn: [{ x: 0, y: 0 }],
    goal: { shape: { kind: 'rect', x: 99999, y: 99999, w: 10, h: 10 }, requires: 'any' },
    checkpoints: [], geometry: [], props: [], hazards: [], objectives: [], decorations: [],
    assistBeams: [], music: 'none', ...over,
  };
}
const HAND_DY = PHYSICS.SHOULDER_OFFSET_Y + PHYSICS.ARM_SEG_LENGTH * PHYSICS.ARM_SEGMENTS;
const SHOULDER = PHYSICS.SHOULDER_OFFSET_X;
function post(at: Vec2): GeometryPiece {
  return {
    shape: { kind: 'circle', x: at.x - SHOULDER - 16, y: at.y + HAND_DY, r: 6 },
    material: 'paper', render: 'drawn', grabbable: true,
  };
}
const f = (seat: SeatIndex, fr: number, aimL: Vec2, aimR: Vec2, gl: number, gr: number): InputFrame =>
  ({ seat, frame: fr, aimL, aimR, gripL: gl, gripR: gr, buttons: 0 });
const log = (m: string) => appendFileSync('/tmp/probe.log', m + '\n');

describe('probe', () => {
  it('chain loads', () => {
    writeFileSync('/tmp/probe.log', '');
    for (const n of [1, 2, 3, 4]) {
      const spawn: Vec2[] = [];
      for (let i = 0; i < n; i++) spawn.push({ x: i * SHOULDER * 2, y: 0 });
      const lv = level({ spawn, geometry: [post(spawn[0])] });
      const sim = createSimulation(lv, {
        seats: spawn.map((_, i) => ({ seat: i as SeatIndex, cosmetics: DEFAULT_COSMETICS, assists: DEFAULT_ASSISTS })),
      });
      let mn = Infinity, mx = 0, sum = 0, cnt = 0, lost = 0;
      for (let step = 0; step < 1500; step++) {
        const inputs: InputFrame[] = [];
        for (let i = 0; i < n; i++) {
          inputs.push(f(i as SeatIndex, step + 1, { x: 0, y: -1 }, { x: 0, y: 1 }, 1, 0));
        }
        sim.step(inputs);
        if (step > 1300) {
          const s = sim.render(1).seats[0];
          if (!s.gripL) lost++;
          mn = Math.min(mn, s.tensionL); mx = Math.max(mx, s.tensionL); sum += s.tensionL; cnt++;
        }
      }
      const r = sim.render(1);
      log(`n=${n} topLoad min=${mn.toFixed(5)} mean=${(sum / cnt).toFixed(5)} max=${mx.toFixed(5)} lost=${lost} grips=${r.seats.map((s) => (s.gripL ? 'L' : '-')).join('')} y=${r.seats.map((s) => s.head.y.toFixed(0)).join(',')}`);
    }
  });
});
