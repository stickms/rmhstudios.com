/**
 * Project Vega's board renderer: a diagnostic monitor showing a specimen slide.
 *
 * Layers: a cached backdrop (lab-tile benches, the tissue corridor with its static ECG trace, fixtures, ruler
 * ticks, registration marks, static scanlines and the vignette) -> fading stains where specimens died ->
 * instruments -> specimens -> canisters -> effects -> the cursor and range previews -> a slow scan sweep.
 *
 * Motion rules: effects are responses to play and end within 360 ms except stains (a slow fade); the scan sweep
 * and the membrane wobble are the only ambient motion and both stop under `still` (Globe motion: Still). Nothing
 * flashes: a leak darkens the edge in 150 ms and fades over 600 ms, at most once a second.
 *
 * Assists (`assist-profile.ts`, read once per run by `setAssist`): calm visuals drop the leak edge, the stains and
 * the bright shot effects (arcs, white tracers, hit flashes); a colour-safe run draws both rosters from the safe
 * palette with each specimen's outline glyph.
 */
import { BOARD, TOWERS, type TowerType } from './data';
import { P, drawBiohazard, drawInstrument, drawSpecimen, paletteFor, roundRect, SPECIMEN_LOOK } from './art';
import { NO_VEGA_ASSIST, type VegaAssistFlags } from './assist-profile';
import type { SimEvent, Simulation } from './Simulation';
import type { Tower } from './Entities';

type Fx =
  | { k: 'tracer'; x1: number; y1: number; x2: number; y2: number; age: number; life: number; color: string; w: number }
  | { k: 'arc'; pts: { x: number; y: number }[]; age: number; life: number }
  | { k: 'ring'; x: number; y: number; r0: number; r1: number; age: number; life: number; color: string; dash?: boolean }
  | { k: 'drops'; x: number; y: number; color: string; seeds: number[]; age: number; life: number; big: boolean }
  | { k: 'text'; x: number; y: number; text: string; age: number; life: number; color: string };

interface Stain {
  x: number;
  y: number;
  r: number;
  color: string;
  age: number;
  seed: number;
}

const STAIN_LIFE = 9;
const MAX_FX = 220;

export interface Cursor {
  cx: number;
  cy: number;
  /** An instrument to preview at the cursor (build mode). */
  build: TowerType | null;
  valid: boolean;
  /** Keyboard cursor: drawn as a bracket even with no build selected. */
  keyboard: boolean;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = BOARD.WIDTH;
  private height = BOARD.HEIGHT;
  private backdrop: HTMLCanvasElement | null = null;
  private backdropKey = '';
  private fx: Fx[] = [];
  private stains: Stain[] = [];
  private leakGlow = 0;
  private leakCooldown = 0;
  private sweep = -1;
  private seed = 1;
  private assist: VegaAssistFlags = NO_VEGA_ASSIST;
  private pal = paletteFor('default');

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  public setContext(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** The run's assist flags. Set once, before the first frame. */
  public setAssist(flags: VegaAssistFlags) {
    this.assist = flags;
    this.pal = paletteFor(flags.palette);
  }

  /** Drop the cached backdrop (fonts arrived, or the map changed). */
  public invalidate() {
    this.backdropKey = '';
  }

  private rand() {
    // Small LCG for effect jitter: deterministic, and cheaper than the sim's PRNG.
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /** Turn simulation events into effects. */
  public ingest(events: SimEvent[], reduced: boolean) {
    for (const e of events) {
      switch (e.t) {
        case 'fire': {
          const from = e.from;
          if (this.assist.calm) {
            // No muzzle flash: one thin, dim line shows where the shot went.
            for (const to of e.to.slice(0, 1)) {
              this.push({ k: 'tracer', x1: from.x, y1: from.y, x2: to.x, y2: to.y, age: 0, life: 0.1, color: P.mintDim, w: 1 });
            }
          } else if (e.tower === 'DEFIBRILLATOR') {
            const pts = [from, ...e.to].flatMap((p, i, arr) => {
              if (i === 0) return [p];
              const a = arr[i - 1]!;
              const mid = { x: (a.x + p.x) / 2 + (this.rand() - 0.5) * 22, y: (a.y + p.y) / 2 + (this.rand() - 0.5) * 22 };
              return [mid, p];
            });
            this.push({ k: 'arc', pts, age: 0, life: 0.16 });
          } else if (e.tower === 'LOBOTOMIZER') {
            const to = e.to[0]!;
            this.push({ k: 'tracer', x1: from.x, y1: from.y, x2: to.x, y2: to.y, age: 0, life: 0.18, color: P.white, w: 2.5 });
          } else if (e.tower === 'SYNAPSE') {
            for (const to of e.to) {
              this.push({ k: 'tracer', x1: from.x, y1: from.y, x2: to.x, y2: to.y, age: 0, life: 0.1, color: P.mint, w: 1.5 });
            }
          }
          break;
        }
        case 'splash':
          this.push({ k: 'ring', x: e.x, y: e.y, r0: e.r * 0.3, r1: e.r, age: 0, life: 0.3, color: P.chemical });
          if (!reduced) this.push({ k: 'drops', x: e.x, y: e.y, color: P.chemical, seeds: this.seeds(6), age: 0, life: 0.3, big: false });
          break;
        case 'kill': {
          const look = SPECIMEN_LOOK[e.enemy];
          this.push({ k: 'drops', x: e.x, y: e.y, color: look.body, seeds: this.seeds(e.boss ? 16 : reduced ? 4 : 8), age: 0, life: e.boss ? 0.36 : 0.28, big: e.boss });
          if (!this.assist.calm) {
            this.stains.push({ x: e.x, y: e.y, r: look.r * (e.boss ? 1.8 : 1.3), color: P.bloodDark, age: 0, seed: this.rand() * 1000 });
            if (this.stains.length > 90) this.stains.shift();
          }
          if (e.boss || e.bounty >= 12) {
            this.push({ k: 'text', x: e.x, y: e.y - 14, text: `+${e.bounty}`, age: 0, life: 0.36, color: P.mint });
          }
          break;
        }
        case 'leak':
          if (this.leakCooldown <= 0 && !this.assist.calm) {
            this.leakGlow = 1;
            this.leakCooldown = 1;
          }
          this.push({ k: 'ring', x: e.x, y: e.y, r0: 6, r1: 40, age: 0, life: 0.34, color: P.blood });
          break;
        case 'sever':
          this.push({ k: 'ring', x: e.x, y: e.y, r0: e.r * 0.4, r1: e.r, age: 0, life: 0.34, color: P.blood, dash: true });
          break;
        case 'heal':
          this.push({ k: 'ring', x: e.x, y: e.y, r0: 8, r1: e.r, age: 0, life: 0.3, color: P.mintDim, dash: true });
          break;
        case 'brood':
        case 'shed':
          this.push({ k: 'drops', x: e.x, y: e.y, color: SPECIMEN_LOOK.PATIENT.body, seeds: this.seeds(10), age: 0, life: 0.3, big: true });
          break;
        case 'waveClear':
          this.sweep = 0;
          break;
        default:
          break;
      }
    }
  }

  private seeds(n: number): number[] {
    return Array.from({ length: n }, () => this.rand());
  }

  private push(f: Fx) {
    this.fx.push(f);
    if (this.fx.length > MAX_FX) this.fx.shift();
  }

  public update(dt: number) {
    for (const f of this.fx) f.age += dt;
    this.fx = this.fx.filter((f) => f.age < f.life);
    for (const s of this.stains) s.age += dt;
    this.stains = this.stains.filter((s) => s.age < STAIN_LIFE);
    if (this.leakGlow > 0) this.leakGlow = Math.max(0, this.leakGlow - dt / 0.6);
    if (this.leakCooldown > 0) this.leakCooldown -= dt;
    if (this.sweep >= 0) {
      this.sweep += dt / 0.34;
      if (this.sweep > 1) this.sweep = -1;
    }
  }

  public clearEffects() {
    this.fx = [];
    this.stains = [];
    this.leakGlow = 0;
    this.sweep = -1;
  }

  // ── Frame ──────────────────────────────────────────────────────────────────

  public draw(sim: Simulation, t: number, opts: { cursor: Cursor | null; selected: Tower | null; still: boolean }) {
    const ctx = this.ctx;
    this.drawBackdrop(sim);

    // Stains: a dark blot that fades over STAIN_LIFE seconds.
    for (const s of this.stains) {
      const a = 0.55 * (1 - s.age / STAIN_LIFE);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const rr = s.r * (0.7 + 0.3 * Math.sin(ang * 3 + s.seed));
        const px = s.x + Math.cos(ang) * rr;
        const py = s.y + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.fill();
      ctx.restore();
    }

    const towers = sim.entities.towers;
    // Fields under everything: the Suppressor's sedative and the Echo's reach.
    for (const tw of towers) {
      if (tw.def.attack === 'aura') this.field(tw.x, tw.y, tw.rangePx, P.sedative, 0.07);
      if (tw.def.attack === 'support') this.field(tw.x, tw.y, tw.rangePx, P.mint, 0.035);
    }

    // Beams (Cautery) under the instruments.
    for (const tw of towers) {
      if (tw.def.attack !== 'beam' || tw.beamTarget === null) continue;
      const e = sim.entities.enemies.find((en) => en.id === tw.beamTarget);
      if (!e) continue;
      const tipX = tw.x + Math.cos(tw.aim) * 22;
      const tipY = tw.y + Math.sin(tw.aim) * 22;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = P.thermal;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 5 + tw.tier;
      line(ctx, tipX, tipY, e.x, e.y);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = P.white;
      ctx.lineWidth = 1.5;
      line(ctx, tipX, tipY, e.x, e.y);
      ctx.restore();
    }

    const size = BOARD.CELL * 0.78;
    for (const tw of towers) {
      drawInstrument(ctx, tw.type, tw.x, tw.y, size, {
        aim: tw.aim,
        tier: tw.tier,
        palette: this.assist.palette,
        t: opts.still ? 0 : t,
        stunned: tw.stunTimer > 0,
        buffed: tw.buffDamage > 0,
        firedAge: tw.firedAge,
      });
    }

    for (const e of sim.entities.enemies) {
      const lane = sim.grid.lanes[e.lane]!;
      const ahead = sim.grid.positionAt(lane, e.dist + 6);
      const heading = Math.atan2(ahead.y - e.y, ahead.x - e.x);
      drawSpecimen(ctx, e.type, e.x, e.y, {
        t,
        phase: e.phase,
        heading,
        shieldFrac: e.maxShield > 0 ? e.shield / e.maxShield : 0,
        cloaked: e.cloaked,
        revealed: e.revealed,
        shed: e.shed,
        still: opts.still,
        hitAge: e.hitAge,
        burning: e.burnTimer > 0,
        slowed: e.slow > 0,
        palette: this.assist.palette,
        calm: this.assist.calm,
      });
      if (e.cloaked && !e.revealed) continue;
      // HP bar: a thin mint line on a dark track, wider for bosses.
      const look = SPECIMEN_LOOK[e.type];
      const w = e.def.boss ? 56 : Math.max(16, look.r * 2);
      const frac = Math.max(0, e.health / e.maxHealth);
      const by = e.y - look.r - (e.def.boss ? 14 : 8);
      ctx.fillStyle = P.ink;
      ctx.fillRect(e.x - w / 2 - 1, by - 1, w + 2, e.def.boss ? 5 : 4);
      ctx.fillStyle = frac > 0.35 ? this.pal.mint : this.pal.blood;
      ctx.fillRect(e.x - w / 2, by, w * frac, e.def.boss ? 3 : 2);
    }

    // Canisters on a short arc.
    for (const p of sim.entities.projectiles) {
      const k = Math.min(1, p.age / p.duration);
      const lift = Math.sin(Math.PI * k) * 26;
      ctx.save();
      ctx.translate(p.x, p.y - lift);
      ctx.rotate(k * 6);
      roundRect(ctx, -6, -3, 12, 6, 3);
      ctx.fillStyle = P.enamel;
      ctx.fill();
      ctx.fillStyle = P.chemical;
      ctx.fillRect(-1, -3, 6, 6);
      ctx.restore();
    }

    this.drawFx();
    this.drawOverlay(sim, opts.cursor, opts.selected);

    // The scan sweep after a wave clears (one pass, 340 ms), and a slow idle sweep unless still.
    const sweepY = this.sweep >= 0 ? this.sweep * this.height : opts.still ? -1 : ((t % 9) / 9) * this.height * 1.4 - this.height * 0.2;
    if (sweepY >= 0 && sweepY <= this.height) {
      ctx.save();
      ctx.globalAlpha = this.sweep >= 0 ? 0.22 : 0.05;
      ctx.fillStyle = P.mint;
      ctx.fillRect(0, sweepY - 1, this.width, 2);
      ctx.globalAlpha *= 0.5;
      ctx.fillRect(0, sweepY - 14, this.width, 12);
      ctx.restore();
    }

    if (this.leakGlow > 0) {
      // The edge darkens toward blood: in 150 ms (the ramp is the glow's own curve), out over 600 ms.
      const a = Math.min(1, this.leakGlow * 1.2) * 0.45;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = P.blood;
      ctx.lineWidth = 18;
      ctx.strokeRect(9, 9, this.width - 18, this.height - 18);
      ctx.restore();
    }
  }

  private field(x: number, y: number, r: number, color: string, alpha: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 3;
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawFx() {
    const ctx = this.ctx;
    for (const f of this.fx) {
      const k = f.age / f.life;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      switch (f.k) {
        case 'tracer':
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.w;
          ctx.lineCap = 'round';
          line(ctx, f.x1, f.y1, f.x2, f.y2);
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(f.x2, f.y2, 3 + 6 * k, 0, Math.PI * 2);
          ctx.globalAlpha = (1 - k) * 0.5;
          ctx.fill();
          break;
        case 'arc':
          ctx.strokeStyle = P.electric;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'bevel';
          ctx.beginPath();
          f.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          break;
        case 'ring':
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 2;
          if (f.dash) ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * easeOut(k), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'drops': {
          ctx.fillStyle = f.color;
          const reach = f.big ? 46 : 22;
          f.seeds.forEach((s, i) => {
            const a = s * Math.PI * 2 + i;
            const d = reach * easeOut(k) * (0.5 + s * 0.5);
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, (f.big ? 4 : 2.5) * (1 - k * 0.6), 0, Math.PI * 2);
            ctx.fill();
          });
          break;
        }
        case 'text':
          ctx.fillStyle = f.color;
          ctx.font = "500 13px 'IBM Plex Mono', ui-monospace, monospace";
          ctx.textAlign = 'center';
          ctx.fillText(f.text, f.x, f.y - k * 16);
          break;
      }
      ctx.restore();
    }
  }

  private drawOverlay(sim: Simulation, cursor: Cursor | null, selected: Tower | null) {
    const ctx = this.ctx;
    const c = BOARD.CELL;
    if (selected) {
      this.rangeRing(selected.x, selected.y, selected.rangePx, P.mint);
      ctx.save();
      ctx.strokeStyle = P.mint;
      ctx.lineWidth = 2;
      corners(ctx, selected.cx * c + 3, selected.cy * c + 3, c - 6, 9);
      ctx.restore();
    }
    if (!cursor) return;
    const x = cursor.cx * c;
    const y = cursor.cy * c;
    if (cursor.build) {
      const range = TOWERS[cursor.build].tiers[0].range * c;
      if (cursor.valid) {
        this.rangeRing(x + c / 2, y + c / 2, range, P.mint);
        drawInstrument(ctx, cursor.build, x + c / 2, y + c / 2, c * 0.78, { ghost: true, palette: this.assist.palette });
      } else {
        ctx.save();
        ctx.strokeStyle = P.blood;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y + 4, c - 8, c - 8);
        line(ctx, x + 12, y + 12, x + c - 12, y + c - 12);
        line(ctx, x + c - 12, y + 12, x + 12, y + c - 12);
        ctx.restore();
      }
    }
    if (cursor.keyboard || !cursor.build) {
      ctx.save();
      ctx.strokeStyle = cursor.keyboard ? P.white : P.mintDim;
      ctx.lineWidth = cursor.keyboard ? 2 : 1;
      corners(ctx, x + 2, y + 2, c - 4, 10);
      ctx.restore();
    }
    void sim;
  }

  private rangeRing(x: number, y: number, r: number, color: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    // Tick marks every 30 degrees, like a scope reticle.
    ctx.setLineDash([]);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      line(ctx, x + Math.cos(a) * (r - 5), y + Math.sin(a) * (r - 5), x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
    }
    ctx.restore();
  }

  // ── The cached backdrop ─────────────────────────────────────────────────────

  private drawBackdrop(sim: Simulation) {
    const key = sim.mapId;
    if (!this.backdrop || this.backdropKey !== key) {
      this.backdrop = this.backdrop ?? document.createElement('canvas');
      this.backdrop.width = this.width;
      this.backdrop.height = this.height;
      const b = this.backdrop.getContext('2d');
      if (b) paintBackdrop(b, sim, this.width, this.height);
      this.backdropKey = key;
    }
    this.ctx.drawImage(this.backdrop, 0, 0, this.width, this.height);
  }
}

function paintBackdrop(ctx: CanvasRenderingContext2D, sim: Simulation, W: number, H: number) {
  const c = BOARD.CELL;
  const grid = sim.grid;
  ctx.fillStyle = P.void;
  ctx.fillRect(0, 0, W, H);

  // Benches: lab tile, a hairline grid and a small cross at each corner.
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const kind = grid.kindAt(x, y);
      if (kind === 'corridor') continue;
      ctx.fillStyle = P.tile;
      ctx.fillRect(x * c + 1, y * c + 1, c - 2, c - 2);
      ctx.strokeStyle = P.tileLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(x * c + 4.5, y * c + 4.5, c - 9, c - 9);
    }
  }
  ctx.strokeStyle = P.tick;
  ctx.lineWidth = 1;
  for (let y = 0; y <= grid.rows; y++) {
    for (let x = 0; x <= grid.cols; x++) {
      line(ctx, x * c - 3, y * c, x * c + 3, y * c);
      line(ctx, x * c, y * c - 3, x * c, y * c + 3);
    }
  }

  // The corridor: a channel of tissue with darker walls.
  for (const lane of grid.lanes) {
    ctx.save();
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = P.tissueEdge;
    ctx.lineWidth = c * 0.86;
    polyline(ctx, lane.points);
    ctx.strokeStyle = P.tissue;
    ctx.lineWidth = c * 0.74;
    polyline(ctx, lane.points);
    ctx.restore();
  }
  // Striations across the channel, a fixed pattern of fibres.
  ctx.save();
  ctx.strokeStyle = '#24100F';
  ctx.lineWidth = 1;
  for (const lane of grid.lanes) {
    for (let d = 0; d < lane.length; d += 9) {
      const p = grid.positionAt(lane, d);
      const q = grid.positionAt(lane, d + 2);
      const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
      const len = c * 0.3 * (0.6 + 0.4 * Math.sin(d * 0.37));
      line(ctx, p.x - Math.cos(a) * len, p.y - Math.sin(a) * len, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
    }
  }
  ctx.restore();

  // The ECG trace down the middle of the corridor: flat line with a heartbeat complex every few cells.
  ctx.save();
  ctx.strokeStyle = P.mint;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  for (const lane of grid.lanes) {
    ctx.beginPath();
    for (let d = 0; d <= lane.length; d += 3) {
      const p = grid.positionAt(lane, d);
      const q = grid.positionAt(lane, d + 3);
      const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
      // Flat through the bends: a complex only where the corridor runs straight for its whole width.
      const back = grid.positionAt(lane, d - 24);
      const fwd = grid.positionAt(lane, d + 24);
      const straight = Math.abs(back.x - fwd.x) < 0.5 || Math.abs(back.y - fwd.y) < 0.5;
      const off = straight ? ecg((d % 240) / 240) * c * 0.3 : 0;
      const px = p.x + Math.cos(a) * off;
      const py = p.y + Math.sin(a) * off;
      if (d === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Fixtures: specimen jars, top down.
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (grid.kindAt(x, y) !== 'fixture') continue;
      const cx = x * c + c / 2;
      const cy = y * c + c / 2;
      ctx.fillStyle = P.ink;
      ctx.fillRect(x * c + 2, y * c + 2, c - 4, c - 4);
      ctx.strokeStyle = P.enamelShade;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#16302A';
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.3, 0, Math.PI * 2);
      ctx.fill();
      // The thing in the jar: a curled shape.
      ctx.strokeStyle = '#B98A86';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx + 2, cy, c * 0.13, 0.6, Math.PI * 1.7);
      ctx.stroke();
      ctx.fillStyle = '#B98A86';
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 7, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.white;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.3, -2.4, -1.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Entry hatches and the containment door at the exit.
  ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textBaseline = 'middle';
  grid.entries.forEach((en, i) => {
    const x = en.x * c;
    const y = en.y * c;
    ctx.strokeStyle = P.mint;
    ctx.lineWidth = 2;
    corners(ctx, x + 3, y + 3, c - 6, 10);
    ctx.fillStyle = P.mint;
    ctx.textAlign = 'center';
    ctx.fillText(grid.entries.length > 1 ? `IN-${i + 1}` : 'INTAKE', x + c / 2, y + c / 2);
  });
  {
    const x = grid.exit.x * c;
    const y = grid.exit.y * c;
    ctx.fillStyle = '#1E0809';
    ctx.fillRect(x + 2, y + 2, c - 4, c - 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, c - 4, c - 4);
    ctx.clip();
    ctx.strokeStyle = '#4A1418';
    ctx.lineWidth = 5;
    for (let i = -c; i < c * 2; i += 12) line(ctx, x + i, y, x + i + c, y + c);
    ctx.restore();
    drawBiohazard(ctx, x + c / 2, y + c / 2, c * 0.3, P.blood);
  }

  // Ruler ticks and coordinates on the edges, like a slide scale.
  ctx.fillStyle = P.label;
  ctx.font = "400 9px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let x = 0; x < grid.cols; x++) {
    if (grid.kindAt(x, 0) === 'corridor') continue;
    ctx.fillText(String.fromCharCode(65 + x), x * c + c / 2, 3);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < grid.rows; y++) {
    if (grid.kindAt(0, y) === 'corridor') continue;
    ctx.fillText(String(y + 1).padStart(2, '0'), 3, y * c + c / 2);
  }

  // Registration marks in the four corners and a scale bar.
  ctx.strokeStyle = P.label;
  ctx.lineWidth = 1;
  for (const [mx, my] of [
    [18, 18],
    [W - 18, 18],
    [18, H - 18],
    [W - 18, H - 18],
  ] as const) {
    ctx.beginPath();
    ctx.arc(mx, my, 7, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, mx - 11, my, mx + 11, my);
    line(ctx, mx, my - 11, mx, my + 11);
  }
  ctx.fillStyle = P.label;
  ctx.fillRect(W - 150, H - 30, 100, 2);
  ctx.fillRect(W - 150, H - 34, 1, 10);
  ctx.fillRect(W - 51, H - 34, 1, 10);
  ctx.textAlign = 'center';
  ctx.fillText('100 µm', W - 100, H - 40);

  // Static scanlines over everything, then the monitor's vignette.
  ctx.fillStyle = '#000000';
  ctx.globalAlpha = 0.16;
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** A unit ECG complex over one period: flat, P bump, QRS spike, T bump. */
function ecg(u: number): number {
  if (u < 0.55) return 0;
  if (u < 0.62) return -0.25 * Math.sin(((u - 0.55) / 0.07) * Math.PI);
  if (u < 0.65) return 0;
  if (u < 0.67) return 0.4;
  if (u < 0.7) return -1;
  if (u < 0.72) return 0.5;
  if (u < 0.8) return 0;
  if (u < 0.92) return -0.35 * Math.sin(((u - 0.8) / 0.12) * Math.PI);
  return 0;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function polyline(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

/** Four corner brackets of a square, like a viewfinder. */
function corners(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, len: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + s - len, y);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x + s, y + len);
  ctx.moveTo(x + s, y + s - len);
  ctx.lineTo(x + s, y + s);
  ctx.lineTo(x + s - len, y + s);
  ctx.moveTo(x + len, y + s);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x, y + s - len);
  ctx.stroke();
}

function easeOut(k: number) {
  return 1 - (1 - k) * (1 - k);
}
