/**
 * The lane, in three dimensions, on a real rigid-body solver.
 *
 * Rapier (`@react-three/rapier`) simulates the whole thing at true scale — a
 * 60-foot lane, a 7kg ball, ten 1.5kg pins — because the point of the mechanic
 * is that the count is *earned*. A ball that clips the head pin thin leaves the
 * 7–10; one that comes into the pocket at an angle carries the deck. Nothing
 * here scripts an outcome or nudges one; the numbers in `lib/temple-of-joy/lane.ts`
 * are the geometry and the solver does the rest.
 *
 * **Loaded on demand only.** three.js and Rapier's wasm are large, and the
 * temple is an idle game that most sessions never bowl in — so this module is
 * behind a `lazy()` in `BowlOverlay.tsx` and nothing but opening the alley
 * pulls it down.
 *
 * ## The two things worth knowing
 *
 * - **The hook is an applied force, not a trick.** A real hook is friction at
 *   the contact patch of a ball spinning about the vertical. A single-point
 *   sphere contact recovers very little of that at this scale, so the force is
 *   applied explicitly, proportional to the spin still left — the same quantity
 *   the real effect is proportional to. See `hookForce`.
 * - **Settling is bounded.** A pin can rock against its neighbour for a long
 *   time, and a player is owed a count either way, so the roll ends when the
 *   deck goes quiet *or* after a hard ceiling — whichever comes first.
 */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  BallCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import {
  BufferGeometry,
  LatheGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  WireframeGeometry,
} from 'three';
import {
  BALL_MASS,
  DECK_DEPTH,
  GUTTER_DROP,
  GUTTER_WIDTH,
  LANE_LENGTH,
  LANE_WIDTH,
  PIN_HEIGHT,
  PIN_MASS,
  PIN_RADIUS,
  PIN_SPOTS,
  hookForce,
  pinStanding,
  release,
} from '@/lib/temple-of-joy/lane';

/** How the lane is lit and painted. Resolved from the temple's own tokens. */
export interface LanePalette {
  ground: string;
  board: string;
  gutter: string;
  pin: string;
  gold: string;
  goldBright: string;
}

/** What the player has set, read live by the frame loop. */
export interface LaneControls {
  /** −1…1, left to right at the foul line. */
  aim: number;
  /** 0…1. */
  power: number;
  /** −1…1, the hook. */
  spin: number;
}

export interface BowlLaneProps {
  /**
   * The aim, power and spin, as a REF rather than props.
   *
   * The swipe that sets them moves at pointer rate, and the alternative — state
   * — would re-render this whole subtree sixty times a second in the middle of
   * the one gesture the alley exists for. The frame loop reads the ref; React
   * renders only when the rack or the roll count changes.
   */
  controls: { current: LaneControls };
  /** How many globes are on the ball, which is how big and heavy it is. */
  globes: number;
  /**
   * Which pins are still up. Changing it re-racks; the knocked ones simply stop
   * being rendered, which is also how they stop being simulated.
   */
  standing: readonly boolean[];
  /**
   * Bumped to roll. A token rather than a boolean so a second roll with the
   * same settings is still a roll — and so the parent owns "when", which is the
   * only part of the sequence that is a game rule rather than a simulation.
   */
  rollToken: number;
  palette: LanePalette;
  /** Cut the camera work; the simulation is unchanged. */
  reducedMotion: boolean;
  /** The deck has gone quiet. Reports which pins are still standing. */
  onSettled: (standing: boolean[]) => void;
  /** The ball has left the hand — for the sound, and for locking the controls. */
  onRolling: () => void;
}

/** Shortest a roll may last before the deck is allowed to be called quiet. */
const MIN_ROLL_SECONDS = 1.4;
/** Longest a roll may last. A pin can rock against its neighbour for ever. */
const MAX_ROLL_SECONDS = 9;
/** Speeds below this, in m/s, are "not moving" for settle purposes. */
const REST_SPEED = 0.28;
/**
 * Seconds the camera stays down at the deck after the pins stop moving.
 *
 * Without it the count was invisible: the roll ends, `rolling` goes false, and
 * the camera snaps straight back to the approach — from where a single pin left
 * standing sixty feet away is four pixels tall. The hold is the shot everyone
 * actually wants to see, and it is also roughly how long the overlay takes to
 * put the result on screen.
 */
const DECK_HOLD_SECONDS = 2.6;

export default function BowlLane(props: BowlLaneProps) {
  return (
    <Canvas
      // The scene is a lane, ten pins and a ball — trivial to draw. The cost
      // here is fill rate, so the ratio is clamped exactly as every other
      // full-screen surface on the site clamps it (design-language §12.1).
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'default' }}
      // A long lens, as a bowling telecast uses: at 46° a sixty-foot lane
      // vanished to a point and the rack was an unreadable smudge four pixels
      // tall. 30° keeps the deck legible from the approach without making the
      // near end of the lane look like a funnel.
      camera={{ fov: 30, near: 0.1, far: 80, position: [0, 1.32, -3.6] }}
      // The alley is a modal overlay; nothing outside it is being animated, so
      // there is no reason for the canvas to also drive the page's frame loop
      // when it is not on screen. It unmounts when the overlay closes.
      frameloop="always"
    >
      <Scene {...props} />
    </Canvas>
  );
}

function Scene({
  controls,
  globes,
  standing,
  rollToken,
  palette,
  reducedMotion,
  onSettled,
  onRolling,
}: BowlLaneProps) {
  const ball = useRef<RapierRigidBody | null>(null);
  const pins = useRef<Array<RapierRigidBody | null>>([]);
  const rolling = useRef(false);
  const elapsed = useRef(0);
  /** Seconds of deck view still owed after a settle. */
  const deckHold = useRef(0);
  const radius = useMemo(() => release(0, 0, 0, globes).radius, [globes]);

  /** Latest props for the frame loop, which must not re-subscribe per render. */
  const latest = useRef({ controls, globes, onSettled, onRolling, reducedMotion });
  latest.current = { controls, globes, onSettled, onRolling, reducedMotion };

  /* ── The roll ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    // Token 0 is the initial render — the ball is placed, not thrown.
    if (rollToken <= 0) return;
    const body = ball.current;
    if (!body) return;
    const { aim, power, spin } = latest.current.controls.current;
    const shot = release(aim, power, spin, latest.current.globes);

    body.setTranslation({ x: shot.position[0], y: shot.position[1], z: shot.position[2] }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: shot.velocity[0], y: shot.velocity[1], z: shot.velocity[2] }, true);
    body.setAngvel({ x: shot.angular[0], y: shot.angular[1], z: shot.angular[2] }, true);
    // Whatever the last roll's hook left standing on the body dies with it.
    body.resetForces(true);
    body.wakeUp();

    // Every pin is woken with the ball. A rack that has been standing long
    // enough to fall asleep does not react to the first contact until the
    // solver notices it, which reads as the ball passing through them.
    for (const pin of pins.current) pin?.wakeUp();

    rolling.current = true;
    elapsed.current = 0;
    // A second ball thrown while the deck view is still held takes the camera
    // straight back behind the ball rather than finishing the previous hold.
    deckHold.current = 0;
    latest.current.onRolling();
  }, [rollToken]);

  /* ── The frame ────────────────────────────────────────────────────────── */

  const { camera } = useThree();
  const camTarget = useRef(new Vector3(0, 1.5, -3.2));
  const lookTarget = useRef(new Vector3(0, 0.4, LANE_LENGTH));

  useFrame((_, delta) => {
    const body = ball.current;
    if (!body) return;
    const t = body.translation();

    /* The hook. Applied while the ball is on the boards and only then — a ball
       in the gutter has stopped taking part in the shot.

       `resetForces` FIRST, every frame, and that is not tidiness: Rapier's
       `addForce` is a PERSISTENT force, held until it is reset, so adding one
       per frame accumulates. Sixty frames of a half-newton hook is thirty
       newtons on a 7kg ball, which threw every roll into the gutter inside a
       second and made the whole mechanic unwinnable. One reset plus one add is
       exactly one continuous force, which is what a hook is. */
    if (rolling.current) {
      const angular = body.angvel();
      const onLane = Math.abs(t.x) < LANE_WIDTH / 2 && t.y > -0.02 && t.z < LANE_LENGTH + 0.4;
      body.resetForces(false);
      const force = hookForce(angular.y, onLane);
      if (force !== 0) body.addForce({ x: force, y: 0, z: 0 }, true);
    }

    /* The camera. It rides behind and above the ball down the lane, then hands
       over to a fixed view of the deck as the ball arrives — which is where the
       thing you are waiting for actually happens. Under reduced motion it does
       none of that and simply watches the whole lane from the approach. */
    if (latest.current.reducedMotion) {
      camTarget.current.set(0, 1.9, -3.4);
      lookTarget.current.set(0, 0.3, LANE_LENGTH * 0.5);
    } else if (rolling.current && t.z < LANE_LENGTH - 4.5) {
      camTarget.current.set(t.x * 0.4, 0.95, t.z - 3.2);
      lookTarget.current.set(t.x * 0.4, 0.3, t.z + 6);
    } else if (rolling.current || deckHold.current > 0) {
      // The ball is arriving — or has just stopped: hand over to a close, low
      // view of the deck, which is where the thing everybody is waiting for
      // actually happens, and stay there long enough to see the count.
      camTarget.current.set(0, 0.92, LANE_LENGTH - 3.1);
      lookTarget.current.set(0, 0.24, LANE_LENGTH + 0.5);
    } else {
      // Between rolls the camera stands where the player is aiming from, which
      // is what turns the aim slider into a line you can see down the lane. Low
      // and tilted down, so the boards — and the arrows you aim at — fill the
      // frame rather than the empty air above the pit.
      camTarget.current.set(aimCam(latest.current.controls.current.aim), 1.32, -3.6);
      lookTarget.current.set(0, 0.1, LANE_LENGTH * 0.46);
    }

    // Frame-rate independent easing, so the swing looks the same at 60Hz and at
    // 120Hz — `lerp(k)` alone is a different curve at every refresh rate.
    const k = 1 - Math.exp(-3.6 * delta);
    camera.position.lerp(camTarget.current, k);
    camera.lookAt(lookTarget.current);

    /* The settle. */
    if (!rolling.current) {
      if (deckHold.current > 0) deckHold.current = Math.max(0, deckHold.current - delta);
      return;
    }
    elapsed.current += delta;
    if (elapsed.current < MIN_ROLL_SECONDS) return;

    const speed = length(body.linvel());
    const ballDone =
      t.z > LANE_LENGTH + DECK_DEPTH * 0.6 || t.y < -GUTTER_DROP || speed < REST_SPEED;
    let deckQuiet = true;
    for (const pin of pins.current) {
      if (!pin) continue;
      if (length(pin.linvel()) > REST_SPEED) {
        deckQuiet = false;
        break;
      }
    }

    if ((ballDone && deckQuiet) || elapsed.current > MAX_ROLL_SECONDS) {
      rolling.current = false;
      deckHold.current = DECK_HOLD_SECONDS;
      const next = standing.map((up, i) => {
        if (!up) return false;
        const pin = pins.current[i];
        if (!pin) return false;
        return pinStanding(pin.rotation(), pin.translation());
      });
      latest.current.onSettled(next);
    }
  });

  return (
    <>
      {/* The room's colour, set on the scene rather than left to the canvas's
          transparency: the card behind it is `--toj-ground-deep` today, and a
          scene that reads its own backdrop off whatever happens to be under it
          is one restyle away from a lane floating on white. */}
      <color attach="background" args={[palette.ground]} />
      <Lighting palette={palette} />
      <Physics
        gravity={[0, -9.81, 0]}
        timeStep={1 / 60}
        // Ten pins in a tight rack resting on each other is exactly the case a
        // low iteration count resolves into jitter, and jitter here is a pin
        // that counts itself down while nobody has touched it.
        numSolverIterations={8}
        maxCcdSubsteps={2}
      >
        <Lane palette={palette} />

        {/*
          Mass, friction and restitution belong to the COLLIDER, not to the body
          — `@react-three/rapier` forwards them to `collider.setMass()` and
          friends, and a body with `colliders={false}` and an explicit child
          collider does not pass its own down. Setting them on the `<RigidBody>`
          was silently ignored, which left the ball at its default DENSITY: a
          0.126m sphere at 1kg/m³ weighs 8 grams. Every force in the scene was
          then ~900× too strong for it, so the faintest hook threw the ball into
          the gutter inside three metres and the mechanic was unplayable. They
          are on the colliders now, where Rapier reads them.
        */}
        <RigidBody
          ref={ball}
          colliders={false}
          position={[0, radius + 0.02, 0]}
          linearDamping={0.06}
          angularDamping={0.32}
          // A 7kg sphere at 12 m/s covers three pin-widths in a single 1/60s
          // step, so without continuous collision detection it tunnels straight
          // through the rack on a fast roll.
          ccd
        >
          <BallCollider args={[radius]} mass={BALL_MASS} friction={0.22} restitution={0.12} />
          <Globe radius={radius} palette={palette} />
        </RigidBody>

        {PIN_SPOTS.map((spot, i) =>
          standing[i] ? (
            <RigidBody
              key={i}
              ref={(body) => {
                pins.current[i] = body;
              }}
              colliders={false}
              position={[spot[0], PIN_HEIGHT / 2 + 0.001, LANE_LENGTH + spot[1]]}
              linearDamping={0.12}
              angularDamping={0.2}
            >
              <CylinderCollider
                args={[PIN_HEIGHT / 2, PIN_RADIUS]}
                mass={PIN_MASS}
                friction={0.32}
                restitution={0.34}
              />
              <Pin palette={palette} />
            </RigidBody>
          ) : null,
        )}
      </Physics>
    </>
  );
}

/** Where the camera stands for a given aim, so the approach shows the line. */
function aimCam(aim: number): number {
  return Math.max(-1, Math.min(1, aim)) * (LANE_WIDTH / 2) * 0.8;
}

function length(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

/* ─── The room ──────────────────────────────────────────────────────────── */

function Lighting({ palette }: { palette: LanePalette }) {
  return (
    <>
      <ambientLight intensity={0.65} color={palette.ground} />
      {/* Warm from above the deck — the alley is lit from where the pins are,
          which is what makes the far end read as the place to look. */}
      <directionalLight position={[2, 9, LANE_LENGTH - 2]} intensity={1.5} color={palette.gold} />
      <directionalLight position={[-3, 5, -4]} intensity={0.5} color={palette.goldBright} />
      <hemisphereLight args={[palette.goldBright, palette.ground, 0.4]} />
    </>
  );
}

/**
 * The boards, the two gutters, the back of the pit and the low walls.
 *
 * One fixed body: none of it moves, so there is no reason for the solver to
 * carry ten separate ones.
 */
function Lane({ palette }: { palette: LanePalette }) {
  const halfLength = (LANE_LENGTH + DECK_DEPTH) / 2 + 1;
  const centre = halfLength - 1;
  const gutterX = LANE_WIDTH / 2 + GUTTER_WIDTH / 2;

  return (
    <RigidBody type="fixed" colliders={false}>
      {/* The boards. */}
      <CuboidCollider
        args={[LANE_WIDTH / 2, 0.05, halfLength]}
        position={[0, -0.05, centre]}
        friction={0.2}
        restitution={0.08}
      />
      <mesh position={[0, -0.05, centre]} receiveShadow={false}>
        <boxGeometry args={[LANE_WIDTH, 0.1, halfLength * 2]} />
        <meshStandardMaterial color={palette.board} roughness={0.35} metalness={0.05} />
      </mesh>

      {/* The gutters, and the kerb between each and the boards. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <CuboidCollider
            args={[GUTTER_WIDTH / 2, 0.05, halfLength]}
            position={[side * gutterX, -GUTTER_DROP - 0.05, centre]}
            friction={0.42}
            restitution={0.02}
          />
          <CuboidCollider
            args={[0.04, GUTTER_DROP + 0.1, halfLength]}
            position={[side * (gutterX + GUTTER_WIDTH / 2 + 0.04), 0, centre]}
          />
          <mesh position={[side * gutterX, -GUTTER_DROP - 0.05, centre]}>
            <boxGeometry args={[GUTTER_WIDTH, 0.1, halfLength * 2]} />
            <meshStandardMaterial color={palette.gutter} roughness={0.6} />
          </mesh>
          <mesh position={[side * (gutterX + GUTTER_WIDTH / 2 + 0.04), -0.02, centre]}>
            <boxGeometry args={[0.08, GUTTER_DROP * 2 + 0.2, halfLength * 2]} />
            <meshStandardMaterial color={palette.board} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* The back of the pit, so a ball and its pins stop somewhere. Wider than
          the lane and taller than the camera ever looks, so the deck reads as
          the end of a room rather than as a plank standing in a void. */}
      <CuboidCollider
        args={[LANE_WIDTH / 2 + GUTTER_WIDTH + 0.1, 1, 0.1]}
        position={[0, 0.9, LANE_LENGTH + DECK_DEPTH + 0.6]}
      />
      {/* Wide enough and tall enough to BE the end of the room from every angle
          the camera takes. At seven metres the floor ran on past it on both
          sides and the horizon read as a cliff edge. */}
      <mesh position={[0, 1.9, LANE_LENGTH + DECK_DEPTH + 0.72]}>
        <boxGeometry args={[16, 4.6, 0.12]} />
        <meshStandardMaterial color={palette.gutter} roughness={0.85} />
      </mesh>

      {/* The floor the whole alley stands on. Without it the lane is a plank
          hanging in a void, and the eye reads the empty background as a hole
          rather than as a room. It carries no collider — nothing in this scene
          is ever meant to reach it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.42, LANE_LENGTH * 0.4]}>
        <planeGeometry args={[16, LANE_LENGTH * 2.4]} />
        <meshStandardMaterial color={palette.ground} roughness={0.95} />
      </mesh>

      <Markings palette={palette} />
    </RigidBody>
  );
}

/**
 * The boards' markings: a foul line, and the seven targeting arrows.
 *
 * Not decoration. A real lane's arrows sit fifteen feet down and they are what
 * a bowler actually aims at — nobody looks at the pins, sixty feet away, while
 * releasing. Without them the approach view is a featureless ramp and the aim
 * slider has nothing to mean; with them, moving the line one arrow left is a
 * decision you can see yourself making.
 *
 * Flat quads laid on the boards a millimetre proud, with no collider — they are
 * paint.
 */
function Markings({ palette }: { palette: LanePalette }) {
  /** Fifteen feet from the foul line, where the arrows are. */
  const ARROW_Z = 4.57;
  /** Arrows sit five boards apart; a board is just over an inch. */
  const ARROW_STEP = 0.1334;

  return (
    <group position={[0, 0.002, 0]}>
      {/* The foul line. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[LANE_WIDTH, 0.05]} />
        <meshStandardMaterial color={palette.gold} roughness={0.5} />
      </mesh>

      {/* Seven arrows in a shallow V, brightest in the middle where the pocket
          line runs. Drawn as triangles via a rotated plane would be a square —
          a cone with three radial segments IS a triangle, and it is one line. */}
      {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[i * ARROW_STEP, 0, ARROW_Z + Math.abs(i) * 0.42]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <coneGeometry args={[0.045, 0.16, 3]} />
          <meshStandardMaterial
            color={i === 0 ? palette.gold : palette.gutter}
            roughness={0.55}
            transparent
            opacity={i === 0 ? 0.95 : 0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The ball: the same liquid globe the sanctum turns, rendered in three
 * dimensions — a glass sphere with the wireframe cage suspended inside it.
 *
 * The cage is a `WireframeGeometry` over a low-band sphere rather than the
 * thirteen great circles the 2D globe draws, because at this size and this
 * speed the two are indistinguishable and one of them is a single draw call.
 */
function Globe({ radius, palette }: { radius: number; palette: LanePalette }) {
  const cage = useMemo<BufferGeometry>(
    () => new WireframeGeometry(new SphereGeometry(radius * 1.002, 14, 9)),
    [radius],
  );
  // Geometry is not garbage collected with the React tree — WebGL buffers are
  // released only by `dispose()`, and a ball that changes size when a globe is
  // bought would otherwise leak one cage per purchase.
  useEffect(() => () => cage.dispose(), [cage]);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial
          color={palette.goldBright}
          roughness={0.12}
          metalness={0.25}
          transparent
          opacity={0.5}
        />
      </mesh>
      <lineSegments geometry={cage}>
        <lineBasicMaterial color={palette.gold} transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}

/**
 * A pin, turned on a lathe from its real profile rather than approximated by a
 * cylinder. The collider IS a cylinder — a lathe would be a convex hull the
 * solver has to re-derive, and at ten of them the difference in how a rack
 * scatters is not worth what it costs. What the profile buys is that a pin
 * looks like a pin, which is the entire reason anyone recognises this game.
 */
function Pin({ palette }: { palette: LanePalette }) {
  const geometry = useMemo(() => {
    const h = PIN_HEIGHT;
    const r = PIN_RADIUS;
    // Radius at each height, bottom to top: a wide base, a waisted neck, and a
    // rounded head.
    const profile: [number, number][] = [
      [0, 0],
      [r * 0.62, 0],
      [r * 0.78, h * 0.06],
      [r * 1.0, h * 0.24],
      [r * 0.92, h * 0.42],
      [r * 0.6, h * 0.58],
      [r * 0.45, h * 0.7],
      [r * 0.5, h * 0.84],
      [r * 0.42, h * 0.94],
      [0, h],
    ];
    return new LatheGeometry(
      profile.map(([x, y]) => new Vector2(x, y - h / 2)),
      18,
    );
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={palette.pin} roughness={0.3} metalness={0.04} />
      </mesh>
      {/* The two collars. Gold, so a pin that has been turned over is instantly
          readable as turned over even at the far end of a long lane. */}
      {[0.1, 0.17].map((offset) => (
        <mesh key={offset} position={[0, PIN_HEIGHT * 0.18 - offset * 0.2, 0]}>
          <cylinderGeometry args={[PIN_RADIUS * 0.86, PIN_RADIUS * 0.86, PIN_HEIGHT * 0.045, 18]} />
          <meshStandardMaterial color={palette.gold} roughness={0.35} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}
