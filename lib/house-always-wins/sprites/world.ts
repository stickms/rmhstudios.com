// ───────────────────────────────────────────────────────────────────────────
// World rendering: themed parallax backdrops + the tile layer (walls, one-way
// platforms, spikes, crumbling chip-stacks, dash-breakable chip walls, and
// decorative felt / slot machines). Everything is procedural so each wing of
// the casino reads differently without any image assets.
// ───────────────────────────────────────────────────────────────────────────
import { TILE_SIZE, TILE, COLORS } from "../constants";
import { cellAt } from "../collision";
import type { RoomData } from "../types";

type Theme = RoomData["theme"];

const THEME_TINT: Record<Theme, { far: string; wall: string; accent: string }> = {
  lobby: { far: "#120c16", wall: "#1b1322", accent: COLORS.gold },
  poker: { far: "#0c160f", wall: "#122019", accent: COLORS.neonGreen },
  slots: { far: "#16110a", wall: "#1f1810", accent: COLORS.neonGold },
  security: { far: "#0b1014", wall: "#101820", accent: COLORS.neonCyan },
  maintenance: { far: "#0d0d10", wall: "#16161c", accent: "#5a5a66" },
  vault: { far: "#0a0710", wall: "#140d1c", accent: COLORS.neonPurple },
};

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

// Cheap deterministic hash for per-tile variety.
function hash(c: number, r: number): number {
  const n = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  w: number,
  h: number,
  theme: Theme,
  time: number
) {
  const tint = THEME_TINT[theme];
  // vertical gradient
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, tint.far);
  g.addColorStop(1, COLORS.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Parallax far wall pattern (moves slower than camera).
  const px0 = -((camX * 0.3) % 48);
  const py0 = -((camY * 0.3) % 48);
  ctx.globalAlpha = 0.5;
  for (let yy = py0 - 48; yy < h + 48; yy += 48) {
    for (let xx = px0 - 48; xx < w + 48; xx += 48) {
      drawBackMotif(ctx, xx, yy, theme, tint.accent, time);
    }
  }
  ctx.globalAlpha = 1;

  // Soft floor glow vignette per theme
  ctx.fillStyle = "rgba(0,0,0,0.0)";
}

function drawBackMotif(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: Theme,
  accent: string,
  time: number
) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  if (theme === "poker") {
    // suit pips
    px(ctx, x + 22, y + 18, 4, 4, accent);
    px(ctx, x + 20, y + 20, 8, 2, accent);
    px(ctx, x + 23, y + 22, 2, 4, accent);
  } else if (theme === "slots") {
    // 7s and cherries
    px(ctx, x + 20, y + 16, 6, 2, accent);
    px(ctx, x + 24, y + 18, 2, 8, accent);
  } else if (theme === "security") {
    // grid lines / camera dots
    px(ctx, x + 20, y + 20, 8, 1, accent);
    px(ctx, x + 24, y + 16, 1, 8, accent);
    if (Math.sin(time * 2 + x) > 0.9) px(ctx, x + 23, y + 19, 2, 2, "#ff5a5a");
  } else if (theme === "vault") {
    // arcane diamonds
    px(ctx, x + 22, y + 16, 4, 4, accent);
    px(ctx, x + 20, y + 18, 8, 1, accent);
  } else if (theme === "maintenance") {
    px(ctx, x + 18, y + 24, 12, 1, accent);
    px(ctx, x + 30, y + 18, 1, 12, accent);
  } else {
    // lobby: diamond chandelier motif
    px(ctx, x + 22, y + 16, 4, 4, accent);
    px(ctx, x + 24, y + 14, 1, 10, accent);
  }
  ctx.restore();
}

export function drawTiles(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  camX: number,
  camY: number,
  theme: Theme,
  time: number,
  crumbleState: Map<string, number> | null
) {
  const tint = THEME_TINT[theme];
  const startCol = Math.floor(camX / TILE_SIZE) - 1;
  const endCol = Math.ceil((camX + 400) / TILE_SIZE) + 1;
  const startRow = Math.floor(camY / TILE_SIZE) - 1;
  const endRow = Math.ceil((camY + 256) / TILE_SIZE) + 1;

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const ch = cellAt(grid, col, row);
      if (ch === TILE.EMPTY) continue;
      const sx = Math.round(col * TILE_SIZE - camX);
      const sy = Math.round(row * TILE_SIZE - camY);
      switch (ch) {
        case TILE.SOLID:
          drawSolid(ctx, sx, sy, col, row, grid, tint);
          break;
        case TILE.ONEWAY:
          drawOneWay(ctx, sx, sy, tint);
          break;
        case TILE.SPIKE:
          drawSpike(ctx, sx, sy, false);
          break;
        case TILE.SPIKE_DOWN:
          drawSpike(ctx, sx, sy, true);
          break;
        case TILE.CRUMBLE: {
          const k = `${col},${row}`;
          const tleft = crumbleState?.get(k);
          drawCrumble(ctx, sx, sy, tleft);
          break;
        }
        case TILE.CHIP_WALL:
          drawChipWall(ctx, sx, sy, time);
          break;
        case TILE.DECO_FELT:
          drawFelt(ctx, sx, sy);
          break;
        case TILE.DECO_SLOT:
          drawSlotMachine(ctx, sx, sy, time);
          break;
      }
    }
  }
}

function drawSolid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: number,
  row: number,
  grid: string[],
  tint: { wall: string; accent: string }
) {
  const T = TILE_SIZE;
  px(ctx, x, y, T, T, COLORS.solid);
  // inner panel
  px(ctx, x + 1, y + 1, T - 2, T - 2, tint.wall);
  // top edge highlight if exposed
  if (cellAt(grid, col, row - 1) !== TILE.SOLID) {
    px(ctx, x, y, T, 2, COLORS.solidTop);
    px(ctx, x, y, T, 1, tint.accent);
    ctx.globalAlpha = 0.25;
    px(ctx, x, y, T, 1, "#ffffff");
    ctx.globalAlpha = 1;
  }
  // side shadow
  px(ctx, x, y, 1, T, COLORS.solidEdge);
  // occasional gold rivet / pinstripe
  const h = hash(col, row);
  if (h > 0.86) {
    px(ctx, x + 6, y + 6, 2, 2, tint.accent);
    ctx.globalAlpha = 0.4;
    px(ctx, x + 6, y + 6, 2, 2, "#000");
    ctx.globalAlpha = 1;
  } else if (h < 0.12) {
    ctx.globalAlpha = 0.5;
    px(ctx, x + 3, y + 2, 1, T - 4, COLORS.solidEdge);
    ctx.globalAlpha = 1;
  }
}

function drawOneWay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tint: { accent: string }
) {
  const T = TILE_SIZE;
  px(ctx, x, y, T, 3, "#2a2230");
  px(ctx, x, y, T, 1, tint.accent);
  px(ctx, x + 2, y + 3, 2, 1, "#1a141f");
  px(ctx, x + T - 4, y + 3, 2, 1, "#1a141f");
}

function drawSpike(ctx: CanvasRenderingContext2D, x: number, y: number, down: boolean) {
  const T = TILE_SIZE;
  const base = down ? y : y + T;
  ctx.fillStyle = COLORS.hazard;
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 4;
    ctx.beginPath();
    if (!down) {
      ctx.moveTo(sx, base);
      ctx.lineTo(sx + 2, base - 7);
      ctx.lineTo(sx + 4, base);
    } else {
      ctx.moveTo(sx, base);
      ctx.lineTo(sx + 2, base + 7);
      ctx.lineTo(sx + 4, base);
    }
    ctx.closePath();
    ctx.fill();
  }
  // glow tips
  ctx.fillStyle = COLORS.hazardGlow;
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 4 + 1;
    px(ctx, sx, down ? base + 5 : base - 7, 2, 2, COLORS.hazardGlow);
  }
}

function drawCrumble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeLeft: number | undefined
) {
  const T = TILE_SIZE;
  // shaking once triggered
  let sh = 0;
  if (timeLeft !== undefined) sh = Math.round((Math.random() - 0.5) * 2);
  px(ctx, x + sh, y, T, T, "#3a2c1e");
  px(ctx, x + 1 + sh, y + 1, T - 2, T - 2, "#4a3826");
  px(ctx, x + sh, y, T, 1, "#6b4e2e");
  // chip stripes
  px(ctx, x + 2 + sh, y + 5, T - 4, 1, "#2a1f15");
  px(ctx, x + 2 + sh, y + 10, T - 4, 1, "#2a1f15");
  // cracks
  ctx.strokeStyle = "#1a1109";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 4 + sh, y + 1);
  ctx.lineTo(x + 7 + sh, y + 8);
  ctx.lineTo(x + 5 + sh, y + 15);
  ctx.stroke();
}

function drawChipWall(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const T = TILE_SIZE;
  // stacked poker chips — visibly destructible
  const cols = ["#c0392b", "#2f7d57", "#1f4f8b", "#caa14a"];
  for (let r = 0; r < 4; r++) {
    const c = cols[(r + Math.floor(x / T)) % cols.length];
    px(ctx, x + 1, y + r * 4, T - 2, 3, c);
    px(ctx, x + 1, y + r * 4, T - 2, 1, "#ffffff22");
    px(ctx, x + 3, y + r * 4 + 1, 1, 1, "#00000044");
    px(ctx, x + T - 4, y + r * 4 + 1, 1, 1, "#00000044");
  }
  // shimmer hint that it's breakable
  const sh = (Math.sin(time * 3 + x) + 1) / 2;
  ctx.globalAlpha = 0.15 * sh;
  px(ctx, x, y, T, T, "#ffffff");
  ctx.globalAlpha = 1;
}

function drawFelt(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const T = TILE_SIZE;
  px(ctx, x, y, T, T, COLORS.feltDark);
  px(ctx, x + 1, y + 1, T - 2, T - 2, COLORS.felt);
  px(ctx, x + 3, y + 3, T - 6, T - 6, COLORS.feltDark);
}

function drawSlotMachine(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const T = TILE_SIZE;
  px(ctx, x + 2, y, T - 4, T, "#241a12");
  px(ctx, x + 2, y, T - 4, 2, "#caa14a");
  // reel window
  px(ctx, x + 4, y + 4, T - 8, 6, "#0c0a08");
  const sym = ["#c0392b", "#caa14a", "#3fae6b"];
  for (let i = 0; i < 3; i++) {
    const s = sym[(Math.floor(time * 6) + i) % 3];
    px(ctx, x + 5 + i * 2, y + 5 + ((Math.floor(time * 20) + i) % 4), 1, 2, s);
  }
  px(ctx, x + T - 4, y + 6, 1, 3, "#6b4e2e"); // lever
}
