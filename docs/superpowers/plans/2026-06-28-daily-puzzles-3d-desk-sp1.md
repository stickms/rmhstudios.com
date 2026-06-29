# Daily Puzzles 3D "The Daily" Desk — SP1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 2D Daily Puzzles hub with an immersive 3D "office desk + newspaper" scene whose front-page clippings (Temple-style 3D buttons) launch puzzles rendered embedded on the newspaper page, with the Spectrum game wired end-to-end as the proof.

**Architecture:** A persistent R3F `<Canvas>` desk scene is hoisted into the `/daily` layout route so it survives hub↔game navigation. A small zustand store holds the focused mode; the front-page maps a shared mode array into 3D `Button3D` clippings; selecting one navigates and leans the camera in; the active game renders inside a `drei <Html transform>` panel mapped onto the newspaper page in perspective, re-skinned with a newsprint CSS theme. Temple of Joy's `ui3d` toolkit is **copied and re-themed** into `components/daily-puzzles/three/` (Temple untouched).

**Tech Stack:** TanStack Start + TanStack Router, React 19, TypeScript, Tailwind v4, `three@^0.183`, `@react-three/fiber@^9`, `@react-three/drei@^10`, `zustand`, `vitest` (node env), `react-i18next`.

## Global Constraints

- **No DOM test environment.** vitest runs `environment: 'node'` with include glob `lib/__tests__/**/*.test.ts`. Do NOT write `.test.tsx`/component DOM tests — they won't run. Put testable logic in pure `lib/` helpers; verify components via typecheck + lint + `vite build` + manual browser.
- **Run binaries directly** (pnpm wrappers are blocked): `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run <file>`, `./node_modules/.bin/eslint <files>`, `./node_modules/.bin/vite build`.
- **Route-tree is generated.** Adding/﻿changing file routes makes `tsc` error until `app/routeTree.gen.ts` regenerates, which only happens when Vite runs. Run `./node_modules/.bin/vite build` to regenerate, then commit the updated `routeTree.gen.ts`. If the build also edits `pnpm-workspace.yaml`, revert that file (unrelated build-approval noise).
- **Asset-light:** no external HDR/model/font downloads. All textures procedural via 2D canvas (`canvasLabel`/`newsprintTexture`/`glowTexture`); all geometry from three/drei primitives. Matches repo convention.
- **Mobile-first:** capped/adaptive DPR, `touch-action: none`, `useTap` tap-vs-drag discrimination on every clickable mesh.
- **Do NOT modify anything under `components/temple-of-joy/` or `lib/temple-of-joy/`.** The toolkit is copied, not shared.
- **i18n:** user-facing strings use `useTranslation('c-daily-puzzles')` with `defaultValue`, mirroring existing daily code.
- **Visual identity:** cool slate + ink, crisp serif, soft daylight (desk lamp), low bloom. Per-puzzle accent colors pop against the neutral world.

---

## File Structure

**New pure logic (unit-tested):**
- `lib/daily-puzzles/desk-layout.ts` — grid layout math for clippings.
- `lib/daily-puzzles/desk-modes.ts` — shared mode definitions with cool accent colors + helpers.
- `lib/daily-puzzles/desk-store.ts` — zustand store for `focusedMode`.

**New 3D components (verified via typecheck/build/manual):**
- `components/daily-puzzles/three/ui3d/Button3D.tsx` — copied, audio-agnostic, re-themed.
- `components/daily-puzzles/three/ui3d/Label3D.tsx`, `Panel3D.tsx`, `canvasLabel.ts`, `overlay.tsx` — copied.
- `components/daily-puzzles/three/useTap.ts`, `glowTexture.ts` — copied/re-themed.
- `components/daily-puzzles/three/newsprintTexture.ts` — procedural newsprint page texture.
- `components/daily-puzzles/three/DeskEnvironment.tsx` — cool daylight lighting.
- `components/daily-puzzles/three/DeskProps.tsx` — desk, lamp, coffee, pencils, sticky notes.
- `components/daily-puzzles/three/Newspaper.tsx` — page plane + masthead + progress stamp.
- `components/daily-puzzles/three/FrontPage.tsx` — clipping buttons (hub) using desk-layout.
- `components/daily-puzzles/three/DeskGameFrame.tsx` — `<Html transform>` embed + camera lean.
- `components/daily-puzzles/three/DeskScene.tsx` — `<Canvas>` assembling the world.
- `components/daily-puzzles/desk-newsprint.css` — newsprint CSS theme for embedded games.

**Modified routes:**
- `app/routes/daily.tsx` — hosts the persistent `DeskScene`.
- `app/routes/daily/index.tsx` — clears focus (front page).
- `app/routes/daily/spectrum.tsx` — mounts `DeskGameFrame` with `SpectrumGame`.

---

## Task 1: Front-page grid layout helper

Pure math that positions N clippings in a centered responsive grid on the newspaper page. Extracted from Temple's `TabBar` inline math so it is unit-testable.

**Files:**
- Create: `lib/daily-puzzles/desk-layout.ts`
- Test: `lib/__tests__/desk-layout.test.ts`

**Interfaces:**
- Produces: `gridLayout(count: number, areaW: number, opts?: { cellW?: number; cellH?: number; gapX?: number; gapY?: number; maxPerRow?: number }): { positions: [number, number][]; cellW: number; cellH: number; perRow: number; rows: number }` — `positions[i]` is the `[x, y]` center of cell `i` in local units, the grid centered on origin, row 0 at the top.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/desk-layout.test.ts
import { describe, it, expect } from 'vitest';
import { gridLayout } from '../daily-puzzles/desk-layout';

describe('gridLayout', () => {
  it('centers a single row horizontally around x=0', () => {
    const { positions, perRow, rows } = gridLayout(3, 10, { cellW: 2, gapX: 0.5, maxPerRow: 6 });
    expect(perRow).toBe(3);
    expect(rows).toBe(1);
    const xs = positions.map((p) => p[0]);
    expect(xs[0]).toBeCloseTo(-2.5);
    expect(xs[1]).toBeCloseTo(0);
    expect(xs[2]).toBeCloseTo(2.5);
    // single row sits on the horizontal axis
    expect(positions.every((p) => Math.abs(p[1]) < 1e-9)).toBe(true);
  });

  it('wraps into rows with the top row highest in y', () => {
    const { positions, perRow, rows } = gridLayout(6, 5, { cellW: 2, cellH: 1, gapX: 0.2, gapY: 0.4, maxPerRow: 2 });
    expect(perRow).toBe(2);
    expect(rows).toBe(3);
    // item 0 (top row) has greater y than item 4 (bottom row)
    expect(positions[0][1]).toBeGreaterThan(positions[4][1]);
  });

  it('never exceeds maxPerRow and stays >= 1 per row', () => {
    const { perRow } = gridLayout(6, 100, { cellW: 1, maxPerRow: 3 });
    expect(perRow).toBe(3);
    const narrow = gridLayout(6, 0.1, { cellW: 1, maxPerRow: 3 });
    expect(narrow.perRow).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/__tests__/desk-layout.test.ts`
Expected: FAIL — cannot resolve `../daily-puzzles/desk-layout`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/daily-puzzles/desk-layout.ts
export interface GridOptions {
  cellW?: number;
  cellH?: number;
  gapX?: number;
  gapY?: number;
  maxPerRow?: number;
}

export interface GridResult {
  positions: [number, number][];
  cellW: number;
  cellH: number;
  perRow: number;
  rows: number;
}

/**
 * Lays out `count` equal cells in a centered grid (origin at the grid center,
 * row 0 at the top). `perRow` is chosen to fit `areaW`, clamped to
 * [1, maxPerRow]. Returns each cell's [x, y] center in local units.
 */
export function gridLayout(count: number, areaW: number, opts: GridOptions = {}): GridResult {
  const cellW = opts.cellW ?? 2;
  const cellH = opts.cellH ?? 1;
  const gapX = opts.gapX ?? 0.2;
  const gapY = opts.gapY ?? 0.2;
  const maxPerRow = opts.maxPerRow ?? count;

  const fit = Math.floor((areaW + gapX) / (cellW + gapX));
  const perRow = Math.max(1, Math.min(maxPerRow, count, isFinite(fit) ? fit : 1));
  const rows = Math.ceil(count / perRow);
  const stepX = cellW + gapX;
  const stepY = cellH + gapY;

  const positions: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = i % perRow;
    const x = (col - (inRow - 1) / 2) * stepX;
    const y = ((rows - 1) / 2 - row) * stepY;
    positions.push([x, y]);
  }
  return { positions, cellW, cellH, perRow, rows };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/__tests__/desk-layout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/daily-puzzles/desk-layout.ts lib/__tests__/desk-layout.test.ts
git commit -m "feat(daily-3d): add front-page grid layout helper"
```

---

## Task 2: Shared mode definitions with cool accents

Move the puzzle list out of `DailyPuzzleHub.tsx` into a shared, framework-agnostic module so both the 3D front page and (later) other surfaces consume one source of truth. Adds a hex `accent` per mode for the 3D button emissive (the existing `color` is a Tailwind gradient string, unusable in three.js).

**Files:**
- Create: `lib/daily-puzzles/desk-modes.ts`
- Test: `lib/__tests__/desk-modes.test.ts`

**Interfaces:**
- Produces:
  - `interface DeskMode { id: string; title: string; emoji: string; descriptionKey: string; descriptionDefault: string; accent: string }`
  - `const DESK_MODES: DeskMode[]` — order: `lights-out, alibi, spectrum, outcast, chainlink, impostor`.
  - `function modeById(id: string): DeskMode | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/desk-modes.test.ts
import { describe, it, expect } from 'vitest';
import { DESK_MODES, modeById } from '../daily-puzzles/desk-modes';

describe('DESK_MODES', () => {
  it('has the six daily modes in order', () => {
    expect(DESK_MODES.map((m) => m.id)).toEqual([
      'lights-out', 'alibi', 'spectrum', 'outcast', 'chainlink', 'impostor',
    ]);
  });

  it('every mode has a hex accent color', () => {
    for (const m of DESK_MODES) {
      expect(m.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('modeById finds and misses correctly', () => {
    expect(modeById('spectrum')?.title).toBe('Spectrum');
    expect(modeById('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/__tests__/desk-modes.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```ts
// lib/daily-puzzles/desk-modes.ts
export interface DeskMode {
  id: string;
  title: string;
  emoji: string;
  descriptionKey: string;
  descriptionDefault: string;
  /** Hex accent for the 3D clipping's emissive/glow. */
  accent: string;
}

export const DESK_MODES: DeskMode[] = [
  { id: 'lights-out', title: 'Lights Out', emoji: '🔦', descriptionKey: 'lights-out-desc', descriptionDefault: 'Turn off every light. Tap to toggle neighbors.', accent: '#e0a73a' },
  { id: 'alibi', title: 'Alibi', emoji: '🔍', descriptionKey: 'alibi-desc', descriptionDefault: 'Four suspects. One liar. Find the contradiction.', accent: '#e0563a' },
  { id: 'spectrum', title: 'Spectrum', emoji: '🌈', descriptionKey: 'spectrum-desc', descriptionDefault: 'Rank 5 items along a hidden scale.', accent: '#9b6cff' },
  { id: 'outcast', title: 'Outcast', emoji: '🎭', descriptionKey: 'outcast-desc', descriptionDefault: 'Five rounds. Spot the odd one out.', accent: '#36c2a4' },
  { id: 'chainlink', title: 'Chainlink', emoji: '🔗', descriptionKey: 'chainlink-desc', descriptionDefault: 'Connect two words through association jumps.', accent: '#3aa0e0' },
  { id: 'impostor', title: 'Impostor', emoji: '🤥', descriptionKey: 'impostor-desc', descriptionDefault: 'Five facts. Two are lies. Find the fakes.', accent: '#d9c23a' },
];

export function modeById(id: string): DeskMode | undefined {
  return DESK_MODES.find((m) => m.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/__tests__/desk-modes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/daily-puzzles/desk-modes.ts lib/__tests__/desk-modes.test.ts
git commit -m "feat(daily-3d): add shared desk-mode defs with cool accents"
```

---

## Task 3: Focused-mode store

A tiny zustand store holding which puzzle is focused (drives the camera lean and which game is mounted). zustand runs in node, so this is unit-testable.

**Files:**
- Create: `lib/daily-puzzles/desk-store.ts`
- Test: `lib/__tests__/desk-store.test.ts`

**Interfaces:**
- Produces: `useDeskStore` (zustand hook) with state `{ focusedMode: string | null; setFocusedMode(id: string | null): void }`. Imperative access via `useDeskStore.getState()`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/desk-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDeskStore } from '../daily-puzzles/desk-store';

describe('useDeskStore', () => {
  beforeEach(() => useDeskStore.getState().setFocusedMode(null));

  it('defaults to no focused mode', () => {
    expect(useDeskStore.getState().focusedMode).toBeNull();
  });

  it('sets and clears the focused mode', () => {
    useDeskStore.getState().setFocusedMode('spectrum');
    expect(useDeskStore.getState().focusedMode).toBe('spectrum');
    useDeskStore.getState().setFocusedMode(null);
    expect(useDeskStore.getState().focusedMode).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/__tests__/desk-store.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```ts
// lib/daily-puzzles/desk-store.ts
import { create } from 'zustand';

interface DeskState {
  focusedMode: string | null;
  setFocusedMode: (id: string | null) => void;
}

/** Which puzzle the desk camera is leaning into. null = front page. */
export const useDeskStore = create<DeskState>((set) => ({
  focusedMode: null,
  setFocusedMode: (id) => set({ focusedMode: id }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/__tests__/desk-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/daily-puzzles/desk-store.ts lib/__tests__/desk-store.test.ts
git commit -m "feat(daily-3d): add focused-mode desk store"
```

---

## Task 4: Copy & re-theme the ui3d toolkit (audio-agnostic)

Copy Temple's primitives into Daily and strip the `templeAudio` coupling. No behavior change beyond the audio hook becoming an optional prop and themed defaults.

**Files:**
- Create: `components/daily-puzzles/three/useTap.ts` (verbatim copy of `components/temple-of-joy/three/useTap.ts`)
- Create: `components/daily-puzzles/three/glowTexture.ts` (copy; cool gradient — see below)
- Create: `components/daily-puzzles/three/ui3d/canvasLabel.ts` (verbatim copy of Temple's)
- Create: `components/daily-puzzles/three/ui3d/overlay.tsx` (verbatim copy of Temple's `ui3d/overlay.tsx`)
- Create: `components/daily-puzzles/three/ui3d/Label3D.tsx` (verbatim copy)
- Create: `components/daily-puzzles/three/ui3d/Panel3D.tsx` (verbatim copy of Temple's)
- Create: `components/daily-puzzles/three/ui3d/Button3D.tsx` (copy, de-coupled — see below)

**Interfaces:**
- Produces: `Button3D` with props `{ label, onClick, width?, height?, enabled?, color?, textColor?, pulse?, fontSize?, position?, billboard?, onPlaySound? }`. `useTap(onTap)`, `getGlowTexture()`, `CameraOverlay`, `useOverlaySize`, `makeLabelTexture`, `Label3D`, `Panel3D` — same signatures as Temple's.

- [ ] **Step 1: Copy the unchanged primitives**

Copy these files **verbatim** (only the file location changes — internal relative imports already resolve within the new `three/` dir):
- `components/temple-of-joy/three/useTap.ts` → `components/daily-puzzles/three/useTap.ts`
- `components/temple-of-joy/three/ui3d/canvasLabel.ts` → `components/daily-puzzles/three/ui3d/canvasLabel.ts`
- `components/temple-of-joy/three/ui3d/overlay.tsx` → `components/daily-puzzles/three/ui3d/overlay.tsx`
- `components/temple-of-joy/three/ui3d/Label3D.tsx` → `components/daily-puzzles/three/ui3d/Label3D.tsx`
- `components/temple-of-joy/three/ui3d/Panel3D.tsx` → `components/daily-puzzles/three/ui3d/Panel3D.tsx`

```bash
mkdir -p components/daily-puzzles/three/ui3d
cp components/temple-of-joy/three/useTap.ts components/daily-puzzles/three/useTap.ts
cp components/temple-of-joy/three/ui3d/canvasLabel.ts components/daily-puzzles/three/ui3d/canvasLabel.ts
cp components/temple-of-joy/three/ui3d/overlay.tsx components/daily-puzzles/three/ui3d/overlay.tsx
cp components/temple-of-joy/three/ui3d/Label3D.tsx components/daily-puzzles/three/ui3d/Label3D.tsx
cp components/temple-of-joy/three/ui3d/Panel3D.tsx components/daily-puzzles/three/ui3d/Panel3D.tsx
```

- [ ] **Step 2: Create the cool-themed glow texture**

```ts
// components/daily-puzzles/three/glowTexture.ts
import * as THREE from 'three';

// Cool radial-gradient sprite texture for cheap halos/bloom on the desk. Slate
// core fading to transparent — generated at runtime, no network asset.
let cached: THREE.CanvasTexture | null = null;

export function getGlowTexture(): THREE.CanvasTexture {
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(210,224,245,0.9)');
  g.addColorStop(0.5, 'rgba(150,176,220,0.32)');
  g.addColorStop(1.0, 'rgba(150,176,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cached = tex;
  return tex;
}
```

- [ ] **Step 3: Create the audio-agnostic, re-themed Button3D**

This is Temple's `Button3D` with two changes: (a) the `templeAudio` import is removed and replaced by an optional `onPlaySound` prop (default no-op), and (b) the default `color` and the slab base color are cool/slate.

```tsx
// components/daily-puzzles/three/ui3d/Button3D.tsx
'use client';

import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard, RoundedBox } from '@react-three/drei';
import { makeLabelTexture } from './canvasLabel';
import { getGlowTexture } from '../glowTexture';
import { useTap } from '../useTap';

interface Button3DProps {
  label: string;
  onClick: () => void;
  width?: number;
  height?: number;
  enabled?: boolean;
  /** Accent/emissive colour. */
  color?: string;
  textColor?: string;
  /** Energetic pulsing glow (e.g. unsolved / ready). */
  pulse?: boolean;
  fontSize?: number;
  position?: [number, number, number];
  billboard?: boolean;
  /** Optional click sound hook (default: silent). */
  onPlaySound?: () => void;
}

/**
 * A real 3D button: a rounded slab with a canvas-text face, a glow halo and
 * springy hover/press animation. Audio-agnostic (pass onPlaySound to wire a
 * click sound). Tap vs camera-drag is handled by useTap.
 */
export function Button3D({
  label,
  onClick,
  width = 2,
  height = 0.6,
  enabled = true,
  color = '#8fb0dc',
  textColor = '#f4f6fb',
  pulse = false,
  fontSize = 44,
  position = [0, 0, 0],
  billboard = true,
  onPlaySound,
}: Button3DProps) {
  const lbl = useMemo(() => makeLabelTexture(label, { fontSize, color: textColor, maxWidth: 520 }), [label, fontSize, textColor]);
  const glow = useMemo(() => getGlowTexture(), []);
  const accent = useMemo(() => new THREE.Color(color), [color]);

  const group = useRef<THREE.Group>(null);
  const backMat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const [hovered, setHovered] = useState(false);
  const punch = useRef(0);

  const maxW = width * 0.88;
  const maxH = height * 0.62;
  let lw = maxW;
  let lh = lw / lbl.aspect;
  if (lh > maxH) { lh = maxH; lw = lh * lbl.aspect; }

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    punch.current = Math.max(0, punch.current - dt * 4);
    if (group.current) {
      const target = (hovered && enabled ? 1.09 : 1) * (1 - punch.current * 0.12);
      group.current.scale.x += (target - group.current.scale.x) * Math.min(1, dt * 14);
      group.current.scale.y = group.current.scale.z = group.current.scale.x;
    }
    if (backMat.current) {
      const base = enabled ? (pulse ? 0.5 + Math.sin(t * 5) * 0.35 : 0.24) : 0.05;
      backMat.current.emissiveIntensity = base + (hovered && enabled ? 0.5 : 0);
    }
    if (halo.current) {
      const m = halo.current.material as THREE.SpriteMaterial;
      m.opacity = (pulse && enabled ? 0.34 + Math.sin(t * 5) * 0.18 : 0.1) + (hovered && enabled ? 0.26 : 0);
      halo.current.scale.set(width * 1.5, height * 2.2, 1);
    }
  });

  const tap = useTap(() => { if (enabled) { onPlaySound?.(); onClick(); } });

  const content = (
    <group ref={group} position={position}>
      <sprite ref={halo} position={[0, 0, -0.08]} scale={[width * 1.5, height * 2.2, 1]}>
        <spriteMaterial map={glow} color={accent} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.1} />
      </sprite>
      <RoundedBox
        args={[width, height, 0.14]}
        radius={Math.min(0.12, height * 0.28)}
        smoothness={3}
        {...tap}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => { punch.current = 1; tap.onPointerDown(e); }}
      >
        <meshStandardMaterial
          ref={backMat}
          color={enabled ? '#26303c' : '#1a2129'}
          emissive={accent}
          emissiveIntensity={0.24}
          metalness={0.45}
          roughness={0.4}
          transparent
          opacity={0.96}
        />
      </RoundedBox>
      <mesh position={[0, 0, 0.085]} renderOrder={3}>
        <planeGeometry args={[lw, lh]} />
        <meshBasicMaterial map={lbl.texture} transparent depthWrite={false} toneMapped={false} opacity={enabled ? 1 : 0.5} />
      </mesh>
    </group>
  );

  return billboard ? <Billboard>{content}</Billboard> : content;
}
```

- [ ] **Step 4: Typecheck and lint the new toolkit**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: PASS (no errors referencing `components/daily-puzzles/three/**`).
Run: `./node_modules/.bin/eslint components/daily-puzzles/three`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add components/daily-puzzles/three
git commit -m "feat(daily-3d): copy + re-theme ui3d toolkit (audio-agnostic)"
```

---

## Task 5: Newsprint page texture + Newspaper component

The hero prop: a textured page plane for *THE DAILY* with masthead, date, puzzle number, column rules and a halftone filler — all drawn to a canvas. Plus a "X / 6 SOLVED" progress stamp.

**Files:**
- Create: `components/daily-puzzles/three/newsprintTexture.ts`
- Create: `components/daily-puzzles/three/Newspaper.tsx`

**Interfaces:**
- Consumes: `getPuzzleNumber`, `formatDateKey`, `getTodayEST` from `@/lib/daily-puzzles/seed`.
- Produces:
  - `makeNewsprintTexture(opts: { title: string; dateText: string; issueText: string }): THREE.CanvasTexture` — a 1024×1448 (≈ portrait page) newsprint texture, cached by its option key.
  - `Newspaper({ solvedCount, total }: { solvedCount: number; total: number })` — a `<group>` containing the page plane (lying flat on the desk, normal up) and a `Label3D` "SOLVED" stamp.

- [ ] **Step 1: Implement the newsprint texture**

```ts
// components/daily-puzzles/three/newsprintTexture.ts
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

export interface NewsprintOptions {
  title: string;
  dateText: string;
  issueText: string;
}

/** Draws a stylized newspaper front page to a CanvasTexture (cached by key). */
export function makeNewsprintTexture(opts: NewsprintOptions): THREE.CanvasTexture {
  const key = `${opts.title}|${opts.dateText}|${opts.issueText}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = 1024;
  const H = 1448;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Paper
  ctx.fillStyle = '#efeae0';
  ctx.fillRect(0, 0, W, H);
  // Subtle vignette / aged tint
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(120,110,90,0.12)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const ink = '#1c1a16';
  const margin = 56;

  // Masthead
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = "700 124px Georgia, 'Times New Roman', serif";
  ctx.fillText(opts.title, W / 2, 150);
  // Rules under masthead
  ctx.fillRect(margin, 188, W - margin * 2, 4);
  ctx.fillRect(margin, 198, W - margin * 2, 2);
  // Date / issue line
  ctx.font = "italic 28px Georgia, serif";
  ctx.fillText(`${opts.dateText}   ·   ${opts.issueText}   ·   PUZZLES EDITION`, W / 2, 236);

  // Column rules
  const colTop = 280;
  const colBottom = H - margin;
  for (const cx of [W / 3, (W * 2) / 3]) {
    ctx.fillStyle = 'rgba(28,26,22,0.35)';
    ctx.fillRect(cx - 1, colTop, 2, colBottom - colTop);
  }

  // Halftone-ish filler text (rows of short ink dashes) so empty areas read as newsprint
  ctx.fillStyle = 'rgba(28,26,22,0.22)';
  for (let y = colTop + 24; y < colBottom; y += 26) {
    for (let band = 0; band < 3; band++) {
      const bx = margin + band * (W / 3) - (band > 0 ? 8 : 0);
      const bw = W / 3 - margin * 0.8;
      let x = bx;
      while (x < bx + bw) {
        const wlen = 12 + ((x * 7 + y * 13) % 40);
        ctx.fillRect(x, y, Math.min(wlen, bx + bw - x), 8);
        x += wlen + 8;
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;

  if (cache.size > 8) {
    const first = cache.keys().next().value as string | undefined;
    if (first) { cache.get(first)?.dispose(); cache.delete(first); }
  }
  cache.set(key, tex);
  return tex;
}
```

- [ ] **Step 2: Implement the Newspaper component**

The page lies flat on the desk (rotated `-Math.PI/2` about X so its +Z normal points up). Page is ~6 wide × ~8.5 tall in world units. The SOLVED stamp sits in the masthead's top-right, billboard off (it's printed on the page) and tilted to match the page.

```tsx
// components/daily-puzzles/three/Newspaper.tsx
'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { makeNewsprintTexture } from './newsprintTexture';
import { Label3D } from './ui3d/Label3D';
import { formatDateKey, getPuzzleNumber, getTodayEST } from '@/lib/daily-puzzles/seed';

export const PAGE_W = 6;
export const PAGE_H = PAGE_W * (1448 / 1024); // ≈ 8.48, matches texture aspect

export function Newspaper({ solvedCount, total }: { solvedCount: number; total: number }) {
  const today = getTodayEST();
  const dateText = formatDateKey(today);
  const issueText = `No. ${getPuzzleNumber(today)}`;
  const tex = useMemo(
    () => makeNewsprintTexture({ title: 'THE DAILY', dateText, issueText }),
    [dateText, issueText],
  );

  return (
    // Lay the page flat: rotate so the printed face points up (+Y).
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh receiveShadow>
        <planeGeometry args={[PAGE_W, PAGE_H]} />
        <meshStandardMaterial map={tex} roughness={0.95} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* SOLVED stamp, printed on the page near the masthead's right edge */}
      <Label3D
        text={`${solvedCount} / ${total} SOLVED`}
        height={0.34}
        billboard={false}
        options={{ color: solvedCount === total ? '#1f7a4d' : '#b23b2e', fontSize: 64, bold: true }}
        position={[PAGE_W / 2 - 1.4, PAGE_H / 2 - 0.55, 0.01]}
      />
    </group>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: PASS.
Run: `./node_modules/.bin/eslint components/daily-puzzles/three/Newspaper.tsx components/daily-puzzles/three/newsprintTexture.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/daily-puzzles/three/newsprintTexture.ts components/daily-puzzles/three/Newspaper.tsx
git commit -m "feat(daily-3d): newsprint page texture + Newspaper hero prop"
```

---

## Task 6: Desk environment + desk props

Cool daylight lighting (the desk lamp as key) and asset-light props that frame the newspaper: desk surface, lamp, coffee cup + ring, pencils, sticky notes.

**Files:**
- Create: `components/daily-puzzles/three/DeskEnvironment.tsx`
- Create: `components/daily-puzzles/three/DeskProps.tsx`

**Interfaces:**
- Produces: `DeskEnvironment()` and `DeskProps()` — both `<group>`/fragment scene content (no props).

- [ ] **Step 1: Implement DeskEnvironment**

```tsx
// components/daily-puzzles/three/DeskEnvironment.tsx
'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';

/** Cool daylight lighting for the desk: soft sky fill, a warm-white desk-lamp
 *  key light, low bloom, baked PBR reflections (no external HDR). */
export function DeskEnvironment() {
  return (
    <>
      <color attach="background" args={['#cdd4de']} />
      <fog attach="fog" args={['#cdd4de', 22, 60]} />

      {/* Cool sky / cool ground fill */}
      <hemisphereLight intensity={0.85} color="#eaf0fb" groundColor="#9aa3af" />
      {/* Desk lamp key (warm white, from upper-left where the lamp sits) */}
      <directionalLight position={[-6, 11, 5]} intensity={1.8} color="#fff4e0" />
      {/* Cool rim for separation */}
      <pointLight position={[7, 5, -4]} intensity={6} color="#a9c4ff" distance={30} decay={2} />

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[-5, 8, 4]} scale={7} />
        <Lightformer form="circle" intensity={1.6} color="#dfe9ff" position={[6, 4, 5]} scale={5} />
        <Lightformer form="circle" intensity={1.1} color="#cdd9f2" position={[-7, 2, -3]} scale={4} />
      </Environment>

      <ContactShadows position={[0, -0.01, 0]} opacity={0.34} scale={40} blur={2.6} far={10} resolution={512} color="#2a2f38" />
    </>
  );
}
```

- [ ] **Step 2: Implement DeskProps**

All primitive geometry; positioned so the newspaper (centered at origin, lying flat just above the desk surface) is the focus. The desk surface sits at y ≈ -0.05.

```tsx
// components/daily-puzzles/three/DeskProps.tsx
'use client';

import { RoundedBox } from '@react-three/drei';

/** Asset-light desk dressing around the newspaper: desk surface, lamp, coffee,
 *  pencils, sticky notes. Pure primitives — no external models. */
export function DeskProps() {
  return (
    <group>
      {/* Desk surface (large felt/wood slab) */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#5b4a3a" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Desk edge lip (front) */}
      <mesh position={[0, -0.2, 11]}>
        <boxGeometry args={[40, 0.4, 0.6]} />
        <meshStandardMaterial color="#4a3b2d" roughness={0.8} />
      </mesh>

      {/* Desk lamp (upper-left): base, arm, head */}
      <group position={[-6.2, 0, -3.5]}>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.7, 0.8, 0.12, 24]} />
          <meshStandardMaterial color="#2b3340" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0.6, 1.4, 0.3]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.06, 0.06, 3, 12]} />
          <meshStandardMaterial color="#39424f" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[1.7, 2.7, 0.9]} rotation={[0.9, 0, -0.8]}>
          <coneGeometry args={[0.6, 0.8, 24, 1, true]} />
          <meshStandardMaterial color="#2b3340" metalness={0.6} roughness={0.35} side={2} />
        </mesh>
        {/* warm bulb glow */}
        <pointLight position={[1.7, 2.5, 1.2]} intensity={5} color="#ffe3b0" distance={12} decay={2} />
      </group>

      {/* Coffee cup + saucer ring (right) */}
      <group position={[4.6, 0, 3.2]}>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.5, 0.42, 0.9, 24]} />
          <meshStandardMaterial color="#e8e4dc" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.84, 0]}>
          <cylinderGeometry args={[0.44, 0.44, 0.06, 24]} />
          <meshStandardMaterial color="#3a2a1c" roughness={0.3} />
        </mesh>
        {/* coffee ring stain on the desk */}
        <mesh position={[-1.1, -0.06, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.46, 24]} />
          <meshStandardMaterial color="#6b4a2e" transparent opacity={0.5} roughness={1} />
        </mesh>
      </group>

      {/* Pencils (bottom-right) */}
      {[0, 0.18, -0.16].map((rot, i) => (
        <mesh key={i} position={[3.4 + i * 0.22, 0.02, 5.4]} rotation={[-Math.PI / 2, 0, rot + 0.4]}>
          <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
          <meshStandardMaterial color={['#e0b53a', '#d96b3a', '#3a72d9'][i]} roughness={0.6} />
        </mesh>
      ))}

      {/* Sticky notes (upper-right) */}
      {[
        { p: [4.2, 0.01, -3.8] as [number, number, number], c: '#f2e15a', r: 0.12 },
        { p: [5.0, 0.012, -3.2] as [number, number, number], c: '#7fe0a8', r: -0.2 },
      ].map((n, i) => (
        <RoundedBox key={i} args={[1.1, 0.02, 1.1]} radius={0.02} position={n.p} rotation={[0, n.r, 0]}>
          <meshStandardMaterial color={n.c} roughness={0.8} />
        </RoundedBox>
      ))}
    </group>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: PASS.
Run: `./node_modules/.bin/eslint components/daily-puzzles/three/DeskEnvironment.tsx components/daily-puzzles/three/DeskProps.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/daily-puzzles/three/DeskEnvironment.tsx components/daily-puzzles/three/DeskProps.tsx
git commit -m "feat(daily-3d): cool desk environment + asset-light desk props"
```

---

## Task 7: Front-page hub (clipping buttons)

Maps `DESK_MODES` to `Button3D` clippings laid out on the page via `gridLayout`, lying flat on the newspaper. Tapping a clipping sets focus + navigates. Reads completion from persistence to drive pulse (unsolved pulses) and a per-clipping "✓" via accent.

**Files:**
- Create: `components/daily-puzzles/three/FrontPage.tsx`

**Interfaces:**
- Consumes: `gridLayout` (Task 1), `DESK_MODES` (Task 2), `useDeskStore` (Task 3), `Button3D` (Task 4), `PAGE_W`/`PAGE_H` (Task 5), `hasCompleted` + `formatDateKey`/`getTodayEST` from seed/persistence, `useNavigate` from `@tanstack/react-router`.
- Produces: `FrontPage({ onSelect }: { onSelect: (id: string) => void })` — scene content (a `<group>` of clipping buttons laid flat on the page).

- [ ] **Step 1: Implement FrontPage**

The clippings sit on the page (rotated flat like the Newspaper) below the masthead. Buttons are `billboard={false}` so they lie on the paper. Layout area is the page width minus margins; vertical origin shifted down to clear the masthead.

```tsx
// components/daily-puzzles/three/FrontPage.tsx
'use client';

import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button3D } from './ui3d/Button3D';
import { Label3D } from './ui3d/Label3D';
import { gridLayout } from '@/lib/daily-puzzles/desk-layout';
import { DESK_MODES } from '@/lib/daily-puzzles/desk-modes';
import { useDeskStore } from '@/lib/daily-puzzles/desk-store';
import { PAGE_W, PAGE_H } from './Newspaper';
import { hasCompleted } from '@/lib/daily-puzzles/persistence';
import { formatDateKey, getTodayEST } from '@/lib/daily-puzzles/seed';

export function FrontPage({ onSelect }: { onSelect: (id: string) => void }) {
  const { t } = useTranslation('c-daily-puzzles');
  const navigate = useNavigate();
  const dateKey = formatDateKey(getTodayEST());

  const layout = useMemo(
    () => gridLayout(DESK_MODES.length, PAGE_W - 1.2, { cellW: 2.3, cellH: 0.9, gapX: 0.3, gapY: 0.45, maxPerRow: 2 }),
    [],
  );

  // Headline above the clipping grid (printed on the page)
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Label3D
        text={t('todays-puzzles-headline', { defaultValue: "TODAY'S PUZZLES" })}
        height={0.32}
        billboard={false}
        options={{ color: '#1c1a16', fontSize: 60, bold: true }}
        position={[0, PAGE_H / 2 - 1.55, 0.02]}
      />
      <group position={[0, -0.4, 0.04]}>
        {DESK_MODES.map((m, i) => {
          const [x, y] = layout.positions[i];
          const done = hasCompleted(m.id, dateKey);
          return (
            <Button3D
              key={m.id}
              label={`${m.emoji}  ${m.title}${done ? '  ✓' : ''}`}
              onClick={() => {
                useDeskStore.getState().setFocusedMode(m.id);
                onSelect(m.id);
                navigate({ to: `/daily/${m.id}` as string });
              }}
              billboard={false}
              width={layout.cellW}
              height={layout.cellH}
              fontSize={32}
              color={m.accent}
              pulse={!done}
              position={[x, y, 0]}
            />
          );
        })}
      </group>
    </group>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: PASS.
Run: `./node_modules/.bin/eslint components/daily-puzzles/three/FrontPage.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/daily-puzzles/three/FrontPage.tsx
git commit -m "feat(daily-3d): front-page hub with 3D clipping buttons"
```

---

## Task 8: DeskGameFrame — embed a game on the page

Renders an existing React game component inside a `drei <Html transform>` panel mapped onto the page plane in perspective, wrapped in a newsprint CSS theme, with a 3D "← Front page" `Button3D`.

**Files:**
- Create: `components/daily-puzzles/desk-newsprint.css`
- Create: `components/daily-puzzles/three/DeskGameFrame.tsx`

**Interfaces:**
- Consumes: `Button3D` (Task 4), `PAGE_W`/`PAGE_H` (Task 5), `useDeskStore` (Task 3), `Html` from `@react-three/drei`, `useNavigate`.
- Produces: `DeskGameFrame({ children, onBack }: { children: React.ReactNode; onBack: () => void })` — scene content placing `children` (the game UI) on the page and a back button.

- [ ] **Step 1: Implement the newsprint CSS theme**

```css
/* components/daily-puzzles/desk-newsprint.css */
.desk-newsprint {
  width: 720px;
  min-height: 1000px;
  padding: 32px 36px;
  background: #efeae0;
  color: #1c1a16;
  font-family: Georgia, 'Times New Roman', serif;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  border: 1px solid #d8d2c4;
  column-rule: 1px solid rgba(28, 26, 22, 0.25);
}
/* Tone the embedded game toward ink-on-paper without rewriting each game:
   neutralize dark backgrounds and map accents to ink. */
.desk-newsprint :is(h1, h2, h3) {
  font-family: Georgia, 'Times New Roman', serif;
  letter-spacing: -0.01em;
}
.desk-newsprint a { color: #5a3a86; }
```

- [ ] **Step 2: Implement DeskGameFrame**

The `<Html transform>` panel is positioned just above the page surface and rotated flat so the DOM is mapped onto the paper in perspective. `distanceFactor` controls DOM-px → world-unit scale. `occlude` hides it behind geometry when rotated away.

```tsx
// components/daily-puzzles/three/DeskGameFrame.tsx
'use client';

import { Html } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import { Button3D } from './ui3d/Button3D';
import { PAGE_H } from './Newspaper';
import '../desk-newsprint.css';

export function DeskGameFrame({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const { t } = useTranslation('c-daily-puzzles');
  return (
    <group>
      {/* Game UI mapped onto the page surface, lying flat (face up). */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <Html
          transform
          occlude
          distanceFactor={6}
          position={[0, -0.3, 0.03]}
          style={{ pointerEvents: 'auto' }}
        >
          <div className="desk-newsprint">{children}</div>
        </Html>
      </group>
      {/* 3D back button floating above the page's top edge (billboarded). */}
      <Button3D
        label={t('back-to-front-page', { defaultValue: '← Front page' })}
        onClick={onBack}
        width={2}
        height={0.5}
        fontSize={34}
        color="#8fb0dc"
        position={[0, 0.4, PAGE_H / 2 + 0.6]}
      />
    </group>
  );
}
```

> Note: `distanceFactor`, `position`, and `.desk-newsprint` width are the three knobs to tune at manual-verification time so the page fills the frame without clipping. Start at the values above.

- [ ] **Step 3: Typecheck and lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: PASS.
Run: `./node_modules/.bin/eslint components/daily-puzzles/three/DeskGameFrame.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/daily-puzzles/desk-newsprint.css components/daily-puzzles/three/DeskGameFrame.tsx
git commit -m "feat(daily-3d): DeskGameFrame embeds game UI on the page"
```

---

## Task 9: DeskScene — assemble the world

The persistent `<Canvas>` that contains the environment, props, newspaper, OrbitControls, and either the FrontPage (no focus) or the focused game's `DeskGameFrame` (children passed in). Camera leans between an overview pose and a focused pose based on `focusedMode`.

**Files:**
- Create: `components/daily-puzzles/three/DeskScene.tsx`

**Interfaces:**
- Consumes: everything above + `useDeskStore`, `hasCompleted`, `DESK_MODES`.
- Produces: `DeskScene({ children }: { children?: React.ReactNode })` — full-screen Canvas. When `children` is provided (a route mounted a game) it is rendered inside `DeskGameFrame`; otherwise the `FrontPage` shows. The component also drives the camera lean each frame.

- [ ] **Step 1: Implement DeskScene**

```tsx
// components/daily-puzzles/three/DeskScene.tsx
'use client';

import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr, AdaptiveEvents, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from '@tanstack/react-router';
import { DeskEnvironment } from './DeskEnvironment';
import { DeskProps } from './DeskProps';
import { Newspaper } from './Newspaper';
import { FrontPage } from './FrontPage';
import { DeskGameFrame } from './DeskGameFrame';
import { useDeskStore } from '@/lib/daily-puzzles/desk-store';
import { DESK_MODES } from '@/lib/daily-puzzles/desk-modes';
import { hasCompleted } from '@/lib/daily-puzzles/persistence';
import { formatDateKey, getTodayEST } from '@/lib/daily-puzzles/seed';

// Two camera poses: overview (front page) and leaned-in (playing).
const OVERVIEW = new THREE.Vector3(0, 9.5, 7.5);
const FOCUSED = new THREE.Vector3(0, 6.2, 4.4);
const OVERVIEW_TGT = new THREE.Vector3(0, 0, 0);
const FOCUSED_TGT = new THREE.Vector3(0, 0, -0.3);

function CameraRig({ focused }: { focused: boolean }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 3);
    const destPos = focused ? FOCUSED : OVERVIEW;
    camera.position.lerp(destPos, k);
    if (controls.current) {
      const tgt = focused ? FOCUSED_TGT : OVERVIEW_TGT;
      controls.current.target.lerp(tgt, k);
      controls.current.update();
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={16}
      minPolarAngle={0.15}
      maxPolarAngle={1.15}
      rotateSpeed={0.6}
      zoomSpeed={0.6}
    />
  );
}

function Contents({ children }: { children?: React.ReactNode }) {
  const navigate = useNavigate();
  const focusedMode = useDeskStore((s) => s.focusedMode);
  const playing = !!children && !!focusedMode;
  const dateKey = formatDateKey(getTodayEST());
  const solved = DESK_MODES.filter((m) => hasCompleted(m.id, dateKey)).length;

  const back = () => {
    useDeskStore.getState().setFocusedMode(null);
    navigate({ to: '/daily' });
  };

  return (
    <>
      <DeskEnvironment />
      <DeskProps />
      <Newspaper solvedCount={solved} total={DESK_MODES.length} />
      {playing ? (
        <DeskGameFrame onBack={back}>{children}</DeskGameFrame>
      ) : (
        <FrontPage onSelect={() => {}} />
      )}
      <CameraRig focused={playing} />
    </>
  );
}

/** Full-screen persistent desk world. Mobile-optimized: capped/adaptive DPR,
 *  touch-action none so gestures drive the camera. */
export function DeskScene({ children }: { children?: React.ReactNode }) {
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas
      shadows={false}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ position: [0, 9.5, 7.5], fov: 45, near: 0.1, far: 140 }}
      style={{ touchAction: 'none' }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <Suspense fallback={null}>
        <Contents>{children}</Contents>
      </Suspense>
    </Canvas>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: PASS.
Run: `./node_modules/.bin/eslint components/daily-puzzles/three/DeskScene.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/daily-puzzles/three/DeskScene.tsx
git commit -m "feat(daily-3d): assemble persistent DeskScene with camera lean"
```

---

## Task 10: Wire the routes (persistent desk + Spectrum proof)

Hoist the desk into the `/daily` layout so it persists; the index route just clears focus (front page); the spectrum route mounts the existing `SpectrumGame` inside the desk via `DeskScene` children.

**Files:**
- Modify: `app/routes/daily.tsx`
- Modify: `app/routes/daily/index.tsx`
- Modify: `app/routes/daily/spectrum.tsx`

**Interfaces:**
- Consumes: `DeskScene` (Task 9), `useDeskStore` (Task 3), existing `SpectrumGame`, `GameErrorBoundary`, `GameLoadingFallback`.

- [ ] **Step 1: Make the `/daily` layout host the persistent desk**

The layout renders the full-screen `DeskScene` once; child routes render into it via a context so a mounted game becomes the scene's `children`. Use a simple module-level approach: the layout reads `useDeskStore.focusedMode`; the index route clears it, the game route sets it and provides the game element through a render context.

Replace `app/routes/daily.tsx` entirely:

```tsx
// app/routes/daily.tsx
/** Daily Puzzles Layout — hosts the persistent 3D desk; child routes feed it. */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';

const DeskScene = lazy(() =>
  import('@/components/daily-puzzles/three/DeskScene').then((m) => ({ default: m.DeskScene })),
);

// Child routes register the game element (or null for the hub) here.
const DeskSlotCtx = createContext<(node: ReactNode) => void>(() => {});
export const useDeskSlot = () => useContext(DeskSlotCtx);

function DailyLayout() {
  const [gameNode, setGameNode] = useState<ReactNode>(null);
  return (
    <div className="fixed inset-0 bg-site-bg text-site-text">
      <GameErrorBoundary gameName="Daily Puzzles">
        <Suspense fallback={<GameLoadingFallback />}>
          <DeskScene>{gameNode}</DeskScene>
        </Suspense>
      </GameErrorBoundary>
      {/* Hidden mount point: child route runs effects to register its game node */}
      <DeskSlotCtx.Provider value={setGameNode}>
        <Outlet />
      </DeskSlotCtx.Provider>
    </div>
  );
}

export const Route = createFileRoute('/daily')({
  component: DailyLayout,
});
```

- [ ] **Step 2: Index route clears focus (front page)**

```tsx
// app/routes/daily/index.tsx
import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useDeskSlot } from '../daily';
import { useDeskStore } from '@/lib/daily-puzzles/desk-store';

function DailyIndex() {
  const setSlot = useDeskSlot();
  useEffect(() => {
    useDeskStore.getState().setFocusedMode(null);
    setSlot(null);
    return () => setSlot(null);
  }, [setSlot]);
  return null;
}

export const Route = createFileRoute('/daily/')({
  component: DailyIndex,
});
```

- [ ] **Step 3: Spectrum route mounts the game into the desk**

```tsx
// app/routes/daily/spectrum.tsx
import { lazy, Suspense, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { useDeskSlot } from '../daily';
import { useDeskStore } from '@/lib/daily-puzzles/desk-store';

const SpectrumGame = lazy(() =>
  import('@/components/daily-puzzles/SpectrumGame').then((m) => ({ default: m.SpectrumGame })),
);

function SpectrumRoute() {
  const setSlot = useDeskSlot();
  useEffect(() => {
    useDeskStore.getState().setFocusedMode('spectrum');
    setSlot(
      <GameErrorBoundary gameName="Spectrum">
        <Suspense fallback={<GameLoadingFallback />}>
          <SpectrumGame />
        </Suspense>
      </GameErrorBoundary>,
    );
    return () => setSlot(null);
  }, [setSlot]);
  return null;
}

export const Route = createFileRoute('/daily/spectrum')({
  component: SpectrumRoute,
});
```

- [ ] **Step 4: Regenerate the route tree and build**

Run: `./node_modules/.bin/vite build`
Expected: Build succeeds; `app/routeTree.gen.ts` regenerated. If `pnpm-workspace.yaml` was modified by the build, revert it: `git checkout pnpm-workspace.yaml`.

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: PASS (route-tree types now resolve).

- [ ] **Step 6: Commit**

```bash
git add app/routes/daily.tsx app/routes/daily/index.tsx app/routes/daily/spectrum.tsx app/routeTree.gen.ts
git commit -m "feat(daily-3d): host persistent desk in /daily layout; wire Spectrum proof"
```

---

## Task 11: Manual browser verification & tuning

R3F/visual behavior can't be unit-tested here; this task is the explicit manual gate before the SP1 PR. (No new code unless tuning is needed.)

**Files:**
- Possibly tune: `components/daily-puzzles/three/DeskGameFrame.tsx` (`distanceFactor`, `position`, `.desk-newsprint` width), `DeskScene.tsx` (camera poses).

- [ ] **Step 1: Launch the app**

Use the project's run path (per the `run` skill / repo convention). Navigate to `/daily`.

- [ ] **Step 2: Verify the hub**

Confirm: the desk renders with newspaper, lamp, coffee, pencils, sticky notes; cool daylight look (not Temple's gold); masthead reads "THE DAILY" + today's date + "No. N"; six clipping buttons laid out on the page; unsolved clippings pulse; "X / 6 SOLVED" stamp shows the right count.

- [ ] **Step 3: Verify interaction**

Confirm: dragging orbits the desk (does not click a clipping); tapping a clipping navigates to `/daily/<id>` and the camera leans in. Tapping Spectrum embeds the live Spectrum game on the page in perspective and it is playable. The "← Front page" button leans back out and returns to `/daily`. Tune `distanceFactor`/positions if the page clips or is too small.

- [ ] **Step 4: Verify persistence + mobile**

Complete the Spectrum puzzle; return to the hub; confirm the Spectrum clipping shows "✓" and the SOLVED count increments. Open dev tools device emulation (mobile); confirm the scene is responsive and gestures don't scroll the page.

- [ ] **Step 5: Final checks + commit any tuning**

Run: `./node_modules/.bin/tsc --noEmit` → PASS
Run: `./node_modules/.bin/vitest run lib/__tests__/desk-layout.test.ts lib/__tests__/desk-modes.test.ts lib/__tests__/desk-store.test.ts` → PASS
Run: `./node_modules/.bin/vite build` → succeeds

```bash
git add -A
git commit -m "chore(daily-3d): SP1 tuning after manual verification"
```

- [ ] **Step 6: Senior review before PR**

Per repo workflow prefs, run the `senior-swe-reviewer` agent on the branch diff before opening the PR. Address findings, then open the PR.

---

## Notes for SP2–SP7 (out of scope here)

Each remaining puzzle (Alibi, Spectrum*, Outcast, Chainlink, Impostor, Lights Out) gets its own route wired exactly like Task 10's Spectrum route (set focus + register the game node via `useDeskSlot`) and a newsprint pass on its component. *(Spectrum is done in SP1 as the proof.)* No further toolkit/world work should be needed; if a game's UI fights the embed (size/scroll), tune `DeskGameFrame` rather than the toolkit.

## Self-Review

- **Spec coverage:** toolkit copy/re-theme (T4), desk world (T5/T6), front-page hub mapping DESK_MODES (T7), embedded games via `<Html transform>` (T8), persistent layout route (T10), progress stamp secondary surface (T5/T9), one game wired end-to-end (T10), cool identity (T4/T6). Leaderboard/past-issues/share **as 3D desk props** are intentionally deferred past SP1 (the games already render their own leaderboard/share UI inside the embed); only the progress stamp is re-homed in SP1 — consistent with "secondary surfaces re-homed" without expanding SP1's scope.
- **Placeholder scan:** none — all steps have concrete code/commands.
- **Type consistency:** `gridLayout`→`{positions, cellW, cellH, perRow, rows}` used in T7; `DeskMode.accent` used in T7; `useDeskStore.setFocusedMode` used in T7/T9/T10; `DeskScene({children})`, `DeskGameFrame({children,onBack})`, `Newspaper({solvedCount,total})`, `FrontPage({onSelect})`, `useDeskSlot()` all consistent across tasks.
