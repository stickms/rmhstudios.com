// ───────────────────────────────────────────────────────────────────────────
// Player sprite — a worn gambler in a dark suit, drawn pixel-by-pixel with
// hand-built animation cycles (idle breathe, run, jump/fall, dash, wall-slide,
// double-jump spin). No external assets: every frame is composed from rects so
// the animation stays crisp at any scale.
// ───────────────────────────────────────────────────────────────────────────
import { COLORS } from "../constants";

export type PlayerAnim =
  | "idle"
  | "run"
  | "jump"
  | "fall"
  | "dash"
  | "wall"
  | "spin"
  | "down";

export interface PlayerVisual {
  anim: PlayerAnim;
  facing: 1 | -1;
  animTime: number; // seconds in current anim
  blinkTimer: number;
  invuln: boolean;
}

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

// Draw the gambler. (ox, oy) is the top-left of the 10x14 hitbox in screen px.
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  v: PlayerVisual
) {
  const f = v.facing; // 1 right, -1 left
  // Visual canvas is 12x16; align feet to hitbox bottom, center horizontally.
  const baseX = ox - 1;
  const baseY = oy - 2;

  let bob = 0;
  let legPhase = 0;
  let armPhase = 0;
  let lean = 0;
  let rot = 0;

  switch (v.anim) {
    case "idle": {
      bob = Math.sin(v.animTime * 3) * 0.5;
      break;
    }
    case "run": {
      const t = v.animTime * 12;
      legPhase = Math.sin(t);
      armPhase = Math.sin(t + Math.PI);
      bob = Math.abs(Math.sin(t)) * 0.6 - 0.3;
      lean = 1;
      break;
    }
    case "jump": {
      lean = 0.5;
      legPhase = -0.6;
      break;
    }
    case "fall": {
      lean = 0.3;
      legPhase = 0.4;
      armPhase = -0.6;
      break;
    }
    case "dash": {
      lean = 2.2;
      legPhase = 1;
      break;
    }
    case "wall": {
      lean = -0.6;
      legPhase = 0.3;
      break;
    }
    case "down": {
      bob = 1.5;
      break;
    }
    case "spin": {
      // full somersault for the double jump
      rot = (v.animTime / 0.42) * Math.PI * 2;
      break;
    }
  }

  ctx.save();
  if (v.invuln && Math.floor(v.animTime * 20) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  if (v.anim === "spin") {
    ctx.translate(baseX + 6, baseY + 8);
    ctx.rotate(f === 1 ? rot : -rot);
    ctx.translate(-6, -8);
    drawBody(ctx, 0, 0, 1, v, 0, 0, 1, 0);
    ctx.restore();
    return;
  }

  drawBody(ctx, baseX, baseY + bob, f, v, legPhase, armPhase, 1, lean);
  ctx.restore();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  f: number,
  v: PlayerVisual,
  legPhase: number,
  armPhase: number,
  _scale: number,
  lean: number
) {
  const suit = COLORS.playerSuit;
  const suitDark = COLORS.playerSuitDark;
  const skin = COLORS.skin;
  const skinDark = COLORS.skinDark;
  const tie = COLORS.playerTie;
  const hair = "#171320";

  const leanX = lean * f;

  // ── Legs (animated) ──
  const legY = y + 11;
  const frontLeg = Math.round(legPhase * 2);
  const backLeg = Math.round(-legPhase * 2);
  // back leg (darker)
  px(ctx, x + 4 - backLeg * f * 0.0 + (f < 0 ? 0 : 0), legY, 2, 4, suitDark);
  px(ctx, x + 5 + backLeg, legY, 2, 4, suitDark);
  // front leg
  px(ctx, x + 5 + frontLeg, legY, 2, 4, suit);
  // shoes
  px(ctx, x + 4 + backLeg + (f > 0 ? 0 : 1) * f, legY + 4, 3, 1, "#0b0910");
  px(ctx, x + 5 + frontLeg + (f > 0 ? 1 : -1), legY + 4, 3, 1, "#0b0910");

  // ── Torso / suit jacket ──
  px(ctx, x + 3 + leanX, y + 5, 6, 6, suit);
  px(ctx, x + 3 + leanX, y + 5, 6, 1, "#3a3450"); // shoulder highlight
  // lapels + shirt
  px(ctx, x + 5 + leanX, y + 5, 2, 5, "#bdb1c4");
  px(ctx, x + 5 + leanX, y + 6, 2, 3, tie); // tie
  px(ctx, x + 3 + leanX, y + 5, 1, 5, suitDark);
  px(ctx, x + 8 + leanX, y + 5, 1, 5, suitDark);

  // ── Arms (animated swing) ──
  const armY = y + 6;
  const aSwing = Math.round(armPhase * 2);
  if (v.anim === "wall") {
    // reaching up against the wall
    px(ctx, x + (f > 0 ? 9 : 2), y + 3, 2, 4, suit);
    px(ctx, x + (f > 0 ? 2 : 9), y + 7, 2, 3, suit);
  } else if (v.anim === "dash") {
    // both arms streaked back
    px(ctx, x + (f > 0 ? 1 : 9), armY, 3, 2, suit);
  } else {
    px(ctx, x + 2 + leanX, armY + aSwing, 2, 4, suitDark); // back arm
    px(ctx, x + 8 + leanX, armY - aSwing, 2, 4, suit); // front arm
    // hands
    px(ctx, x + 2 + leanX, armY + aSwing + 4, 2, 1, skin);
    px(ctx, x + 8 + leanX, armY - aSwing + 4, 2, 1, skin);
  }

  // ── Head ──
  const hx = x + 3 + leanX;
  const hy = y;
  px(ctx, hx + 1, hy, 5, 5, skin); // face
  px(ctx, hx + 1, hy + 4, 5, 1, skinDark); // jaw shadow
  px(ctx, hx + 1, hy, 5, 2, hair); // hair top
  px(ctx, hx + (f > 0 ? 0 : 5), hy + 1, 1, 2, hair); // sideburn
  // eyes (blink)
  const blinking = v.blinkTimer < 0.08;
  if (!blinking) {
    const ex = f > 0 ? hx + 4 : hx + 1;
    px(ctx, ex, hy + 2, 1, 1, "#0b0910");
    px(ctx, ex - f, hy + 2, 1, 1, "#0b0910");
  } else {
    px(ctx, hx + 1, hy + 2, 5, 1, skinDark);
  }
}

// A small standalone draw for menus / ability-get flashes.
export function drawPlayerPortrait(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number
) {
  drawBody(
    ctx,
    x,
    y,
    1,
    { anim: "idle", facing: 1, animTime: 0, blinkTimer: 1, invuln: false },
    0,
    0,
    1,
    0
  );
}
