/**
 * Project Vega's drawn art: the instruments (towers) and specimens (enemies), as canvas routines shared by the
 * board renderer and the UI's roster icons, so a Synapse in the formulary is the same drawing as the one on the
 * bench. Everything is original geometry; no images, no fonts.
 *
 * The look (docs/game-design-schemes/vega.json): a diagnostic monitor of a specimen slide. Instruments are cold
 * white enamel with a single mint status light; specimens are membranes and nuclei in flesh, bile and bruise
 * tones, the only warm colours on a green-black screen.
 */
import type { EnemyType, TowerType } from './data';

export const P = {
  void: '#020504',
  tile: '#06100D',
  tileLine: '#0E241D',
  tick: '#1C3A31',
  label: '#5E8F80',
  mint: '#8EF0C4',
  mintDim: '#3E8A6C',
  white: '#E6F2EE',
  enamel: '#DCE8E3',
  enamelShade: '#A9BDB6',
  ink: '#0B1613',
  blood: '#E0393E',
  bloodDark: '#5A1218',
  tissue: '#170A0C',
  tissueEdge: '#3A1418',
  thermal: '#FFA766',
  electric: '#CFF5FF',
  chemical: '#B8F07A',
  sedative: '#7FD6C8',
} as const;

const TAU = Math.PI * 2;

// ── Instruments ──────────────────────────────────────────────────────────────

export interface InstrumentOpts {
  aim?: number;
  tier?: number;
  /** Seconds, for the few parts that turn (the centrifuge rotor). */
  t?: number;
  stunned?: boolean;
  buffed?: boolean;
  ghost?: boolean;
  /** Seconds since it last fired, for the recoil and muzzle light. */
  firedAge?: number;
}

/** Draw an instrument centred on (x, y) in a square of side `s`. */
export function drawInstrument(ctx: CanvasRenderingContext2D, type: TowerType, x: number, y: number, s: number, o: InstrumentOpts = {}) {
  const aim = o.aim ?? -Math.PI / 2;
  const h = s / 2;
  ctx.save();
  ctx.translate(x, y);
  if (o.ghost) ctx.globalAlpha *= 0.55;

  // Enamel base plate with a recessed inner square and four corner screws.
  const r = s * 0.14;
  roundRect(ctx, -h, -h, s, s, r);
  ctx.fillStyle = P.enamel;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.strokeStyle = P.enamelShade;
  ctx.stroke();
  roundRect(ctx, -h * 0.78, -h * 0.78, s * 0.78, s * 0.78, r * 0.6);
  ctx.strokeStyle = P.enamelShade;
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  ctx.fillStyle = P.enamelShade;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    ctx.beginPath();
    ctx.arc(sx * h * 0.86, sy * h * 0.86, s * 0.035, 0, TAU);
    ctx.fill();
  }

  const recoil = o.firedAge !== undefined && o.firedAge < 0.08 ? s * 0.05 : 0;
  ctx.fillStyle = P.ink;
  ctx.strokeStyle = P.ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (type) {
    case 'SYNAPSE': {
      // A neuron: soma, five dendrites, and an axon barrel that turns to the target.
      ctx.lineWidth = s * 0.05;
      for (let i = 0; i < 5; i++) {
        const a = aim + Math.PI + (i - 2) * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * h * 0.62, Math.sin(a) * h * 0.62);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(Math.cos(a) * h * 0.62, Math.sin(a) * h * 0.62, s * 0.035, 0, TAU);
        ctx.fill();
      }
      ctx.save();
      ctx.rotate(aim);
      ctx.fillRect(s * 0.05 - recoil, -s * 0.07, h * 0.8, s * 0.14);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.16, 0, TAU);
      ctx.fill();
      light(ctx, 0, 0, s * 0.07);
      break;
    }
    case 'SUPPRESSOR': {
      // An IV bag on a drip line, the sedative level shown in mint.
      roundRect(ctx, -s * 0.2, -h * 0.66, s * 0.4, s * 0.46, s * 0.08);
      ctx.fill();
      ctx.fillStyle = P.sedative;
      roundRect(ctx, -s * 0.15, -h * 0.66 + s * 0.2, s * 0.3, s * 0.21, s * 0.05);
      ctx.fill();
      ctx.fillStyle = P.ink;
      ctx.lineWidth = s * 0.04;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.66 + s * 0.46);
      ctx.lineTo(0, h * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, h * 0.5, s * 0.07, 0, TAU);
      ctx.fill();
      light(ctx, 0, h * 0.5, s * 0.035);
      break;
    }
    case 'CAUTERY': {
      // A cautery pen: grip, collar and the hot tip pointed at the target.
      ctx.save();
      ctx.rotate(aim);
      roundRect(ctx, -h * 0.7, -s * 0.09, s * 0.62, s * 0.18, s * 0.06);
      ctx.fill();
      ctx.fillRect(-h * 0.7 + s * 0.62, -s * 0.05, s * 0.18, s * 0.1);
      ctx.fillStyle = P.thermal;
      ctx.beginPath();
      ctx.moveTo(h * 0.62, -s * 0.05);
      ctx.lineTo(h * 0.82, 0);
      ctx.lineTo(h * 0.62, s * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      light(ctx, -s * 0.08 * Math.cos(aim), -s * 0.08 * Math.sin(aim), s * 0.04);
      break;
    }
    case 'CENTRIFUGE': {
      // A rotor with six sample tubes.
      ctx.beginPath();
      ctx.arc(0, 0, h * 0.62, 0, TAU);
      ctx.fill();
      const spin = (o.t ?? 0) * 0.8;
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * TAU) / 6;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * h * 0.4, Math.sin(a) * h * 0.4, s * 0.07, 0, TAU);
        ctx.fillStyle = i % 2 ? P.chemical : P.enamelShade;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.08, 0, TAU);
      ctx.fillStyle = P.enamel;
      ctx.fill();
      light(ctx, 0, 0, s * 0.04);
      break;
    }
    case 'DEFIBRILLATOR': {
      // Two paddles and the bolt between them.
      for (const side of [-1, 1]) {
        roundRect(ctx, side * s * 0.2 - s * 0.13, -h * 0.55, s * 0.26, s * 0.55, s * 0.08);
        ctx.fill();
      }
      ctx.fillStyle = P.electric;
      ctx.beginPath();
      ctx.moveTo(s * 0.04, -h * 0.4);
      ctx.lineTo(-s * 0.06, s * 0.02);
      ctx.lineTo(s * 0.03, s * 0.02);
      ctx.lineTo(-s * 0.04, h * 0.42);
      ctx.lineTo(s * 0.08, -s * 0.04);
      ctx.lineTo(-s * 0.01, -s * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.stroke();
      light(ctx, 0, h * 0.62, s * 0.035);
      break;
    }
    case 'LOBOTOMIZER': {
      // An orbitoclast: a long needle on a pivot, laid along the line of fire.
      ctx.save();
      ctx.rotate(aim);
      ctx.beginPath();
      ctx.arc(-h * 0.35, 0, s * 0.13, 0, TAU);
      ctx.fill();
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(-h * 0.35 - recoil, 0);
      ctx.lineTo(h * 0.9 - recoil, 0);
      ctx.stroke();
      ctx.lineWidth = s * 0.025;
      ctx.beginPath();
      ctx.moveTo(-h * 0.7, -s * 0.12);
      ctx.lineTo(-h * 0.7, s * 0.12);
      ctx.stroke();
      ctx.restore();
      light(ctx, -h * 0.35 * Math.cos(aim), -h * 0.35 * Math.sin(aim), s * 0.05);
      break;
    }
    case 'ECHO': {
      // An ultrasound transducer: a head and three arcs of its sound.
      roundRect(ctx, -s * 0.12, s * 0.02, s * 0.24, h * 0.66, s * 0.06);
      ctx.fill();
      ctx.lineWidth = s * 0.045;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(0, s * 0.02, s * (0.08 + i * 0.1), Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
      }
      light(ctx, 0, s * 0.18, s * 0.04);
      break;
    }
    case 'BIOBANK': {
      // A cryo rack of six vials, levels in mint.
      for (let i = 0; i < 6; i++) {
        const vx = -s * 0.26 + (i % 3) * s * 0.26;
        const vy = i < 3 ? -s * 0.2 : s * 0.12;
        roundRect(ctx, vx - s * 0.07, vy - s * 0.12, s * 0.14, s * 0.28, s * 0.05);
        ctx.fillStyle = P.ink;
        ctx.fill();
        ctx.fillStyle = P.mint;
        const lvl = 0.35 + ((i * 37) % 50) / 100;
        ctx.fillRect(vx - s * 0.045, vy + s * 0.13 - s * 0.22 * lvl, s * 0.09, s * 0.22 * lvl);
      }
      break;
    }
  }

  // Tier pips, bottom right: I, II, III.
  const tier = o.tier ?? 0;
  for (let i = 0; i <= tier; i++) {
    ctx.fillStyle = P.mintDim;
    ctx.fillRect(h - s * 0.12 - i * s * 0.11, h - s * 0.12, s * 0.08, s * 0.06);
  }
  if (o.buffed) {
    ctx.strokeStyle = P.mintDim;
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.setLineDash([s * 0.06, s * 0.06]);
    roundRect(ctx, -h - s * 0.06, -h - s * 0.06, s * 1.12, s * 1.12, r * 1.3);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (o.stunned) {
    ctx.strokeStyle = P.blood;
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(-h * 0.6, -h * 0.6);
    ctx.lineTo(h * 0.6, h * 0.6);
    ctx.moveTo(h * 0.6, -h * 0.6);
    ctx.lineTo(-h * 0.6, h * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

/** The single status light every instrument carries: a mint dot in a dark ring. */
function light(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = P.mint;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Specimens ────────────────────────────────────────────────────────────────

export interface SpecimenLook {
  body: string;
  edge: string;
  nucleus: string;
  /** Radius in px at board scale. */
  r: number;
}

export const SPECIMEN_LOOK: Record<EnemyType, SpecimenLook> = {
  ANXIETY: { body: '#D9A3A0', edge: '#8A4F4C', nucleus: '#5A2422', r: 9 },
  GUILT: { body: '#9A87A8', edge: '#5B4A68', nucleus: '#2F2338', r: 11 },
  FRAGMENT: { body: '#B7A5C4', edge: '#5B4A68', nucleus: '#2F2338', r: 6 },
  DEPRESSION: { body: '#7A8A96', edge: '#3A4650', nucleus: '#1C252C', r: 15 },
  MANIC: { body: '#E07A66', edge: '#8E3426', nucleus: '#4A140C', r: 9 },
  DOUBT: { body: '#B4C2AE', edge: '#5F6E5A', nucleus: '#2C3529', r: 11 },
  OBSESSION: { body: '#D1BC82', edge: '#7D6A35', nucleus: '#3E3315', r: 12 },
  PARANOIA: { body: '#C9D3D0', edge: '#6D7A76', nucleus: '#1A2321', r: 11 },
  DREAD: { body: '#7A3A45', edge: '#3C1219', nucleus: '#E9D8DA', r: 13 },
  PATIENT: { body: '#D49A92', edge: '#7E423B', nucleus: '#4A1A15', r: 28 },
  SURGEON: { body: '#3C4B47', edge: '#18211F', nucleus: '#E6F2EE', r: 26 },
  SPECIMEN: { body: '#C58B8E', edge: '#6A2E34', nucleus: '#2A0D10', r: 30 },
};

export interface SpecimenOpts {
  t?: number;
  phase?: number;
  /** Heading in radians, for the specimens that stretch along their motion. */
  heading?: number;
  hpFrac?: number;
  shieldFrac?: number;
  cloaked?: boolean;
  revealed?: boolean;
  shed?: boolean;
  /** Freeze the membrane wobble (Globe motion: Still). */
  still?: boolean;
  /** Seconds since the last hit. */
  hitAge?: number;
  burning?: boolean;
  slowed?: boolean;
  /** Scale multiplier on the look's radius (UI icons draw larger). */
  scale?: number;
}

/** Draw a specimen centred on (x, y). */
export function drawSpecimen(ctx: CanvasRenderingContext2D, type: EnemyType, x: number, y: number, o: SpecimenOpts = {}) {
  const look = SPECIMEN_LOOK[type];
  const r = look.r * (o.scale ?? 1);
  const t = o.still ? 0 : (o.t ?? 0);
  const ph = o.phase ?? 0;
  const heading = o.heading ?? 0;
  ctx.save();
  ctx.translate(x, y);

  if (o.cloaked && !o.revealed) {
    // Unseen: a dashed trace of the membrane and nothing else.
    ctx.globalAlpha *= 0.4;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = look.body;
    ctx.lineWidth = 1.5;
    membranePath(ctx, r, t, ph, 0.05);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Appendages first, so the membrane covers their roots.
  ctx.strokeStyle = look.edge;
  ctx.lineCap = 'round';
  if (type === 'ANXIETY' || type === 'FRAGMENT') {
    ctx.lineWidth = Math.max(1, r * 0.14);
    const n = type === 'ANXIETY' ? 12 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n + ph + Math.sin(t * 6 + i) * 0.12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.lineTo(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45);
      ctx.stroke();
    }
  } else if (type === 'MANIC') {
    // A flagellum trailing behind.
    ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const d = r * 0.8 + i * r * 0.22;
      const wob = Math.sin(t * 14 + i * 0.9) * r * 0.25;
      const px = -Math.cos(heading) * d - Math.sin(heading) * wob;
      const py = -Math.sin(heading) * d + Math.cos(heading) * wob;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (type === 'SURGEON') {
    // Four blades turning slowly.
    ctx.strokeStyle = P.enamel;
    ctx.lineWidth = r * 0.12;
    for (let i = 0; i < 4; i++) {
      const a = t * 0.9 + (i * TAU) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
      ctx.lineTo(Math.cos(a + 0.35) * r * 1.5, Math.sin(a + 0.35) * r * 1.5);
      ctx.stroke();
    }
  }

  // Membrane.
  const stretch = type === 'MANIC' ? 1.35 : 1;
  ctx.save();
  if (stretch !== 1) {
    ctx.rotate(heading);
    ctx.scale(stretch, 1 / stretch);
    ctx.rotate(-heading);
  }
  membranePath(ctx, r, t, ph, type === 'PATIENT' || type === 'SPECIMEN' ? 0.1 : 0.06);
  ctx.fillStyle = look.body;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  ctx.strokeStyle = o.hitAge !== undefined && o.hitAge < 0.07 ? P.white : look.edge;
  ctx.stroke();
  ctx.restore();

  // Interior.
  ctx.fillStyle = look.nucleus;
  ctx.strokeStyle = look.nucleus;
  switch (type) {
    case 'GUILT': {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * r * 0.32, 0, r * 0.26, 0, TAU);
        ctx.fill();
      }
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.8);
      ctx.lineTo(0, r * 0.8);
      ctx.stroke();
      break;
    }
    case 'DEPRESSION': {
      // Keratin plates: six thick arcs over the membrane.
      ctx.strokeStyle = '#2B353D';
      ctx.lineWidth = r * 0.22;
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 + ph;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.82, a + 0.12, a + TAU / 6 - 0.12);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.32, 0, TAU);
      ctx.fill();
      break;
    }
    case 'OBSESSION': {
      // A coiled nucleus.
      ctx.lineWidth = Math.max(1.2, r * 0.13);
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * TAU * 2.3 + ph;
        const rr = (i / 40) * r * 0.62;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.stroke();
      break;
    }
    case 'PARANOIA': {
      // Revealed: an open eye.
      ctx.fillStyle = P.white;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.62, r * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = look.nucleus;
      ctx.beginPath();
      ctx.arc(Math.cos(heading) * r * 0.2, Math.sin(heading) * r * 0.1, r * 0.22, 0, TAU);
      ctx.fill();
      break;
    }
    case 'DREAD': {
      // A cross-shaped pale nucleus: the one that heals.
      const w = r * 0.22;
      ctx.fillRect(-w / 2, -r * 0.55, w, r * 1.1);
      ctx.fillRect(-r * 0.55, -w / 2, r * 1.1, w);
      break;
    }
    case 'PATIENT': {
      // Several nuclei and a line of sutures.
      for (let i = 0; i < 5; i++) {
        const a = ph + i * 1.3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * (0.12 + (i % 2) * 0.05), 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.1);
      ctx.quadraticCurveTo(0, r * 0.45, r * 0.7, r * 0.05);
      ctx.stroke();
      for (let i = -3; i <= 3; i++) {
        const sx = i * r * 0.18;
        const sy = r * 0.1 + (1 - (i / 3.5) ** 2) * r * 0.22;
        ctx.beginPath();
        ctx.moveTo(sx - 2, sy - 5);
        ctx.lineTo(sx + 2, sy + 5);
        ctx.stroke();
      }
      break;
    }
    case 'SURGEON': {
      // A pale, featureless mask.
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.42, r * 0.52, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = look.body;
      ctx.fillRect(-r * 0.24, -r * 0.1, r * 0.16, r * 0.06);
      ctx.fillRect(r * 0.08, -r * 0.1, r * 0.16, r * 0.06);
      break;
    }
    case 'SPECIMEN': {
      // An eye in a glass shell; the shell cracks away below half HP.
      ctx.fillStyle = P.white;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.fillStyle = look.nucleus;
      ctx.beginPath();
      ctx.arc(Math.cos(heading) * r * 0.12, Math.sin(heading) * r * 0.12, r * 0.2, 0, TAU);
      ctx.fill();
      if (!o.shed) {
        ctx.strokeStyle = P.white;
        ctx.globalAlpha *= 0.55;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.25, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.25, -2.3, -1.4);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.globalAlpha /= 0.55;
      }
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(r * 0.12, -r * 0.08, r * 0.34, 0, TAU);
      ctx.fill();
    }
  }

  // Shield bubble (Doubt, the Specimen's shell), sized by what is left of it.
  if (o.shieldFrac && o.shieldFrac > 0) {
    ctx.strokeStyle = P.electric;
    ctx.globalAlpha *= 0.35 + 0.5 * o.shieldFrac;
    ctx.lineWidth = 1.5 + 2 * o.shieldFrac;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (o.burning) {
    ctx.strokeStyle = P.thermal;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (o.slowed) {
    ctx.fillStyle = P.sedative;
    for (let i = 0; i < 4; i++) {
      const a = ph + (i * TAU) / 4;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15, 1.6, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A soft, irregular membrane: a circle whose radius ripples by `amp`. */
function membranePath(ctx: CanvasRenderingContext2D, r: number, t: number, ph: number, amp: number) {
  const n = 18;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + amp * Math.sin(3 * a + ph + t * 1.6) + amp * 0.6 * Math.sin(5 * a - ph * 1.7 - t));
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** The biohazard trefoil, drawn at the exit and on the warnings. */
export function drawBiohazard(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = r * 0.16;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, r * 0.46, a + Math.PI + 0.9, a + Math.PI - 0.9 + TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, TAU);
  ctx.lineWidth = r * 0.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.restore();
}
