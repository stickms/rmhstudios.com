// ───────────────────────────────────────────────────────────────────────────
// NPC sprites. Each character is drawn from rects with a looping idle anim so
// the casino feels inhabited: the Dealer flips cards, the Janitor sweeps, the
// Slot-Witch's hair drifts, the Guard scans, and The House looms and breathes.
// ───────────────────────────────────────────────────────────────────────────
import type { NpcId } from "../types";

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

// cx = horizontal center, footY = bottom (screen px). t = seconds.
export function drawNpc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  id: NpcId,
  t: number,
  facing: 1 | -1
) {
  switch (id) {
    case "dealer":
      return drawDealer(ctx, cx, footY, t, facing);
    case "janitor":
      return drawJanitor(ctx, cx, footY, t, facing);
    case "witch":
      return drawWitch(ctx, cx, footY, t);
    case "guard":
      return drawGuard(ctx, cx, footY, t);
    case "house":
      return drawHouse(ctx, cx, footY, t);
  }
}

function drawDealer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  t: number,
  f: 1 | -1
) {
  const x = cx - 6;
  const y = footY - 26;
  const bob = Math.sin(t * 2) * 0.5;
  const yy = y + bob;
  // long coat
  px(ctx, x + 2, yy + 10, 8, 14, "#241c2e");
  px(ctx, x + 2, yy + 10, 8, 1, "#3a2f47");
  px(ctx, x + 3, yy + 12, 1, 12, "#170f1f");
  // gold trim
  px(ctx, x + 5, yy + 11, 2, 12, "#7a5e2a");
  px(ctx, x + 5, yy + 11, 2, 1, "#d4a054");
  // arms
  const deal = Math.sin(t * 4) * 2;
  px(ctx, x, yy + 11, 2, 6, "#1d1626");
  px(ctx, x + 10, yy + 11, 2, 6, "#1d1626");
  // dealing hand + card flicker
  px(ctx, x + 10, yy + 16, 2, 1, "#caa886");
  if (Math.sin(t * 4) > 0.3) {
    px(ctx, x + 12 + deal, yy + 14, 3, 2, "#e8e2d0");
    px(ctx, x + 12 + deal, yy + 14, 3, 1, "#c0392b");
  }
  // head + visor
  px(ctx, x + 4, yy + 3, 5, 6, "#caa886");
  px(ctx, x + 4, yy + 3, 5, 2, "#171320"); // hair
  px(ctx, x + 3, yy + 5, 7, 2, "#0c2a1f"); // green dealer visor
  px(ctx, x + 3, yy + 5, 7, 1, "#2f7d57");
  // eyes glow faintly
  px(ctx, x + 4 + (f > 0 ? 1 : 0), yy + 5, 1, 1, "#7fffd0");
  px(ctx, x + 7 - (f > 0 ? 1 : 0), yy + 5, 1, 1, "#7fffd0");
}

function drawJanitor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  t: number,
  _f: 1 | -1
) {
  const x = cx - 5;
  const y = footY - 22;
  const sweep = Math.sin(t * 2.2);
  // hunched coveralls
  px(ctx, x + 2, y + 8, 7, 12, "#33402f");
  px(ctx, x + 2, y + 8, 7, 1, "#475a40");
  px(ctx, x + 3, y + 20, 2, 2, "#1a140f"); // boots
  px(ctx, x + 6, y + 20, 2, 2, "#1a140f");
  // head bowed
  px(ctx, x + 4, y + 3, 4, 5, "#b89a78");
  px(ctx, x + 4, y + 3, 4, 2, "#6b5b48"); // grey cap
  px(ctx, x + 5, y + 5, 1, 1, "#0b0910");
  // arms + broom
  px(ctx, x + 1, y + 9, 2, 5, "#2a3527");
  const bx = x + 10 + sweep * 3;
  const by = y + 12;
  px(ctx, x + 8, y + 9, 2, 4, "#2a3527");
  px(ctx, x + 9, by - 2, Math.max(1, Math.round(bx - (x + 9))), 1, "#6b4a26"); // broom handle
  px(ctx, bx, by, 3, 4, "#caa14a"); // bristles
  px(ctx, bx, by + 4, 3, 1, "#7a5e2a");
  // dust motes
  if (sweep > 0.6) px(ctx, bx + 4, by + 3, 1, 1, "#6b6155");
}

function drawWitch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  t: number
) {
  const x = cx - 6;
  const y = footY - 28;
  // flowing robe
  const sway = Math.sin(t * 1.5) * 1.2;
  px(ctx, x + 3 + sway * 0.3, y + 8, 7, 18, "#2a1840");
  px(ctx, x + 3, y + 24, 8, 2, "#1c0f2c");
  px(ctx, x + 5, y + 10, 3, 14, "#3d2360"); // robe inner glow
  px(ctx, x + 6, y + 12, 1, 10, "#7a4fd0");
  // long hair drifting
  for (let i = 0; i < 6; i++) {
    const hx = x + 2 + i + Math.sin(t * 2 + i) * 0.8;
    px(ctx, hx, y + 2 + i, 1, 6, "#5b3a8f");
  }
  // head
  px(ctx, x + 4, y + 2, 5, 5, "#c4a8d0");
  px(ctx, x + 4, y + 2, 5, 2, "#3a2356");
  // glowing eyes
  const glow = 0.6 + Math.sin(t * 4) * 0.4;
  ctx.globalAlpha = glow;
  px(ctx, x + 5, y + 4, 1, 1, "#e0b0ff");
  px(ctx, x + 7, y + 4, 1, 1, "#e0b0ff");
  ctx.globalAlpha = 1;
  // floating chip orbiting her hand
  const ox = x + 11 + Math.cos(t * 2) * 2;
  const oy = y + 14 + Math.sin(t * 2) * 2;
  px(ctx, ox, oy, 2, 2, "#e7c95a");
}

function drawGuard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  t: number
) {
  const x = cx - 6;
  const y = footY - 26;
  const scan = Math.sin(t * 1.3);
  const f = scan > 0 ? 1 : -1;
  // armored body
  px(ctx, x + 2, y + 8, 9, 14, "#23272e");
  px(ctx, x + 2, y + 8, 9, 1, "#3a414b");
  px(ctx, x + 4, y + 10, 5, 4, "#2f3640"); // chest plate
  px(ctx, x + 5, y + 11, 1, 1, "#c0392b"); // status light
  // legs
  px(ctx, x + 3, y + 22, 3, 3, "#15181c");
  px(ctx, x + 7, y + 22, 3, 3, "#15181c");
  // head + helmet visor
  px(ctx, x + 4, y + 2, 5, 6, "#caa886");
  px(ctx, x + 3, y + 1, 7, 4, "#2a3038"); // helmet
  px(ctx, x + 3, y + 4, 7, 2, "#11141a"); // visor band
  const ex = x + 5 + (f > 0 ? 2 : 0);
  px(ctx, ex, y + 4, 2, 1, "#ff5a5a"); // visor scan light
  // baton arm + flashlight cone
  px(ctx, x + (f > 0 ? 10 : 1), y + 10, 2, 6, "#1a1d22");
  ctx.fillStyle = "rgba(255,240,180,0.10)";
  ctx.beginPath();
  const fx = f > 0 ? x + 12 : x + 1;
  ctx.moveTo(fx, y + 12);
  ctx.lineTo(fx + f * 22, y + 6);
  ctx.lineTo(fx + f * 22, y + 20);
  ctx.closePath();
  ctx.fill();
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  t: number
) {
  const x = cx - 12;
  const y = footY - 48;
  const breathe = Math.sin(t * 1.2) * 1.5;
  // looming shadow cloak
  ctx.fillStyle = "#0b0712";
  ctx.beginPath();
  ctx.moveTo(x + 12, y + breathe);
  ctx.lineTo(x + 24, footY);
  ctx.lineTo(x, footY);
  ctx.closePath();
  ctx.fill();
  // inner robe shimmer
  px(ctx, x + 8, y + 18, 8, 28, "#160d22");
  for (let i = 0; i < 5; i++) {
    const gx = x + 9 + i * 1.5;
    px(ctx, gx, y + 20 + ((t * 12 + i * 7) % 26), 1, 2, "#3a2360");
  }
  // golden mask
  const my = y + 6 + breathe;
  px(ctx, x + 8, my, 8, 9, "#caa14a");
  px(ctx, x + 8, my, 8, 1, "#f3cd7a");
  px(ctx, x + 8, my + 8, 8, 1, "#7a5e2a");
  // hollow eyes
  const glow = 0.5 + Math.sin(t * 3) * 0.5;
  ctx.globalAlpha = glow;
  px(ctx, x + 9, my + 3, 2, 2, "#ff3b5c");
  px(ctx, x + 13, my + 3, 2, 2, "#ff3b5c");
  ctx.globalAlpha = 1;
  // crown of cards
  for (let i = 0; i < 5; i++) {
    px(ctx, x + 7 + i * 2, my - 3 - (i === 2 ? 1 : 0), 2, 3, "#1c1326");
    px(ctx, x + 7 + i * 2, my - 3, 1, 1, "#d4a054");
  }
}
