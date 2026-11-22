import type { VoidBreakerEngine } from './game';
import {
  enemyMark,
  HEART_MARK,
  SHARD_MARK,
  type TypeMark,
} from './assist-profile';

/** Where a world point lands on the game canvas (both renderers provide it). */
export type WorldToCanvas =
  (
    x: number,
    y: number,
    game: VoidBreakerEngine,
  ) => {
    x: number;
    y: number;
  } | null;

function drawMark(
  ctx: CanvasRenderingContext2D,
  at: {
    x: number;
    y: number;
  },
  r: number,
  mark: TypeMark,
): void {
  ctx.setLineDash(
    [
      ...mark.dash,
    ],
  );
  ctx.lineWidth = 2;
  ctx.strokeStyle =
    '#ffffff';
  ctx.beginPath();
  ctx.arc(
    at.x,
    at.y,
    r,
    0,
    Math.PI *
      2,
  );
  ctx.stroke();
  ctx.setLineDash(
    [],
  );
  ctx.lineWidth = 3;
  ctx.strokeStyle =
    '#000000';
  ctx.strokeText(
    mark.letter,
    at.x,
    at.y -
      r -
      3,
  );
  ctx.fillStyle =
    '#ffffff';
  ctx.fillText(
    mark.letter,
    at.x,
    at.y -
      r -
      3,
  );
}

/**
 * Colour-safe overlay: an outline pattern and a letter on every enemy, shard and
 * heart, so no type is told apart by hue alone. Drawn on a canvas laid over the
 * game canvas, so it works for both renderers; a no-op cost when colour-safe is off
 * because the loop only calls it then.
 */
export function drawColorSafeMarkers(
  ctx: CanvasRenderingContext2D,
  game: VoidBreakerEngine,
  toCanvas: WorldToCanvas,
  width: number,
  height: number,
): void {
  ctx.clearRect(
    0,
    0,
    width,
    height,
  );
  ctx.font =
    'bold 12px monospace';
  ctx.textAlign =
    'center';
  ctx.textBaseline =
    'bottom';
  const px =
    width /
    1280;
  for (const e of game.enemies) {
    if (
      !e.active ||
      e.anim !==
        'alive'
    )
      continue;
    const at =
      toCanvas(
        e.x,
        e.y,
        game,
      );
    if (
      !at
    )
      continue;
    drawMark(
      ctx,
      at,
      Math.max(
        8,
        e.radius *
          1.2 *
          px,
      ),
      enemyMark(
        e.type,
        e.isBoss,
      ),
    );
  }
  for (const s of game.shards) {
    if (
      !s.active ||
      s.collected
    )
      continue;
    const at =
      toCanvas(
        s.x,
        s.y,
        game,
      );
    if (
      at
    )
      drawMark(
        ctx,
        at,
        7,
        SHARD_MARK,
      );
  }
  for (const h of game.heartPickups) {
    if (
      !h.active
    )
      continue;
    const at =
      toCanvas(
        h.x,
        h.y,
        game,
      );
    if (
      at
    )
      drawMark(
        ctx,
        at,
        9,
        HEART_MARK,
      );
  }
}
