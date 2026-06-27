// ───────────────────────────────────────────────────────────────────────────
// Interactive entity sprites: chips, vault keys, ability relics, levers,
// pressure plates, moving platforms, security lasers/cameras, save shrines,
// slot reels, doors and the vault core. All animated, all rect-drawn.
// ───────────────────────────────────────────────────────────────────────────
import { TILE_SIZE, COLORS } from "../constants";
import type { AbilityId } from "../types";

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function drawChip(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const wob = Math.sin(t * 3 + x) * 1.5;
  const yy = y + wob;
  // perspective squash to fake spin
  const w = 6 + Math.abs(Math.sin(t * 4 + x)) * 2;
  const cx = x + 8;
  ctx.fillStyle = COLORS.chipRim;
  ctx.fillRect(Math.round(cx - w / 2), Math.round(yy + 4), Math.round(w), 6);
  ctx.fillStyle = COLORS.chip;
  ctx.fillRect(Math.round(cx - w / 2) + 1, Math.round(yy + 5), Math.round(w) - 2, 4);
  px(ctx, cx - 1, yy + 6, 2, 2, "#fff3c0");
  // glow
  ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 5);
  px(ctx, cx - 4, yy + 3, 8, 8, COLORS.chip);
  ctx.globalAlpha = 1;
}

export function drawKey(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const yy = y + Math.sin(t * 2) * 2;
  // aura
  ctx.globalAlpha = 0.2 + 0.1 * Math.sin(t * 4);
  px(ctx, x + 2, yy, 12, 16, COLORS.gold);
  ctx.globalAlpha = 1;
  // ornate vault key
  px(ctx, x + 6, yy + 2, 4, 4, COLORS.goldBright); // bow
  px(ctx, x + 7, yy + 3, 2, 2, "#1a1209");
  px(ctx, x + 7, yy + 6, 2, 8, COLORS.gold); // shaft
  px(ctx, x + 7, yy + 12, 4, 2, COLORS.gold); // teeth
  px(ctx, x + 7, yy + 10, 3, 1, COLORS.gold);
  px(ctx, x + 7, yy + 6, 2, 8, COLORS.gold);
  px(ctx, x + 7, yy + 6, 1, 8, COLORS.goldBright);
}

const ABILITY_COLOR: Record<AbilityId, string> = {
  doubleJump: COLORS.chip,
  dash: COLORS.neonCyan,
  wallGrip: COLORS.neonGreen,
};

export function drawAbilityRelic(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  ability: AbilityId
) {
  const col = ABILITY_COLOR[ability];
  const yy = y + Math.sin(t * 2) * 2.5;
  // halo
  ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 3);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x + 8, yy + 8, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // rotating sparkles
  for (let i = 0; i < 4; i++) {
    const a = t * 2 + (i * Math.PI) / 2;
    px(ctx, x + 8 + Math.cos(a) * 9 - 1, yy + 8 + Math.sin(a) * 9 - 1, 2, 2, col);
  }

  if (ability === "doubleJump") {
    // golden lucky coin
    px(ctx, x + 4, yy + 4, 8, 8, COLORS.chip);
    px(ctx, x + 4, yy + 4, 8, 1, "#fff3c0");
    px(ctx, x + 6, yy + 6, 4, 4, COLORS.chipRim);
    px(ctx, x + 7, yy + 6, 2, 4, COLORS.goldBright); // a "1"
  } else if (ability === "dash") {
    // ace card streaking
    px(ctx, x + 4, yy + 3, 8, 11, "#e8e2d0");
    px(ctx, x + 4, yy + 3, 8, 1, "#fff");
    px(ctx, x + 7, yy + 6, 2, 2, COLORS.neonCyan);
    px(ctx, x + 6, yy + 8, 4, 1, COLORS.neonCyan);
    px(ctx, x + 7, yy + 9, 2, 2, COLORS.neonCyan);
  } else {
    // grip glove
    px(ctx, x + 5, yy + 5, 6, 7, "#2f7d57");
    px(ctx, x + 5, yy + 4, 2, 3, "#2f7d57");
    px(ctx, x + 7, yy + 3, 2, 4, "#2f7d57");
    px(ctx, x + 9, yy + 4, 2, 3, "#2f7d57");
    px(ctx, x + 5, yy + 5, 6, 1, COLORS.neonGreen);
  }
}

export function drawLever(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  on: boolean
) {
  // base
  px(ctx, x + 5, y + 10, 6, 5, "#241a12");
  px(ctx, x + 5, y + 10, 6, 1, "#4a3826");
  // handle
  const hx = on ? x + 10 : x + 4;
  ctx.strokeStyle = "#6b4e2e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 11);
  ctx.lineTo(hx + 1, y + 4);
  ctx.stroke();
  px(ctx, hx, y + 2, 3, 3, on ? COLORS.neonGreen : COLORS.neonRed);
  // glow when on
  if (on) {
    ctx.globalAlpha = 0.3;
    px(ctx, hx - 1, y + 1, 5, 5, COLORS.neonGreen);
    ctx.globalAlpha = 1;
  }
}

export function drawPlate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pressed: boolean,
  lit: boolean
) {
  const T = TILE_SIZE;
  const top = pressed ? y + 13 : y + 11;
  px(ctx, x + 1, y + 14, T - 2, 2, "#1a141f");
  px(ctx, x + 2, top, T - 4, 16 - (top - y), "#2a2230");
  px(ctx, x + 2, top, T - 4, 1, lit ? COLORS.neonGold : "#473a52");
  if (lit) {
    ctx.globalAlpha = 0.3;
    px(ctx, x + 2, top - 1, T - 4, 2, COLORS.neonGold);
    ctx.globalAlpha = 1;
  }
}

export function drawMover(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  wTiles: number,
  t: number
) {
  const w = wTiles * TILE_SIZE;
  px(ctx, x, y, w, 6, "#241a12");
  px(ctx, x, y, w, 1, COLORS.gold);
  px(ctx, x, y + 5, w, 1, "#120c08");
  // chip-tray dots
  for (let i = 0; i < wTiles * 2; i++) {
    px(ctx, x + 3 + i * 8, y + 2, 2, 2, i % 2 ? COLORS.neonRed : COLORS.chip);
  }
  // underside running lights
  if (Math.sin(t * 6) > 0) px(ctx, x + 2, y + 6, 2, 1, COLORS.gold);
  else px(ctx, x + w - 4, y + 6, 2, 1, COLORS.gold);
}

export function drawLaser(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  vertical: boolean,
  on: boolean,
  t: number
) {
  // emitter nodes
  px(ctx, x - 2, y - 2, 4, 4, "#2a3038");
  if (vertical) px(ctx, x - 2, y + len - 2, 4, 4, "#2a3038");
  else px(ctx, x + len - 2, y - 2, 4, 4, "#2a3038");
  if (!on) {
    // idle indicator
    px(ctx, x - 1, y - 1, 2, 2, "#3a2020");
    return;
  }
  const flick = 0.7 + 0.3 * Math.sin(t * 30);
  ctx.globalAlpha = flick;
  ctx.fillStyle = COLORS.laser;
  if (vertical) ctx.fillRect(Math.round(x - 1), Math.round(y), 2, len);
  else ctx.fillRect(Math.round(x), Math.round(y - 1), len, 2);
  ctx.globalAlpha = flick * 0.3;
  ctx.fillStyle = COLORS.laser;
  if (vertical) ctx.fillRect(Math.round(x - 2), Math.round(y), 4, len);
  else ctx.fillRect(Math.round(x), Math.round(y - 2), len, 4);
  ctx.globalAlpha = 1;
}

export function drawSave(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  active: boolean
) {
  // a small roulette-wheel shrine
  const cx = x + 8;
  const cy = y + 10;
  ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 3);
  ctx.fillStyle = COLORS.save;
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  px(ctx, x + 3, y + 14, 10, 2, "#1a2a22");
  // wheel
  ctx.strokeStyle = active ? COLORS.save : "#2f7d57";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.stroke();
  const a = t * 2;
  px(ctx, cx + Math.cos(a) * 5 - 1, cy + Math.sin(a) * 5 - 1, 2, 2, COLORS.save);
  px(ctx, cx - 1, cy - 1, 2, 2, COLORS.goldBright);
}

export function drawSign(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, x + 3, y + 4, 10, 9, "#241a12");
  px(ctx, x + 3, y + 4, 10, 1, COLORS.gold);
  px(ctx, x + 5, y + 6, 6, 1, "#6b6155");
  px(ctx, x + 5, y + 8, 6, 1, "#6b6155");
  px(ctx, x + 5, y + 10, 4, 1, "#6b6155");
  px(ctx, x + 7, y + 13, 2, 3, "#3a2c1e"); // post
}

const SLOT_SYMBOLS = [
  { name: "seven", color: COLORS.neonRed },
  { name: "cherry", color: COLORS.neonRed },
  { name: "bell", color: COLORS.neonGold },
  { name: "diamond", color: COLORS.neonCyan },
];

export function slotSymbolCount() {
  return SLOT_SYMBOLS.length;
}

export function drawSlotReel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  symIndex: number,
  spinning: boolean,
  t: number
) {
  // frame
  px(ctx, x, y - TILE_SIZE, TILE_SIZE, TILE_SIZE * 2, "#1a120a");
  px(ctx, x, y - TILE_SIZE, TILE_SIZE, 2, COLORS.gold);
  px(ctx, x + 1, y - TILE_SIZE + 2, TILE_SIZE - 2, TILE_SIZE * 2 - 4, "#0c0a08");
  const cx = x + 8;
  const cy = y;
  const idx = spinning ? Math.floor(t * 18) % SLOT_SYMBOLS.length : symIndex;
  const sym = SLOT_SYMBOLS[idx];
  if (sym.name === "seven") {
    px(ctx, cx - 3, cy - 4, 6, 2, sym.color);
    px(ctx, cx + 1, cy - 2, 2, 6, sym.color);
  } else if (sym.name === "cherry") {
    px(ctx, cx - 3, cy + 1, 3, 3, sym.color);
    px(ctx, cx + 1, cy + 1, 3, 3, sym.color);
    px(ctx, cx - 1, cy - 3, 1, 4, "#2f7d57");
  } else if (sym.name === "bell") {
    px(ctx, cx - 2, cy - 3, 4, 5, sym.color);
    px(ctx, cx - 3, cy + 2, 6, 1, sym.color);
    px(ctx, cx - 1, cy + 3, 2, 1, sym.color);
  } else {
    px(ctx, cx - 1, cy - 4, 2, 2, sym.color);
    px(ctx, cx - 3, cy - 2, 6, 2, sym.color);
    px(ctx, cx - 1, cy, 2, 2, sym.color);
  }
}

export function drawDoor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: "open" | "locked" | "key" | "ability" | "toll",
  t: number
) {
  const w = TILE_SIZE;
  const h = TILE_SIZE * 2;
  px(ctx, x, y, w, h, "#160f1c");
  px(ctx, x + 1, y + 1, w - 2, h - 2, COLORS.door);
  px(ctx, x + 1, y + 1, w - 2, 1, "#5e4b68");
  // double-door split
  px(ctx, x + w / 2 - 0.5, y + 1, 1, h - 2, "#160f1c");
  let trim: string = COLORS.gold;
  if (state === "locked") trim = COLORS.doorLocked;
  else if (state === "key") trim = COLORS.goldBright;
  else if (state === "ability") trim = COLORS.neonCyan;
  else if (state === "toll") trim = COLORS.chip;
  px(ctx, x + 1, y + 1, w - 2, 2, trim);
  px(ctx, x + 1, y + h - 3, w - 2, 2, trim);
  // emblem
  if (state === "key") {
    px(ctx, x + 6, y + 12, 4, 4, COLORS.goldBright);
    px(ctx, x + 7, y + 16, 2, 4, COLORS.goldBright);
  } else if (state === "locked") {
    px(ctx, x + 6, y + 13, 4, 5, "#1a0c0c");
    px(ctx, x + 7, y + 11, 2, 3, "#1a0c0c");
  } else {
    // glowing keyhole
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3);
    px(ctx, x + 7, y + 14, 2, 3, trim);
    ctx.globalAlpha = 1;
  }
}

export function drawVaultCore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  keys: number,
  needed: number,
  opened: boolean
) {
  const w = TILE_SIZE * 3;
  const h = TILE_SIZE * 4;
  // giant circular vault door
  const cx = x + w / 2;
  const cy = y + h / 2;
  px(ctx, x, y, w, h, "#160f1c");
  ctx.fillStyle = "#241a2e";
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.stroke();
  // rotating inner ring
  const spin = opened ? t * 3 : t * 0.4;
  for (let i = 0; i < 8; i++) {
    const a = spin + (i * Math.PI) / 4;
    px(ctx, cx + Math.cos(a) * 16 - 1, cy + Math.sin(a) * 16 - 1, 2, 2, COLORS.goldDim);
  }
  // key slots
  for (let i = 0; i < needed; i++) {
    const a = -Math.PI / 2 + (i / needed) * Math.PI * 2;
    const filled = i < keys;
    const kx = cx + Math.cos(a) * 10 - 1.5;
    const ky = cy + Math.sin(a) * 10 - 1.5;
    px(ctx, kx, ky, 3, 3, filled ? COLORS.goldBright : "#3a2c1e");
    if (filled) {
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 4 + i);
      px(ctx, kx - 1, ky - 1, 5, 5, COLORS.gold);
      ctx.globalAlpha = 1;
    }
  }
  // center eye
  ctx.globalAlpha = opened ? 1 : 0.5 + 0.3 * Math.sin(t * 2);
  px(ctx, cx - 2, cy - 2, 4, 4, opened ? COLORS.neonPurple : COLORS.neonRed);
  ctx.globalAlpha = 1;
}
