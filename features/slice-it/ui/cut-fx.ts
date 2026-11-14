/**
 * Slice It — what a struck note does: it is cut along a random line and shatters.
 *
 * The cut is the game's own device (the wordmark, the 8° slice) turned into an event:
 * every strike rolls its OWN angle, offset and spin, so no two notes break the same
 * way. The two halves slide apart along the cut's normal and tumble in opposite
 * directions; glass shards leave on both sides, sparks stream out along the blade, and
 * a short ring leaves the receptor. A hairline of paper runs down the crack for the
 * first few frames.
 *
 * Everything here is pure maths plus canvas drawing, with no React and no module state,
 * so the renderer owns when it runs. Particles are integrated against wall-clock time by
 * the caller (`step` = frames at 60 Hz), the same convention as the dot particles beside
 * it, so a 144 Hz display does not play it 2.4x fast.
 *
 * Reduced Flash and the effect-intensity dial are honoured by the CALLER passing
 * `flash: false` / a smaller `scale`: this file never reads settings.
 */

/** One strike's own randomness. Rolled once, when the note is first seen struck. */
export interface Cut {
  /** Direction of the cut line, radians. Any angle: 0 is along the lane. */
  angle: number;
  /** How far the line sits off the disc's centre, as a fraction of its radius. */
  offset: number;
  /** How far each half tumbles, radians (the halves turn in opposite directions). */
  spin: number;
  /** The slice's `hitTime`, to tell a new strike on a recycled slice object. */
  at: number;
}

export type FxKind =
  | 'shard'
  | 'spark'
  | 'dust'
  | 'ring';

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  /** 1 → 0. */
  life: number;
  /** Life lost per 60 Hz frame. */
  decay: number;
  /** Shard scale, spark line width, dust edge or ring diameter, px. */
  size: number;
  color: string;
  /** Shards: a flat run of x,y pairs around the origin. */
  pts?: number[];
  /** Shards: an outline colour, so a coloured shard reads as a cut edge. */
  edge?: string;
}

export interface FxInks {
  /** The note's lane ink. */
  color: string;
  paper: string;
  ink: string;
  /** The other spot ink, for sparks. */
  accent: string;
}

/** A hard cap on live pieces, so a stream of strikes cannot grow the list unbounded. */
export const MAX_FX = 260;

/** How strong a judgement's burst is, 0–1. A clean hit breaks harder than a loose one. */
export function strengthOf(
  judgement:
    | string
    | undefined,
): number {
  switch (
    judgement
  ) {
    case 'MARVELOUS':
      return 1;
    case 'PERFECT':
      return 0.85;
    case 'GREAT':
      return 0.6;
    case 'GOOD':
      return 0.4;
    default:
      return 0.6;
  }
}

const TAU =
  Math.PI *
  2;

/** Roll a strike's cut. */
export function rollCut(
  at: number,
  rnd: () => number = Math.random,
): Cut {
  const spinMag =
    0.22 +
    rnd() *
      0.38;
  return {
    // Any angle, uniformly: that is the whole point.
    angle:
      rnd() *
      Math.PI,
    offset:
      (rnd() -
        0.5) *
      0.36,
    spin:
      rnd() <
      0.5
        ? spinMag
        : -spinMag,
    at,
  };
}

/**
 * Break a struck note into shards, sparks and dust at (x, y).
 *
 * @param size  The note's diameter, px.
 * @param level Judgement strength, 0–1 ({@link strengthOf}).
 * @param scale Overall dial, 0–1: the player's effect intensity, lowered further on a
 *              weak renderer. 0 spawns nothing.
 * @param flash Whether bright, screen-lighting pieces (sparks, the ring) may play.
 */
export function spawnCutFx(
  out: Fx[],
  cut: Cut,
  x: number,
  y: number,
  size: number,
  inks: FxInks,
  level: number,
  scale: number,
  flash: boolean,
  rnd: () => number = Math.random,
): void {
  if (
    scale <=
      0 ||
    out.length >=
      MAX_FX
  )
    return;
  const k =
    size /
    56; // the tuning below is for a 56px disc
  const dx =
    Math.cos(
      cut.angle,
    );
  const dy =
    Math.sin(
      cut.angle,
    );
  const nx =
    -dy;
  const ny =
    dx;
  const budget =
    Math.max(
      0.15,
      level,
    ) *
    scale;
  const count =
    (
      base: number,
    ) =>
      Math.max(
        1,
        Math.round(
          base *
            budget,
        ),
      );

  // Glass: irregular, sharp-cornered pieces, thrown to both sides of the cut. Each
  // keeps a long spike, so they read as splinters rather than confetti.
  for (
    let i = 0;
    i <
    count(
      13,
    );
    i++
  ) {
    const side =
      rnd() <
      0.5
        ? -1
        : 1;
    // Mostly off the blade, with a spread, and a share along it.
    const heading =
      Math.atan2(
        ny *
          side,
        nx *
          side,
      ) +
      (rnd() -
        0.5) *
        1.9;
    const speed =
      (3 +
        rnd() *
          6.5) *
      k *
      (0.7 +
        0.5 *
          level);
    const s =
      size *
      (0.1 +
        rnd() *
          0.2);
    const a1 =
      1.7 +
      rnd() *
        1.1;
    const a2 =
      a1 +
      1.5 +
      rnd() *
        1.4;
    const quad =
      rnd() <
      0.35;
    const pts =
      [
        s,
        0,
        Math.cos(
          a1,
        ) *
          s *
          (0.4 +
            rnd() *
              0.4),
        Math.sin(
          a1,
        ) *
          s *
          (0.4 +
            rnd() *
              0.4),
        Math.cos(
          a2,
        ) *
          s *
          (0.3 +
            rnd() *
              0.3),
        Math.sin(
          a2,
        ) *
          s *
          (0.3 +
            rnd() *
              0.3),
      ];
    if (
      quad
    )
      pts.push(
        Math.cos(
          (a1 +
            a2) /
            2 +
            2.5,
        ) *
          s *
          0.35,
        Math.sin(
          (a1 +
            a2) /
            2 +
            2.5,
        ) *
          s *
          0.35,
      );
    const pick =
      rnd();
    out.push(
      {
        kind: 'shard',
        // Born along the cut, not at one point.
        x:
          x +
          dx *
            (rnd() -
              0.5) *
            size *
            0.8,
        y:
          y +
          dy *
            (rnd() -
              0.5) *
            size *
            0.8,
        vx:
          Math.cos(
            heading,
          ) *
          speed,
        vy:
          Math.sin(
            heading,
          ) *
          speed,
        rot:
          rnd() *
          TAU,
        vr:
          (rnd() -
            0.5) *
          0.7,
        life: 1,
        decay:
          0.034 +
          rnd() *
            0.026,
        size: s,
        color:
          pick <
          0.62
            ? inks.color
            : pick <
                0.88
              ? inks.paper
              : inks.accent,
        pts,
        edge:
          pick <
          0.62
            ? inks.paper
            : undefined,
      },
    );
  }

  // Sparks: thin streaks off the blade, both ways along the cut.
  if (
    flash
  ) {
    for (
      let i = 0;
      i <
      count(
        16,
      );
      i++
    ) {
      const way =
        rnd() <
        0.5
          ? -1
          : 1;
      const heading =
        Math.atan2(
          dy *
            way,
          dx *
            way,
        ) +
        (rnd() -
          0.5) *
          0.9;
      const speed =
        (7 +
          rnd() *
            13) *
        k *
        (0.7 +
          0.4 *
            level);
      out.push(
        {
          kind: 'spark',
          x:
            x +
            dx *
              (rnd() -
                0.5) *
              size *
              0.7,
          y:
            y +
            dy *
              (rnd() -
                0.5) *
              size *
              0.7,
          vx:
            Math.cos(
              heading,
            ) *
            speed,
          vy:
            Math.sin(
              heading,
            ) *
            speed,
          rot: 0,
          vr: 0,
          life: 1,
          decay:
            0.06 +
            rnd() *
              0.06,
          size:
            1 +
            rnd() *
              1.6,
          color:
            rnd() <
            0.55
              ? inks.paper
              : rnd() <
                  0.5
                ? inks.accent
                : inks.color,
        },
      );
    }
  }

  // Dust: a few square flecks, in the game's hard-edged print.
  for (
    let i = 0;
    i <
    count(
      10,
    );
    i++
  ) {
    const heading =
      rnd() *
      TAU;
    const speed =
      (1.5 +
        rnd() *
          5) *
      k;
    out.push(
      {
        kind: 'dust',
        x:
          x +
          (rnd() -
            0.5) *
            size *
            0.6,
        y:
          y +
          (rnd() -
            0.5) *
            size *
            0.6,
        vx:
          Math.cos(
            heading,
          ) *
          speed,
        vy:
          Math.sin(
            heading,
          ) *
          speed,
        rot:
          rnd() *
          TAU,
        vr:
          (rnd() -
            0.5) *
          0.3,
        life: 1,
        decay:
          0.04 +
          rnd() *
            0.04,
        size:
          2 +
          rnd() *
            3,
        color:
          rnd() <
          0.5
            ? inks.color
            : inks.paper,
      },
    );
  }

  // The shock: one ring leaving the receptor, quick and hard-edged.
  if (
    flash &&
    level >=
      0.5
  ) {
    out.push(
      {
        kind: 'ring',
        x,
        y,
        vx: 0,
        vy: 0,
        rot: 0,
        vr: 0,
        life: 1,
        decay: 0.085,
        size,
        color:
          inks.paper,
      },
    );
  }
}

/** Advance every piece by `step` 60 Hz frames, dropping the ones that are gone. */
export function stepFx(
  list: Fx[],
  step: number,
): void {
  for (
    let i =
      list.length -
      1;
    i >=
    0;
    i--
  ) {
    const p =
      list[
        i
      ];
    p.life -=
      p.decay *
      step;
    if (
      p.life <=
      0
    ) {
      // Swap-remove: order does not matter, and splice would shift the tail.
      list[
        i
      ] =
        list[
          list.length -
            1
        ];
      list.pop();
      continue;
    }
    p.x +=
      p.vx *
      step;
    p.y +=
      p.vy *
      step;
    p.rot +=
      p.vr *
      step;
    if (
      p.kind ===
      'spark'
    ) {
      p.vx *=
        Math.pow(
          0.88,
          step,
        );
      p.vy *=
        Math.pow(
          0.88,
          step,
        );
    } else if (
      p.kind ===
      'shard'
    ) {
      p.vx *=
        Math.pow(
          0.915,
          step,
        );
      p.vy *=
        Math.pow(
          0.915,
          step,
        );
      p.vy +=
        0.14 *
        step;
    } else if (
      p.kind ===
      'dust'
    ) {
      p.vx *=
        Math.pow(
          0.9,
          step,
        );
      p.vy *=
        Math.pow(
          0.9,
          step,
        );
      p.vy +=
        0.1 *
        step;
    }
  }
}

/** Draw every live piece. Leaves the context as it found it. */
export function drawFx(
  ctx: CanvasRenderingContext2D,
  list: Fx[],
): void {
  if (
    list.length ===
    0
  )
    return;
  ctx.save();
  // Nothing here is blurred: a shadow would turn each piece into a soft smear.
  ctx.shadowBlur = 0;
  ctx.lineJoin =
    'miter';
  for (const p of list) {
    switch (
      p.kind
    ) {
      case 'shard': {
        const pts =
          p.pts!;
        ctx.save();
        ctx.translate(
          p.x,
          p.y,
        );
        ctx.rotate(
          p.rot,
        );
        ctx.globalAlpha =
          Math.min(
            1,
            p.life *
              1.8,
          );
        ctx.beginPath();
        ctx.moveTo(
          pts[0],
          pts[1],
        );
        for (
          let i = 2;
          i <
          pts.length;
          i += 2
        )
          ctx.lineTo(
            pts[
              i
            ],
            pts[
              i +
                1
            ],
          );
        ctx.closePath();
        ctx.fillStyle =
          p.color;
        ctx.fill();
        if (
          p.edge
        ) {
          ctx.lineWidth = 1;
          ctx.strokeStyle =
            p.edge;
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'spark': {
        // A streak along the velocity: longer while it is fast.
        const trail =
          1.6 +
          Math.hypot(
            p.vx,
            p.vy,
          ) *
            0.5;
        const mag =
          Math.hypot(
            p.vx,
            p.vy,
          ) ||
          1;
        ctx.globalAlpha =
          Math.min(
            1,
            p.life *
              1.5,
          );
        ctx.strokeStyle =
          p.color;
        ctx.lineWidth =
          Math.max(
            0.6,
            p.size *
              (0.4 +
                0.6 *
                  p.life),
          );
        ctx.lineCap =
          'butt';
        ctx.beginPath();
        ctx.moveTo(
          p.x -
            (p.vx /
              mag) *
              trail,
          p.y -
            (p.vy /
              mag) *
              trail,
        );
        ctx.lineTo(
          p.x,
          p.y,
        );
        ctx.stroke();
        break;
      }
      case 'dust': {
        ctx.globalAlpha =
          p.life *
          p.life;
        ctx.fillStyle =
          p.color;
        ctx.save();
        ctx.translate(
          p.x,
          p.y,
        );
        ctx.rotate(
          p.rot,
        );
        const s =
          p.size *
          (0.5 +
            0.5 *
              p.life);
        ctx.fillRect(
          -s /
            2,
          -s /
            2,
          s,
          s,
        );
        ctx.restore();
        break;
      }
      case 'ring': {
        const t =
          1 -
          p.life;
        ctx.globalAlpha =
          p.life *
          0.85;
        ctx.strokeStyle =
          p.color;
        ctx.lineWidth =
          1 +
          3.5 *
            p.life;
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y,
          (p.size /
            2) *
            (1.05 +
              t *
                1.7),
          0,
          TAU,
        );
        ctx.stroke();
        break;
      }
    }
  }
  ctx.restore();
}
