# Slice It — three.js Neon Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Slice It's Canvas-2D renderer with a three.js WebGL neon scene (Void-Breaker style: emissive materials + bloom post chain) for dramatically more visual pop, without touching game logic, timing, or input.

**Architecture:** All rendering moves into a new `lib/game/render3d/` subsystem. The single read-only `render()` function in `GameCanvas.tsx` is replaced by `SliceRenderer3D.renderFrame(engine, audioTime)`. Pure, parity-critical logic (field coordinate mapping, palette, impact-intensity, beat-energy math) is extracted into small unit-tested modules; the three.js scene assembly is verified in-browser (the repo has a `node` Vitest environment only — no WebGL/DOM test env).

**Tech Stack:** TypeScript, React, three.js `^0.183.2` (already a dependency), three.js example post-processing addons (`three/examples/jsm/...`), Vitest (`node` environment), Web Audio `AnalyserNode`.

## Global Constraints

- **No new npm dependencies.** Use `three@^0.183.2` (already installed) and its bundled `three/examples/jsm/**` addons only.
- **Gameplay parity is non-negotiable.** Note arrival timing must remain `pos = CURSOR ± (slice.time − audioTime) × PPS` with `PPS = axisLen/3.0 × speedMod` (~3 s lookahead). Do not alter `GameEngine`, `AudioManager` timing, input handlers, the store, or multiplayer.
- **Both orientations.** Desktop (horizontal scroll, lanes top/bottom) and mobile-vertical (`isMobileV` = portrait canvas: vertical scroll, lanes left/right) must both work.
- **Lane identity:** lane 0 = electric blue, lane 1 = hot pink (emissive/neon).
- **Environment:** abstract near-black neon void + drifting particles. No tunnel/arena geometry.
- **Accessibility:** honor `prefers-reduced-motion` (`setReducedFx(true)` → damp shake, disable chromatic aberration + film grain).
- **Test runner:** `node_modules/.bin/vitest run <path>` (matches the repo's `epic:test` form; do not use `pnpm run` wrappers — they are blocked in this environment). Unit tests live under `lib/__tests__/` (already in `vitest.config.ts` `include`).
- **Commit cadence:** commit after each task. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **All note types** must render: STANDARD, MOVING, SPEED, SILENT, LONG, BOMB, SWITCH.
- **feedbackQueue entry shape** (read-only consumer): `{ id: number, text: string, lane: number, time: number, color: string, offset?: number }`.

---

## File Structure

**Create:**
- `lib/game/render3d/palette.ts` — neon colors per lane/note type (+ pure lookups).
- `lib/game/render3d/fieldMapping.ts` — pure viewport+modifier → world-coordinate math (timing parity lives here).
- `lib/game/render3d/impactConfig.ts` — pure judgment-text → impact-FX intensity.
- `lib/game/render3d/SliceRenderer3D.ts` — orchestrator (renderer/scene/camera/composer; `mount`/`resize`/`renderFrame`/`setReducedFx`/`dispose`).
- `lib/game/render3d/NoteField.ts` — lanes + note instanced meshes, per-frame update from `engine.getActiveMap()`.
- `lib/game/render3d/PostFX.ts` — EffectComposer chain + beat-reactive bloom.
- `lib/game/render3d/EffectsLayer.ts` — slice-impact particles/shards/trails/flash + screen shake.
- `lib/game/render3d/Environment.ts` — drifting neon-particle void + fog + reactive lights.
- `lib/__tests__/slice-it-field-mapping.test.ts`
- `lib/__tests__/slice-it-palette.test.ts`
- `lib/__tests__/slice-it-impact-config.test.ts`
- `lib/__tests__/slice-it-beat-energy.test.ts`

**Modify:**
- `lib/audio/AudioManager.ts` — add an `AnalyserNode` tap + `getBeatEnergy()`.
- `components/game/GameCanvas.tsx` — delete Canvas-2D `render()` + CPU particle system; drive `SliceRenderer3D` from the RAF loop; create a WebGL (not `2d`) canvas; add WebGL-unavailable fallback message.

---

## Task 1: Beat-energy math + AudioManager analyser tap

**Files:**
- Create: `lib/game/render3d/audioAnalysis.ts`
- Test: `lib/__tests__/slice-it-beat-energy.test.ts`
- Modify: `lib/audio/AudioManager.ts`

**Interfaces:**
- Produces: `computeBeatEnergy(freq: Uint8Array, bassBins?: number): number` → smoothed 0..1 low-frequency energy. `AudioManager.getBeatEnergy(): number` (0 when no analyser/song).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/slice-it-beat-energy.test.ts
import { describe, it, expect } from 'vitest';
import { computeBeatEnergy } from '@/lib/game/render3d/audioAnalysis';

describe('computeBeatEnergy', () => {
  it('returns 0 for silence', () => {
    expect(computeBeatEnergy(new Uint8Array(64))).toBe(0);
  });

  it('returns ~1 for full-scale bass', () => {
    const f = new Uint8Array(64).fill(255);
    expect(computeBeatEnergy(f)).toBeCloseTo(1, 2);
  });

  it('only averages the low (bass) bins', () => {
    const f = new Uint8Array(64); // bass bins loud, treble silent
    for (let i = 0; i < 8; i++) f[i] = 255;
    expect(computeBeatEnergy(f, 8)).toBeCloseTo(1, 2);
  });

  it('returns a mid value for half-scale bass', () => {
    const f = new Uint8Array(64).fill(128);
    expect(computeBeatEnergy(f)).toBeGreaterThan(0.45);
    expect(computeBeatEnergy(f)).toBeLessThan(0.55);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-beat-energy.test.ts`
Expected: FAIL — cannot resolve `@/lib/game/render3d/audioAnalysis`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/game/render3d/audioAnalysis.ts
/**
 * Average the low-frequency (bass) bins of an FFT magnitude array into 0..1.
 * @param freq frequency-domain byte data from an AnalyserNode (0..255 per bin)
 * @param bassBins how many of the lowest bins count as "bass" (default 16)
 */
export function computeBeatEnergy(freq: Uint8Array, bassBins = 16): number {
  const n = Math.min(bassBins, freq.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += freq[i];
  return sum / n / 255;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-beat-energy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the analyser tap to AudioManager**

In `lib/audio/AudioManager.ts`, add a field beside `gainNode`:

```ts
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
```

In `initialize()` (right after `this.gainNode.connect(this.audioContext.destination);`), add a **parallel** tap so the audible path is unchanged:

```ts
      // Parallel analyser tap for beat-reactive visuals (does NOT reach destination,
      // so it never alters the audible signal).
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.gainNode.connect(this.analyser);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
```

Add a public accessor (place near `getCurrentTime()`), importing the helper at the top of the file (`import { computeBeatEnergy } from '@/lib/game/render3d/audioAnalysis';`):

```ts
  /** Smoothed low-frequency (bass) energy of current playback, 0..1. 0 if no audio. */
  public getBeatEnergy(): number {
    if (!this.analyser || !this.freqData) return 0;
    this.analyser.getByteFrequencyData(this.freqData);
    return computeBeatEnergy(this.freqData);
  }
```

- [ ] **Step 6: Type-check the modified file**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "AudioManager|audioAnalysis" || echo "no errors in changed files"`
Expected: `no errors in changed files`.

- [ ] **Step 7: Commit**

```bash
git add lib/game/render3d/audioAnalysis.ts lib/__tests__/slice-it-beat-energy.test.ts lib/audio/AudioManager.ts
git commit -m "feat(slice-it): add beat-energy analyser tap to AudioManager"
```

---

## Task 2: Neon palette

**Files:**
- Create: `lib/game/render3d/palette.ts`
- Test: `lib/__tests__/slice-it-palette.test.ts`

**Interfaces:**
- Produces: `LANE_COLORS: [number, number]` (hex ints, lane0=blue, lane1=pink); `noteColor(type: SliceType, lane: number): number`; `BG_COLOR: number`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/slice-it-palette.test.ts
import { describe, it, expect } from 'vitest';
import { noteColor, LANE_COLORS, BG_COLOR } from '@/lib/game/render3d/palette';

describe('palette', () => {
  it('lane 0 is electric blue, lane 1 is hot pink', () => {
    expect(LANE_COLORS[0]).toBe(0x3b82f6);
    expect(LANE_COLORS[1]).toBe(0xf472b6);
  });
  it('standard notes take their lane color', () => {
    expect(noteColor('STANDARD', 0)).toBe(0x3b82f6);
    expect(noteColor('STANDARD', 1)).toBe(0xf472b6);
  });
  it('bombs are always red regardless of lane', () => {
    expect(noteColor('BOMB', 0)).toBe(0xef4444);
    expect(noteColor('BOMB', 1)).toBe(0xef4444);
  });
  it('special types have fixed neon colors', () => {
    expect(noteColor('SPEED', 0)).toBe(0xa78bfa);
    expect(noteColor('MOVING', 0)).toBe(0xfacc15);
    expect(noteColor('SILENT', 0)).toBe(0x94a3b8);
  });
  it('background is near-black', () => {
    expect(BG_COLOR).toBe(0x05060a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-palette.test.ts`
Expected: FAIL — cannot resolve `palette`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/game/render3d/palette.ts
import type { SliceType } from '@/lib/game/types';

/** Lane identity preserved from the 2D renderer, as emissive neon. */
export const LANE_COLORS: [number, number] = [0x3b82f6, 0xf472b6]; // blue, pink
export const BG_COLOR = 0x05060a; // near-black void

const FIXED: Partial<Record<SliceType, number>> = {
  BOMB: 0xef4444,
  SPEED: 0xa78bfa,
  MOVING: 0xfacc15,
  SILENT: 0x94a3b8,
};

/** Color for a note: fixed-per-type where defined, else its lane color. */
export function noteColor(type: SliceType, lane: number): number {
  if (FIXED[type] !== undefined) return FIXED[type]!;
  return LANE_COLORS[lane === 1 ? 1 : 0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-palette.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/palette.ts lib/__tests__/slice-it-palette.test.ts
git commit -m "feat(slice-it): add neon palette module"
```

---

## Task 3: Field coordinate mapping (timing parity)

This is the parity-critical module. It reproduces the 2D renderer's timing/lane math as pure functions, mapped into a normalized world space the 3D scene uses.

**World convention:** the **scroll axis is world X**, the **lane axis is world Y**, the field plane sits at z=0. Notes travel toward the hit line at `worldX = 0`. Future notes have `worldX > 0`. One world unit = one second of lookahead × scroll speed, so geometry is resolution-independent (the camera framing in Task 5 handles fit). Lane Y positions are symmetric about 0.

**Files:**
- Create: `lib/game/render3d/fieldMapping.ts`
- Test: `lib/__tests__/slice-it-field-mapping.test.ts`

**Interfaces:**
- Consumes: `type FieldOpts = { speedMod: number; oneTrack: boolean }`.
- Produces:
  - `WORLD_LOOKAHEAD_S = 3` (seconds visible from spawn to hit line).
  - `scrollWorldX(timeDelta: number, speedMod: number): number` — `timeDelta = slice.time − audioTime`. Returns `timeDelta × (1/ … )`? See impl. At `timeDelta=0` returns 0; positive for future notes.
  - `laneWorldY(lane: number, opts: FieldOpts): number` — lane center on the Y axis; oneTrack collapses to 0.
  - `LANE_SPREAD = 1.6` (world units between the two lanes' centers).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/slice-it-field-mapping.test.ts
import { describe, it, expect } from 'vitest';
import { scrollWorldX, laneWorldY, LANE_SPREAD, WORLD_LOOKAHEAD_S } from '@/lib/game/render3d/fieldMapping';

describe('fieldMapping', () => {
  it('a note exactly on time sits at the hit line (x=0)', () => {
    expect(scrollWorldX(0, 1)).toBe(0);
  });

  it('future notes are ahead (positive x), proportional to time', () => {
    const a = scrollWorldX(1, 1);
    const b = scrollWorldX(2, 1);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(2 * a, 6);
  });

  it('a full lookahead-window note sits at the spawn edge (x = WORLD_LOOKAHEAD_S scaled)', () => {
    // At speedMod 1, a note 3s out is one lookahead window away.
    expect(scrollWorldX(WORLD_LOOKAHEAD_S, 1)).toBeCloseTo(WORLD_LOOKAHEAD_S * scrollWorldX(1, 1), 6);
  });

  it('higher speedMod pushes the same note closer (faster scroll)', () => {
    expect(scrollWorldX(1, 2)).toBeLessThan(scrollWorldX(1, 1));
  });

  it('two lanes are symmetric about 0, LANE_SPREAD apart', () => {
    const y0 = laneWorldY(0, { speedMod: 1, oneTrack: false });
    const y1 = laneWorldY(1, { speedMod: 1, oneTrack: false });
    expect(y0).toBeCloseTo(LANE_SPREAD / 2, 6);
    expect(y1).toBeCloseTo(-LANE_SPREAD / 2, 6);
  });

  it('oneTrack collapses both lanes to center', () => {
    expect(laneWorldY(0, { speedMod: 1, oneTrack: true })).toBe(0);
    expect(laneWorldY(1, { speedMod: 1, oneTrack: true })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-field-mapping.test.ts`
Expected: FAIL — cannot resolve `fieldMapping`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/game/render3d/fieldMapping.ts
export type FieldOpts = { speedMod: number; oneTrack: boolean };

/** Seconds of track visible from spawn edge to the hit line (matches 2D ~3s window). */
export const WORLD_LOOKAHEAD_S = 3;

/** World units between the two lane centers (lane 0 above, lane 1 below). */
export const LANE_SPREAD = 1.6;

/** World units the spawn edge sits from the hit line. Camera framing fits this. */
const FIELD_DEPTH = 12;

/**
 * Scroll position along world X for a note.
 * @param timeDelta slice.time − audioTime (seconds; 0 = now/at hit line, >0 = future)
 * @param speedMod the `modifiers.speed` value (higher = faster scroll = closer)
 *
 * Parity with the 2D renderer: position is linear in timeDelta and inversely
 * scaled by speedMod, with a full lookahead window (WORLD_LOOKAHEAD_S / speedMod
 * seconds) spanning FIELD_DEPTH world units.
 */
export function scrollWorldX(timeDelta: number, speedMod: number): number {
  const windowSeconds = WORLD_LOOKAHEAD_S / speedMod;
  return (timeDelta / windowSeconds) * FIELD_DEPTH;
}

/** Lane center on world Y. Lane 0 above (+), lane 1 below (−); oneTrack → 0. */
export function laneWorldY(lane: number, opts: FieldOpts): number {
  if (opts.oneTrack) return 0;
  return lane === 1 ? -LANE_SPREAD / 2 : LANE_SPREAD / 2;
}
```

Note: the `speedMod` test for `scrollWorldX(1,2) < scrollWorldX(1,1)` holds because `windowSeconds` shrinks with higher speedMod, so a fixed 1s-out note maps closer to the hit line — same felt behavior as the 2D `PPS × speedMod`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-field-mapping.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/fieldMapping.ts lib/__tests__/slice-it-field-mapping.test.ts
git commit -m "feat(slice-it): add field coordinate mapping with timing parity"
```

---

## Task 4: Impact-FX intensity config

**Files:**
- Create: `lib/game/render3d/impactConfig.ts`
- Test: `lib/__tests__/slice-it-impact-config.test.ts`

**Interfaces:**
- Produces: `type Impact = { particles: number; speed: number; shake: number; flash: number }`; `impactFor(judgment: string): Impact`; `shouldEmitImpact(text: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/slice-it-impact-config.test.ts
import { describe, it, expect } from 'vitest';
import { impactFor, shouldEmitImpact } from '@/lib/game/render3d/impactConfig';

describe('impactConfig', () => {
  it('marvelous is the most intense, good the least', () => {
    expect(impactFor('MARVELOUS').particles).toBeGreaterThan(impactFor('GOOD').particles);
    expect(impactFor('MARVELOUS').shake).toBeGreaterThan(impactFor('GOOD').shake);
  });
  it('unknown judgments fall back to GOOD config', () => {
    expect(impactFor('???')).toEqual(impactFor('GOOD'));
  });
  it('MISS / BAD / RELEASED do not emit impact FX', () => {
    expect(shouldEmitImpact('MISS')).toBe(false);
    expect(shouldEmitImpact('BAD')).toBe(false);
    expect(shouldEmitImpact('RELEASED')).toBe(false);
  });
  it('positive judgments emit impact FX', () => {
    expect(shouldEmitImpact('MARVELOUS')).toBe(true);
    expect(shouldEmitImpact('PERFECT')).toBe(true);
    expect(shouldEmitImpact('HOLD OK')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-impact-config.test.ts`
Expected: FAIL — cannot resolve `impactConfig`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/game/render3d/impactConfig.ts
export type Impact = { particles: number; speed: number; shake: number; flash: number };

const TABLE: Record<string, Impact> = {
  MARVELOUS: { particles: 40, speed: 11, shake: 0.9, flash: 1.0 },
  PERFECT:   { particles: 28, speed: 8,  shake: 0.6, flash: 0.8 },
  GREAT:     { particles: 18, speed: 6,  shake: 0.35, flash: 0.55 },
  GOOD:      { particles: 10, speed: 4,  shake: 0.15, flash: 0.35 },
  'HOLD OK': { particles: 20, speed: 6,  shake: 0.3, flash: 0.5 },
};

const NO_EMIT = new Set(['MISS', 'BAD', 'RELEASED']);

export function impactFor(judgment: string): Impact {
  return TABLE[judgment] ?? TABLE.GOOD;
}

export function shouldEmitImpact(text: string): boolean {
  return !NO_EMIT.has(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-impact-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/impactConfig.ts lib/__tests__/slice-it-impact-config.test.ts
git commit -m "feat(slice-it): add impact-FX intensity config"
```

---

## Task 5: SliceRenderer3D scaffold + GameCanvas wiring (empty void)

Builds the orchestrator (renderer/scene/camera, resize, dispose) and swaps `GameCanvas` from a `2d` context to driving it. After this task the game shows an empty neon void (no notes yet) but runs, resizes, and tears down cleanly. **Verified in-browser** — no unit test (WebGL is unavailable in the `node` Vitest env).

**Files:**
- Create: `lib/game/render3d/SliceRenderer3D.ts`
- Modify: `components/game/GameCanvas.tsx`

**Interfaces:**
- Produces (class `SliceRenderer3D`):
  - `constructor(canvas: HTMLCanvasElement)` — throws if WebGL context creation fails.
  - `resize(cssWidth: number, cssHeight: number, dpr: number): void`
  - `renderFrame(engine: GameEngine, audioTime: number): void`
  - `setReducedFx(reduced: boolean): void`
  - `dispose(): void`
  - `readonly isMobileV: boolean` (recomputed in `resize`).
- Consumes: `GameEngine` (read-only: `getActiveMap`, `feedbackQueue`, `getTargetedSlice`, `getEffectiveLane`, `getState`).

- [ ] **Step 1: Write the orchestrator scaffold**

```ts
// lib/game/render3d/SliceRenderer3D.ts
import * as THREE from 'three';
import type { GameEngine } from '@/lib/game/GameEngine';
import { BG_COLOR } from './palette';

export class SliceRenderer3D {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private reducedFx = false;
  public isMobileV = false;

  constructor(canvas: HTMLCanvasElement) {
    // Throws on failure; GameCanvas catches and shows a fallback message.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);
    this.scene.fog = new THREE.FogExp2(BG_COLOR, 0.012);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

    // Base lighting (Environment task adds reactive lights later).
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambient);
  }

  setReducedFx(reduced: boolean): void {
    this.reducedFx = reduced;
  }

  /**
   * Position/aim the camera to frame the field. Desktop: look down the −X scroll
   * axis from a tilted vantage. Mobile-vertical: rotate the framing 90° so the
   * scroll axis reads top→bottom on screen.
   */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.isMobileV = cssHeight > cssWidth;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.camera.aspect = cssWidth / cssHeight;

    if (this.isMobileV) {
      // Field scroll axis (world X) is shown vertically: roll the camera 90°.
      this.camera.position.set(0, 2.5, 9);
      this.camera.up.set(1, 0, 0);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.camera.position.set(6, 3.2, 9);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, 0, 0);
    }
    this.camera.updateProjectionMatrix();
  }

  renderFrame(_engine: GameEngine, _audioTime: number): void {
    // Subsystems are wired into this method in later tasks.
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
  }
}
```

- [ ] **Step 2: Rewire GameCanvas — context, RAF loop, fallback**

In `components/game/GameCanvas.tsx`:

1. Add imports near the top:
```ts
import { SliceRenderer3D } from '@/lib/game/render3d/render3d-barrel'; // see Step 2a
```
(Step 2a creates a barrel so later subsystem imports are internal.)

2. Add a ref and a WebGL-failure flag near the other refs (after `const rafRef = ...`):
```ts
    const rendererRef = useRef<SliceRenderer3D | null>(null);
    const [webglFailed, setWebglFailed] = useState(false);
```

3. In the resize `useEffect` (`sync` closure), after setting `canvas.width/height`, also resize the renderer if present:
```ts
            if (width > 0 && height > 0) {
                canvas.width  = Math.round(width  * window.devicePixelRatio);
                canvas.height = Math.round(height * window.devicePixelRatio);
                rendererRef.current?.resize(width, height, window.devicePixelRatio);
            }
```

4. In the **engine init `useEffect`**, replace the body of `loop()` that does `canvas.getContext('2d')` + `render(ctx, …)` with renderer construction-on-first-frame + `renderFrame`:
```ts
        const loop = () => {
            frameRef.current++;
            if (frameRef.current % 60 === 0) {
                setDebugInfo(prev => ({ ...prev, frames: frameRef.current }));
            }
            try {
                const canvas = canvasRef.current;
                if (!canvas) return;

                if (!rendererRef.current && !webglFailedRef.current) {
                    try {
                        rendererRef.current = new SliceRenderer3D(canvas);
                        const r = wrapperRef.current!.getBoundingClientRect();
                        rendererRef.current.resize(r.width, r.height, window.devicePixelRatio);
                        rendererRef.current.setReducedFx(
                            window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        );
                    } catch (err) {
                        console.error('WebGL init failed:', err);
                        webglFailedRef.current = true;
                        setWebglFailed(true);
                    }
                }

                rendererRef.current?.renderFrame(newEngine, AudioManager.getInstance().getCurrentTime());
                newEngine.update();
            } catch (e: any) {
                console.error('GameCanvas Render Error:', e);
                setDebugInfo(prev => ({ ...prev, error: e.message || 'Unknown Error' }));
            }
            rafRef.current = requestAnimationFrame(loop);
        };
```
(Add `const webglFailedRef = useRef(false);` beside the other refs — used inside the loop to avoid stale `webglFailed` state. Set it `true` in the catch alongside `setWebglFailed(true)`.)

5. In that effect's cleanup, dispose the renderer:
```ts
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            rendererRef.current?.dispose();
            rendererRef.current = null;
            AudioManager.getInstance().stop();
            useGameStore.getState().reset();
        };
```

6. **Delete** the entire Canvas-2D `render` function (lines ~596–end-of-render) **and** the CPU particle system (`particlesRef`, `lastHitTimeRef`, `spawnParticles`) — they are replaced by the renderer. Also delete the now-unused `COLORS` and `interpolateHex` at the top of the file. (If a later task still needs `lastHitTimeRef`-style dedup, the renderer owns it internally — see Task 8.)

7. Render the fallback message. Find the JSX where `<canvas ref={canvasRef} … />` is returned and add, as a sibling overlay:
```tsx
        {webglFailed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-center p-6 text-white">
                <p>Your browser or GPU doesn’t support WebGL, which Slice It needs to render. Try a different browser or enable hardware acceleration.</p>
            </div>
        )}
```

- [ ] **Step 2a: Create the barrel**

```ts
// lib/game/render3d/render3d-barrel.ts
export { SliceRenderer3D } from './SliceRenderer3D';
```

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "GameCanvas|render3d" || echo "clean"`
Expected: `clean` (note: deleting `render()` may surface unused-import warnings — remove any now-unused imports flagged).

- [ ] **Step 4: In-browser verification**

Start the app (`pnpm run dev` or the project's run skill) and open the Slice It route. Confirm:
- The game area shows a solid near-black void (no crash, no blank white).
- Resizing the window keeps the canvas filled and correctly proportioned.
- Navigating away from the route logs no "context lost"/disposal errors.
- Selecting a song and playing still updates score/combo HUD (engine runs) even though no notes are drawn yet.

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/SliceRenderer3D.ts lib/game/render3d/render3d-barrel.ts components/game/GameCanvas.tsx
git commit -m "feat(slice-it): three.js renderer scaffold, wire into GameCanvas"
```

---

## Task 6: NoteField — lanes + all note types (timing parity)

Draws the lane rails and every note type each frame from `engine.getActiveMap()`, using `fieldMapping` for positions so timing matches the old renderer. **Verified in-browser.**

**Files:**
- Create: `lib/game/render3d/NoteField.ts`
- Modify: `lib/game/render3d/SliceRenderer3D.ts`, `lib/game/render3d/render3d-barrel.ts`

**Interfaces:**
- Produces (class `NoteField`):
  - `constructor(scene: THREE.Scene)`
  - `update(engine: GameEngine, audioTime: number, ctx: FieldCtx): void` where `type FieldCtx = { isMobileV: boolean; speedMod: number; oneTrack: boolean; invisible: boolean; reducedFx: boolean }`
  - `dispose(): void`
- Consumes: `engine.getActiveMap()`, `engine.getTargetedSlice(lane)`, `engine.getEffectiveLane(slice, time)`; `fieldMapping`, `palette`.

- [ ] **Step 1: Implement NoteField**

```ts
// lib/game/render3d/NoteField.ts
import * as THREE from 'three';
import type { GameEngine } from '@/lib/game/GameEngine';
import type { Slice } from '@/lib/game/types';
import { noteColor, LANE_COLORS } from './palette';
import { scrollWorldX, laneWorldY, WORLD_LOOKAHEAD_S, type FieldOpts } from './fieldMapping';

export type FieldCtx = {
  isMobileV: boolean; speedMod: number; oneTrack: boolean;
  invisible: boolean; reducedFx: boolean;
};

const MAX_NOTES = 256; // instanced cap; far above on-screen note count

export class NoteField {
  private group = new THREE.Group();
  private cubes: THREE.InstancedMesh;       // STANDARD/MOVING/SPEED/SILENT/SWITCH
  private orbs: THREE.InstancedMesh;        // BOMB
  private tails: THREE.InstancedMesh;       // LONG tails
  private rails: THREE.Mesh[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const cubeGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const cubeMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 1.4, roughness: 0.35, metalness: 0.1 });
    this.cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, MAX_NOTES);
    this.cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NOTES * 3), 3);
    this.applyEmissiveFromColor(cubeMat);

    const orbGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.6, roughness: 0.4 });
    this.orbs = new THREE.InstancedMesh(orbGeo, orbMat, 64);

    const tailGeo = new THREE.BoxGeometry(1, 0.18, 0.18); // scaled per-instance along X
    const tailMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 0.8, transparent: true, opacity: 0.6 });
    this.tails = new THREE.InstancedMesh(tailGeo, tailMat, 64);
    this.tails.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
    this.applyEmissiveFromColor(tailMat);

    this.group.add(this.cubes, this.orbs, this.tails);
    scene.add(this.group);
  }

  /** Make instanceColor drive emissive so each note glows in its own color. */
  private applyEmissiveFromColor(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor * emissiveIntensity;'
      );
    };
    mat.vertexColors = true;
  }

  update(engine: GameEngine, audioTime: number, ctx: FieldCtx): void {
    this.ensureRails(ctx);
    const map = engine.getActiveMap();
    const opts: FieldOpts = { speedMod: ctx.speedMod, oneTrack: ctx.oneTrack };

    const targeted = new Set<string>();
    const t0 = engine.getTargetedSlice(0); if (t0) targeted.add(t0.id);
    const t1 = engine.getTargetedSlice(1); if (t1) targeted.add(t1.id);

    let cubeI = 0, orbI = 0, tailI = 0;

    if (map) {
      for (const slice of map.slices as Slice[]) {
        const dt = slice.time - audioTime;
        // Cull: behind hit line (with brief fade window) or beyond spawn edge.
        if (dt < -0.25 || dt > WORLD_LOOKAHEAD_S / ctx.speedMod + 0.2) continue;

        const lane = engine.getEffectiveLane(slice, audioTime);
        const x = scrollWorldX(dt, ctx.speedMod);
        const y = laneWorldY(lane, opts);
        const c = noteColor(slice.type, lane);

        // Invisible modifier: fade to nothing approaching the hit line (skip bombs).
        let scale = 1;
        if (ctx.invisible && slice.type !== 'BOMB') {
          const ratio = dt / (WORLD_LOOKAHEAD_S / ctx.speedMod);
          if (ratio < 0.08) continue;
        }
        if (slice.hit && slice.type !== 'LONG') {
          const fade = Math.max(0, 1 - (performance.now() - (slice.hitTime ?? 0)) / 90);
          if (fade <= 0) continue;
          scale = fade;
        }

        const glow = targeted.has(slice.id) ? 1.4 : 1.0;

        if (slice.type === 'BOMB') {
          this.place(this.orbs, orbI++, x, y, 0, glow);
        } else {
          if (slice.type === 'LONG' && (slice.duration ?? 0) > 0) {
            const len = scrollWorldX(slice.duration!, ctx.speedMod);
            this.placeTail(tailI++, x, y, len, c);
          }
          this.placeColored(this.cubes, cubeI++, x, y, scale * glow, c);
        }
      }
    }

    this.cubes.count = cubeI; this.cubes.instanceMatrix.needsUpdate = true;
    (this.cubes.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.orbs.count = orbI; this.orbs.instanceMatrix.needsUpdate = true;
    this.tails.count = tailI; this.tails.instanceMatrix.needsUpdate = true;
    (this.tails.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number) {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.setScalar(Math.max(0.001, s));
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(i, this.dummy.matrix);
  }

  private placeColored(mesh: THREE.InstancedMesh, i: number, x: number, y: number, s: number, hex: number) {
    this.place(mesh, i, x, y, 0, s);
    mesh.setColorAt(i, this.color.setHex(hex));
  }

  private placeTail(i: number, x: number, y: number, len: number, hex: number) {
    this.dummy.position.set(x + len / 2, y, -0.05);
    this.dummy.scale.set(Math.max(0.001, len), 1, 1);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    this.tails.setMatrixAt(i, this.dummy.matrix);
    this.tails.setColorAt(i, this.color.setHex(hex));
  }

  private ensureRails(ctx: FieldCtx) {
    if (this.rails.length) return;
    const lanes = ctx.oneTrack ? [0] : [0, 1];
    const depth = scrollWorldX(WORLD_LOOKAHEAD_S / ctx.speedMod, ctx.speedMod);
    lanes.forEach((lane) => {
      const geo = new THREE.PlaneGeometry(depth, 0.7);
      const mat = new THREE.MeshBasicMaterial({
        color: LANE_COLORS[lane], transparent: true, opacity: 0.12,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const rail = new THREE.Mesh(geo, mat);
      rail.rotation.x = -Math.PI / 2;
      rail.position.set(depth / 2, laneWorldY(lane, { speedMod: ctx.speedMod, oneTrack: ctx.oneTrack }), 0);
      this.group.add(rail);
      this.rails.push(rail);
    });
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.group.removeFromParent();
  }
}
```

- [ ] **Step 2: Wire NoteField into SliceRenderer3D**

In `SliceRenderer3D.ts`:
- Import: `import { NoteField, type FieldCtx } from './NoteField';` and `import { useGameStore } from '@/lib/store/useGameStore';`
- Add field `private noteField: NoteField;` and in the constructor (after scene setup): `this.noteField = new NoteField(this.scene);`
- In `renderFrame`, before `this.renderer.render(...)`:
```ts
    const mods = useGameStore.getState().modifiers;
    const ctx: FieldCtx = {
      isMobileV: this.isMobileV,
      speedMod: mods.speed || 1,
      oneTrack: mods.oneTrack,
      invisible: mods.invisible,
      reducedFx: this.reducedFx,
    };
    this.noteField.update(_engine, _audioTime, ctx);
```
  (Rename `_engine`/`_audioTime` params to `engine`/`audioTime`.)
- In `dispose()`, before `this.renderer.dispose()`: `this.noteField.dispose();`

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "NoteField|SliceRenderer3D" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: In-browser verification (parity)**

Play a song and confirm against the old build:
- Notes scroll toward the hit line and arrive **in time with the music** (the critical parity check — compare feel to git `main`).
- Lane 0 notes are blue, lane 1 pink; BOMB red orbs; SPEED/MOVING/SILENT show their fixed colors.
- LONG notes show a trailing tail; SWITCH notes cross lanes near the hit line (via `getEffectiveLane`).
- Hitting notes makes them disappear; the targeted note is visibly brighter.
- Desktop (landscape) and a narrow/portrait window both render correctly.

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/NoteField.ts lib/game/render3d/SliceRenderer3D.ts
git commit -m "feat(slice-it): render lanes and all note types in three.js"
```

---

## Task 7: PostFX — bloom + chromatic aberration + vignette + grain

Adds the EffectComposer chain that gives the neon glow. **Verified in-browser.**

**Files:**
- Create: `lib/game/render3d/PostFX.ts`
- Modify: `lib/game/render3d/SliceRenderer3D.ts`

**Interfaces:**
- Produces (class `PostFX`):
  - `constructor(renderer, scene, camera, width, height)`
  - `resize(width: number, height: number): void`
  - `setReducedFx(reduced: boolean): void`
  - `setBloom(strength: number): void` (Task 10 calls this for the beat swell)
  - `render(): void` (replaces the direct `renderer.render`)
  - `dispose(): void`

- [ ] **Step 1: Implement PostFX**

```ts
// lib/game/render3d/PostFX.ts
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';

const BASE_BLOOM = 0.9;

export class PostFX {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private rgb: ShaderPass;
  private film: FilmPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), BASE_BLOOM, 0.6, 0.2);
    this.composer.addPass(this.bloom);

    this.rgb = new ShaderPass(RGBShiftShader);
    this.rgb.uniforms.amount.value = 0.0016;
    this.composer.addPass(this.rgb);

    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 1.1;
    vignette.uniforms.darkness.value = 1.1;
    this.composer.addPass(vignette);

    this.film = new FilmPass(0.22);
    this.composer.addPass(this.film);

    this.resize(width, height);
  }

  setBloom(strength: number): void { this.bloom.strength = strength; }

  setReducedFx(reduced: boolean): void {
    this.rgb.enabled = !reduced;
    this.film.enabled = !reduced;
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
  }

  render(): void { this.composer.render(); }

  dispose(): void { this.composer.dispose(); }
}
```

- [ ] **Step 2: Wire PostFX into SliceRenderer3D**

In `SliceRenderer3D.ts`:
- Import `import { PostFX } from './PostFX';`
- Add `private postfx!: PostFX;` (created in `resize`, since it needs pixel size).
- At the end of `resize`, (re)create or resize the composer:
```ts
    const w = Math.floor(cssWidth * Math.min(dpr, 2));
    const h = Math.floor(cssHeight * Math.min(dpr, 2));
    if (!this.postfx) this.postfx = new PostFX(this.renderer, this.scene, this.camera, w, h);
    else this.postfx.resize(w, h);
    this.postfx.setReducedFx(this.reducedFx);
```
- In `renderFrame`, replace `this.renderer.render(this.scene, this.camera);` with `this.postfx.render();`
- In `setReducedFx`, also forward: `this.postfx?.setReducedFx(reduced);`
- In `dispose`, before `this.renderer.dispose()`: `this.postfx?.dispose();`

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "PostFX|SliceRenderer3D" || echo "clean"`
Expected: `clean`. (If TS complains about missing types for `three/examples/jsm/**`, confirm other repo code imports the same paths — Void Breaker's `renderer3d.ts` does — and follow its import style.)

- [ ] **Step 4: In-browser verification**

- Notes now visibly **bloom/glow** against the void; bright neon edges.
- A faint chromatic-aberration fringe and vignette are present; subtle film grain.
- Toggle OS "reduce motion" on → reload → aberration and grain are gone, bloom remains.
- Frame rate stays smooth (check it holds ~60fps on a mid laptop during dense sections).

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/PostFX.ts lib/game/render3d/SliceRenderer3D.ts
git commit -m "feat(slice-it): add bloom + aberration + vignette + grain post chain"
```

---

## Task 8: EffectsLayer — slice-impact FX + screen shake

Spawns GPU particle bursts/shards/flash on each positive hit (read off `feedbackQueue`) and shakes the camera. **Verified in-browser.**

**Files:**
- Create: `lib/game/render3d/EffectsLayer.ts`
- Modify: `lib/game/render3d/SliceRenderer3D.ts`

**Interfaces:**
- Produces (class `EffectsLayer`):
  - `constructor(scene: THREE.Scene)`
  - `consume(engine: GameEngine, ctx: FieldCtx, audioTime: number): void` — reads new `feedbackQueue` entries, spawns FX, returns nothing.
  - `update(dt: number): void` — advances particles; returns current `shake` amount via `getShake()`.
  - `getShake(): number` — 0..1 current camera-shake intensity (consumed by orchestrator).
  - `dispose(): void`
- Consumes: `engine.feedbackQueue`, `impactConfig`, `fieldMapping`, `palette`.

- [ ] **Step 1: Implement EffectsLayer**

```ts
// lib/game/render3d/EffectsLayer.ts
import * as THREE from 'three';
import type { GameEngine } from '@/lib/game/GameEngine';
import { impactFor, shouldEmitImpact } from './impactConfig';
import { scrollWorldX, laneWorldY } from './fieldMapping';
import type { FieldCtx } from './NoteField';

const MAX_P = 600;

export class EffectsLayer {
  private points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private head = 0;
  private lastFeedbackId = -1;
  private shake = 0;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 3);
    this.vel = new Float32Array(MAX_P * 3);
    this.life = new Float32Array(MAX_P);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  getShake(): number { return this.shake; }

  consume(engine: GameEngine, ctx: FieldCtx, _audioTime: number): void {
    const q = engine.feedbackQueue;
    const latest = q[q.length - 1];
    if (!latest || latest.id === this.lastFeedbackId) return;
    this.lastFeedbackId = latest.id;
    if (!shouldEmitImpact(latest.text)) return;

    const cfg = impactFor(latest.text);
    if (!ctx.reducedFx) this.shake = Math.min(1, this.shake + cfg.shake);

    const x = scrollWorldX((latest.offset ?? 0) * -1, ctx.speedMod);
    const y = laneWorldY(latest.lane, { speedMod: ctx.speedMod, oneTrack: ctx.oneTrack });
    const c = new THREE.Color(latest.color || '#ffffff');

    for (let k = 0; k < cfg.particles; k++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX_P;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = (0.4 + Math.random()) * cfg.speed * 0.12;
      this.pos[i*3] = x; this.pos[i*3+1] = y; this.pos[i*3+2] = 0;
      this.vel[i*3] = Math.cos(a) * Math.cos(b) * sp;
      this.vel[i*3+1] = Math.sin(b) * sp;
      this.vel[i*3+2] = Math.sin(a) * Math.cos(b) * sp;
      this.col[i*3] = c.r; this.col[i*3+1] = c.g; this.col[i*3+2] = c.b;
      this.life[i] = 1;
    }
  }

  update(dt: number): void {
    const f = Math.min(dt, 0.05) * 60; // normalize to ~per-frame at 60fps
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) { this.col[i*3]=this.col[i*3+1]=this.col[i*3+2]=0; continue; }
      this.pos[i*3]   += this.vel[i*3]   * f;
      this.pos[i*3+1] += this.vel[i*3+1] * f - 0.004 * f; // slight gravity
      this.pos[i*3+2] += this.vel[i*3+2] * f;
      this.life[i] -= 0.03 * f;
      const l = Math.max(0, this.life[i]);
      // fade color toward black as life ends
      this.col[i*3] *= l > 0 ? 1 : 0;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.shake *= Math.max(0, 1 - 0.12 * f); // decay shake
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.points.removeFromParent();
  }
}
```

- [ ] **Step 2: Wire EffectsLayer + camera shake into SliceRenderer3D**

In `SliceRenderer3D.ts`:
- Import `import { EffectsLayer } from './EffectsLayer';`
- Add fields: `private fx!: EffectsLayer; private lastT = 0; private camBase = new THREE.Vector3();`
- In constructor after noteField: `this.fx = new EffectsLayer(this.scene);`
- In `resize`, after positioning the camera, record the base position: `this.camBase.copy(this.camera.position);`
- In `renderFrame`, before rendering:
```ts
    const now = performance.now() / 1000;
    const dt = this.lastT ? now - this.lastT : 0.016;
    this.lastT = now;

    this.noteField.update(engine, audioTime, ctx);
    this.fx.consume(engine, ctx, audioTime);
    this.fx.update(dt);

    // Apply decaying screen shake around the framed base position.
    const s = this.fx.getShake() * (this.reducedFx ? 0 : 0.25);
    this.camera.position.set(
      this.camBase.x + (Math.random() - 0.5) * s,
      this.camBase.y + (Math.random() - 0.5) * s,
      this.camBase.z + (Math.random() - 0.5) * s,
    );
```
- In `dispose`, before renderer dispose: `this.fx.dispose();`

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "EffectsLayer|SliceRenderer3D" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: In-browser verification**

- Each successful hit emits a burst of additive neon particles in the note's color.
- Burst size scales with judgment (MARVELOUS huge, GOOD small).
- A MISS/BAD produces **no** burst (uses `shouldEmitImpact`).
- Big hits/combos produce a brief camera shake; reduced-motion disables shake.
- No runaway particle growth over a full song (pooled buffer).

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/EffectsLayer.ts lib/game/render3d/SliceRenderer3D.ts
git commit -m "feat(slice-it): slice-impact particle bursts and screen shake"
```

---

## Task 9: Environment — drifting neon void

Adds the abstract environment: a slow-drifting neon particle field, fog (already set), and reactive fill lights. **Verified in-browser.**

**Files:**
- Create: `lib/game/render3d/Environment.ts`
- Modify: `lib/game/render3d/SliceRenderer3D.ts`

**Interfaces:**
- Produces (class `Environment`):
  - `constructor(scene: THREE.Scene)`
  - `update(dt: number, energy: number): void` — drifts particles, pulses fill-light intensity by `energy` (0..1).
  - `dispose(): void`

- [ ] **Step 1: Implement Environment**

```ts
// lib/game/render3d/Environment.ts
import * as THREE from 'three';
import { LANE_COLORS } from './palette';

const STAR_COUNT = 900;

export class Environment {
  private stars: THREE.Points;
  private keyLight: THREE.PointLight;
  private rimLight: THREE.PointLight;
  private spin = 0;

  constructor(scene: THREE.Scene) {
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    const a = new THREE.Color(LANE_COLORS[0]);
    const b = new THREE.Color(LANE_COLORS[1]);
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 60;
      pos[i*3+1] = (Math.random() - 0.5) * 40;
      pos[i*3+2] = (Math.random() - 0.5) * 60 - 10;
      const c = Math.random() < 0.5 ? a : b;
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.keyLight = new THREE.PointLight(LANE_COLORS[0], 8, 60);
    this.keyLight.position.set(-6, 6, 6);
    this.rimLight = new THREE.PointLight(LANE_COLORS[1], 8, 60);
    this.rimLight.position.set(8, -4, -4);
    scene.add(this.keyLight, this.rimLight);
  }

  update(dt: number, energy: number): void {
    this.spin += dt * 0.02;
    this.stars.rotation.y = this.spin;
    const pulse = 6 + energy * 12;
    this.keyLight.intensity = pulse;
    this.rimLight.intensity = pulse * 0.8;
  }

  dispose(): void {
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.stars.removeFromParent();
    this.keyLight.removeFromParent();
    this.rimLight.removeFromParent();
  }
}
```

- [ ] **Step 2: Wire Environment into SliceRenderer3D**

In `SliceRenderer3D.ts`:
- Import `import { Environment } from './Environment';` and `import { AudioManager } from '@/lib/audio/AudioManager';`
- Add `private env!: Environment;`; in constructor: `this.env = new Environment(this.scene);`
- In `renderFrame`, after `this.fx.update(dt)`:
```ts
    const energy = AudioManager.getInstance().getBeatEnergy();
    this.env.update(dt, energy);
```
- In `dispose`: `this.env.dispose();`

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "Environment|SliceRenderer3D" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: In-browser verification**

- A field of slowly drifting blue/pink neon points fills the background; fog gives depth.
- During loud sections the scene's fill lighting visibly brightens with the music (beat energy).
- The void never overpowers note readability (notes still clearly the brightest things).

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/Environment.ts lib/game/render3d/SliceRenderer3D.ts
git commit -m "feat(slice-it): drifting neon-void environment with reactive lights"
```

---

## Task 10: Beat-reactive bloom + camera breath

Ties beat energy into bloom strength and a subtle camera "breath" so the whole scene throbs. **Verified in-browser.**

**Files:**
- Modify: `lib/game/render3d/SliceRenderer3D.ts`

- [ ] **Step 1: Drive bloom + breath from energy**

In `renderFrame`, after computing `energy` (Task 9) and before applying shake, add:
```ts
    // Beat-reactive bloom swell (base 0.9 → up to ~1.7 on strong bass).
    this.postfx.setBloom(0.9 + energy * 0.8);

    // Subtle camera "breath": dolly slightly toward the field on the beat.
    const breath = this.reducedFx ? 0 : energy * 0.4;
    this.camBase.copy(this.camBaseRest).addScaledVector(this.breathDir, -breath);
```
Add supporting fields and init them in `resize` after setting the camera:
```ts
  private camBaseRest = new THREE.Vector3();
  private breathDir = new THREE.Vector3();
```
In `resize`, replace `this.camBase.copy(this.camera.position);` with:
```ts
    this.camBaseRest.copy(this.camera.position);
    this.camBase.copy(this.camera.position);
    this.breathDir.copy(this.camera.position).sub(new THREE.Vector3(0, 0, 0)).normalize();
```
(The shake block from Task 8 already perturbs `this.camera.position` around `this.camBase`; now `camBase` itself breathes toward the field center.)

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "SliceRenderer3D" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: In-browser verification**

- Bloom visibly swells on strong beats and relaxes in quiet passages.
- The camera gently pushes in on the beat (disabled under reduced-motion).
- The pulse feels musical, not jittery (smoothing comes from the analyser's `smoothingTimeConstant`).

- [ ] **Step 4: Commit**

```bash
git add lib/game/render3d/SliceRenderer3D.ts
git commit -m "feat(slice-it): beat-reactive bloom swell and camera breath"
```

---

## Task 11: Modifier parity — spin, + reduced-motion/WebGL final pass

`invisible`, `oneTrack`, and `speed` are already honored via `FieldCtx`/`fieldMapping`. This task adds the **spin** modifier (whole-field rotation) and does a final accessibility/robustness pass. **Verified in-browser.**

**Files:**
- Modify: `lib/game/render3d/SliceRenderer3D.ts`, `components/game/GameCanvas.tsx`

- [ ] **Step 1: Spin modifier (rotate the field group via camera roll)**

In `SliceRenderer3D.ts`, in `renderFrame` after computing `ctx`:
```ts
    // Spin modifier: slowly roll the whole view (parity with 2D field rotation).
    if (useGameStore.getState().modifiers.spin) {
      const roll = -audioTime * 0.25;
      const baseUp = this.isMobileV ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const forward = new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), this.camera.position).normalize();
      this.camera.up.copy(baseUp).applyAxisAngle(forward, roll);
      this.camera.lookAt(0, 0, 0);
    }
```

- [ ] **Step 2: React to runtime reduced-motion changes + context loss**

In `components/game/GameCanvas.tsx`, add an effect that forwards live reduced-motion changes (some users toggle mid-session):
```ts
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const on = () => rendererRef.current?.setReducedFx(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
```
Also handle WebGL context loss gracefully — in the same file, after the canvas is available (e.g. in the engine-init effect, right after the renderer is constructed), add listeners that surface the fallback message instead of a frozen canvas:
```ts
        const canvasEl = canvasRef.current;
        const onLost = (e: Event) => { e.preventDefault(); setWebglFailed(true); };
        canvasEl?.addEventListener('webglcontextlost', onLost as EventListener);
        // cleanup in the effect's return:
        // canvasEl?.removeEventListener('webglcontextlost', onLost as EventListener);
```

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "SliceRenderer3D|GameCanvas" || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: In-browser verification (full modifier matrix)**

Enable each modifier from the menu and confirm:
- **spin** — the field slowly rotates; notes remain hittable and on-time.
- **invisible** — notes fade out before the hit line.
- **oneTrack** — both lanes collapse to a single centered rail; notes still color-coded by origin lane.
- **speed** (e.g. 1.5×, 2×) — notes scroll faster but still land on the beat.
- Combine spin + invisible to ensure no interaction crashes.
- Reduced-motion toggled mid-song dampens shake/aberration/grain/breath live.

- [ ] **Step 5: Commit**

```bash
git add lib/game/render3d/SliceRenderer3D.ts components/game/GameCanvas.tsx
git commit -m "feat(slice-it): spin modifier, live reduced-motion + context-loss handling"
```

---

## Task 12: Dead-code removal, full verification, review

**Files:**
- Modify: `components/game/GameCanvas.tsx`, `components/slice-it/slice-it.css` (and delete any now-unused 2D helpers).

- [ ] **Step 1: Remove remaining Canvas-2D remnants**

- Confirm `render()`, `spawnParticles`, `particlesRef`, `lastHitTimeRef`, `interpolateHex`, and the `COLORS` object are all deleted from `GameCanvas.tsx` (search the file).
- Remove any now-unused imports.
- In `components/slice-it/slice-it.css`, delete CSS variables only the old 2D renderer read (`--slice-bg`, `--slice-shadow-dark`, `--slice-shadow-light`, `--slice-hold-trail`) **if** nothing else references them. Verify first:
  ```bash
  grep -rn "slice-shadow-dark\|slice-hold-trail\|slice-bg\|slice-shadow-light" components app lib | grep -v slice-it.css
  ```
  Remove only the vars with no remaining references.

- [ ] **Step 2: Run the full unit suite**

Run: `node_modules/.bin/vitest run lib/__tests__/slice-it-field-mapping.test.ts lib/__tests__/slice-it-palette.test.ts lib/__tests__/slice-it-impact-config.test.ts lib/__tests__/slice-it-beat-energy.test.ts`
Expected: all green (19 tests total).

- [ ] **Step 3: Full project type-check**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: no errors introduced by this work. (Pre-existing errors unrelated to `slice-it`/`render3d`/`GameCanvas` may exist; confirm none are in changed files.)

- [ ] **Step 4: End-to-end in-browser verification**

Play at least two full songs (one calm, one intense), on desktop and in a portrait window:
- Note timing matches audio for the whole song; no drift.
- All seven note types render and behave; multiplayer still syncs (if testable).
- Keyboard, mouse, gamepad, and touch input all register hits.
- Pause/resume, countdown, and song-end → results flow work.
- No memory growth across songs (DevTools performance/memory); leaving the route disposes cleanly (no WebGL warnings).
- The game has clearly more "pop": bloom, beat reactivity, impact bursts, neon void.

- [ ] **Step 5: Senior review before PR**

Per repo workflow, run the `senior-swe-reviewer` agent on the branch diff and address findings. Then this branch is ready for a single PR.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(slice-it): remove dead Canvas-2D renderer code and unused styles"
```

---

## Self-Review Notes (coverage check vs spec)

- **Renderer subsystem (6 files)** → Tasks 5–10 create `SliceRenderer3D`, `NoteField`, `PostFX`, `EffectsLayer`, `Environment`, `palette` (+ `fieldMapping`, `impactConfig`, `audioAnalysis` helpers). ✓
- **Full replacement of `render()` + CPU particles** → Tasks 5, 12. ✓
- **2.5D field, timing parity, both orientations** → Task 3 (math), Tasks 5–6 (camera + notes). ✓
- **Blue/pink neon palette** → Task 2. ✓
- **Beat-reactive world** → Tasks 1, 9, 10. ✓
- **Slice impact FX + screen shake** → Task 8. ✓
- **Neon void environment** → Task 9. ✓
- **Screen FX & grade (bloom/aberration/vignette/grain)** → Task 7. ✓
- **AudioManager analyser tap** → Task 1. ✓
- **Modifier parity (spin/invisible/oneTrack/speed)** → Tasks 3, 6, 11. ✓
- **Reduced-motion + WebGL-fail safety net** → Tasks 5, 7, 11. ✓
- **All seven note types** → Task 6. ✓
- **One branch / one PR** → Task 12 ends review-ready. ✓
