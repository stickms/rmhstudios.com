/**
 * Render interpolation for Altair's fixed 60Hz simulation.
 *
 * ## The problem
 *
 * `game-loop.ts` advances the world in whole `FIXED_DT` (1/60s) steps and then
 * renders the world exactly as the last step left it. At 60Hz that is one step
 * per frame and looks fine. At any other refresh rate it does not:
 *
 *   144Hz  steps per frame go 0,1,0,0,1,0,1,0,0,1,…  — every entity advances in
 *          uneven strides, 2–3 frames frozen then a jump
 *   240Hz  0,0,0,1,0,0,0,1,…                          — the world moves at an
 *          effective 60fps on a 240Hz panel
 *
 * and because the camera follows the player at FRAME rate (`updateCamera`), it
 * smoothly chases a target that is itself hitching, so the whole screen judders
 * rather than just the sprites. That is the "cutting" a high-refresh display
 * shows on a fixed-timestep game.
 *
 * ## The fix
 *
 * The standard one: remember where every entity was before the latest step,
 * and draw each one at `prev + (current − prev) · alpha`, where `alpha` is how
 * far real time has run into the NEXT step (`accumulator / FIXED_DT`). Motion is
 * then continuous at every refresh rate, for at most one step (16.7ms) of visual
 * latency — the same trade every fixed-timestep engine makes.
 *
 * Gameplay is untouched. The blend is applied immediately before the camera
 * update + render and undone immediately after, so collision, AI, damage and
 * the next step all see the true simulated positions. Previous positions live
 * in a WeakMap rather than on the entities, so nothing new is serialised and a
 * despawned entity's entry is collected with it.
 */

interface Positioned {
  x: number;
  y: number;
}

/** The world collections this blends — the ones the renderer draws by position. */
interface InterpolatedWorld {
  player: Positioned;
  enemies: readonly Positioned[];
  projectiles: readonly Positioned[];
  pickups: readonly Positioned[];
  particles: readonly Positioned[];
  meleeHitboxes: readonly Positioned[];
  auras: readonly Positioned[];
  summons: readonly Positioned[];
  pools: readonly Positioned[];
}

/**
 * Anything that moved further than this in ONE step was placed, not moved
 * (a boss teleport, a spawn). Movement here is ~200px/s ≈ 3.3px per step, so
 * the guard sits an order of magnitude above the fastest legitimate motion.
 */
const TELEPORT_PX = 48;

export class RenderInterpolator {
  private prev =
    new WeakMap<
      Positioned,
      {
        x: number;
        y: number;
      }
    >();
  /** Entities whose position is currently blended, with their true position. */
  private saved: Positioned[] =
    [];
  private savedX: number[] =
    [];
  private savedY: number[] =
    [];

  /** Call at the top of every fixed step, before anything moves. */
  capture(
    world: InterpolatedWorld,
  ): void {
    this.captureOne(
      world.player,
    );
    this.captureList(
      world.enemies,
    );
    this.captureList(
      world.projectiles,
    );
    this.captureList(
      world.pickups,
    );
    this.captureList(
      world.particles,
    );
    this.captureList(
      world.meleeHitboxes,
    );
    this.captureList(
      world.auras,
    );
    this.captureList(
      world.summons,
    );
    this.captureList(
      world.pools,
    );
  }

  // The walk over the world used to be one `forEachEntity(world, fn)` that built an array of the eight lists and a
  // closure on every call (twice a step plus once a frame). Plain loops keep the same order and allocate nothing.
  private captureOne(
    e: Positioned,
  ): void {
    const p =
      this.prev.get(
        e,
      );
    if (
      p
    ) {
      p.x =
        e.x;
      p.y =
        e.y;
    } else {
      this.prev.set(
        e,
        {
          x: e.x,
          y: e.y,
        },
      );
    }
  }

  private captureList(
    list: readonly Positioned[],
  ): void {
    for (
      let i = 0;
      i <
      list.length;
      i++
    )
      this.captureOne(
        list[
          i
        ],
      );
  }

  /**
   * Move every entity to its blended position for drawing. Entities spawned
   * during the latest step have no previous position and draw where they are.
   * Must be paired with {@link restore}.
   */
  apply(
    world: InterpolatedWorld,
    alpha: number,
  ): void {
    const a =
      alpha <
      0
        ? 0
        : alpha >
            1
          ? 1
          : alpha;
    this.blendOne(
      world.player,
      a,
    );
    this.blendList(
      world.enemies,
      a,
    );
    this.blendList(
      world.projectiles,
      a,
    );
    this.blendList(
      world.pickups,
      a,
    );
    this.blendList(
      world.particles,
      a,
    );
    this.blendList(
      world.meleeHitboxes,
      a,
    );
    this.blendList(
      world.auras,
      a,
    );
    this.blendList(
      world.summons,
      a,
    );
    this.blendList(
      world.pools,
      a,
    );
  }

  private blendOne(
    e: Positioned,
    a: number,
  ): void {
    const p =
      this.prev.get(
        e,
      );
    if (
      !p
    )
      return;
    const dx =
      e.x -
      p.x;
    const dy =
      e.y -
      p.y;
    if (
      dx ===
        0 &&
      dy ===
        0
    )
      return;
    if (
      dx *
        dx +
        dy *
          dy >
      TELEPORT_PX *
        TELEPORT_PX
    )
      return;
    this.saved.push(
      e,
    );
    this.savedX.push(
      e.x,
    );
    this.savedY.push(
      e.y,
    );
    e.x =
      p.x +
      dx *
        a;
    e.y =
      p.y +
      dy *
        a;
  }

  private blendList(
    list: readonly Positioned[],
    a: number,
  ): void {
    for (
      let i = 0;
      i <
      list.length;
      i++
    )
      this.blendOne(
        list[
          i
        ],
        a,
      );
  }

  /** Put every blended entity back at its simulated position. */
  restore(): void {
    const {
      saved,
      savedX,
      savedY,
    } =
      this;
    for (
      let i = 0;
      i <
      saved.length;
      i++
    ) {
      saved[
        i
      ].x =
        savedX[
          i
        ];
      saved[
        i
      ].y =
        savedY[
          i
        ];
    }
    saved.length = 0;
    savedX.length = 0;
    savedY.length = 0;
  }
}
