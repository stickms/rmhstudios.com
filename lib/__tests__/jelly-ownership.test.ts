/**
 * One physics, one arc service, one ambient clock (gate N2, docs/plans/plasmatic-jelly/05-gates-docs-naming.md §2;
 * master plan R3, R4, §4).
 *
 * Liquid Glass said "never add per-component pointer loops". Plasmatic Jelly makes every surface move, so that
 * sentence has to become something a scan can hold: the jelly services are owned in `lib/jelly/` and
 * `lib/liquid/`, mounted from one hook, and everything else reaches them through role classes and `data-jelly*`
 * attributes. Each rule below is a source scan with an allowlist that only shrinks.
 *
 *  (a) Only the jelly modules, the mount hook and the `/jelly` lab import the soft-body / arc SERVICES
 *      (`physics`, `compose`, `arcs`). A component that imports `physics` grows a second soft body.
 *  (b) Inside `lib/jelly/` and `lib/liquid/`, exactly ONE file calls `requestAnimationFrame`: the frame driver
 *      `lib/jelly/frame.ts` (#989, CLAUDE.md "Design system: Plasmatic Jelly" → Performance). The engine's ambient
 *      clock and rim draws, the soft body, the arc renderer and the fallback light register drivers on it with
 *      `drive(fn, { order })`. `raf-loop-allowlist.test.ts` holds it to its settle condition (no frame while no
 *      driver is awake, proven in `lib/jelly/__tests__/frame.test.ts`); this holds the NUMBER of jelly loops at one.
 *      Likewise exactly ONE file, the pointer hub `lib/jelly/pointer.ts`, adds `pointer*` listeners: every service
 *      subscribes with `onJellyPointer(type, fn)` (one capture+passive listener per type, refcounted, proven in
 *      `lib/jelly/__tests__/pointer.test.ts`). Hooks that moved onto both services (`SHARED_FRAME_CLIENTS`, today
 *      `hooks/useFluidDrag.ts` with its settle spring `hooks/fluid-drag-settle.ts`) are held to the same two rules;
 *      that list only grows.
 *  (c) The degraded-root predicate (`.reduce-transparency,.style-high-contrast,.perf-lite`) is declared once, as
 *      `DEGRADED_ROOT_SELECTOR` in `lib/jelly/tiers.ts`. It used to be hand-copied into the engine and the runtime,
 *      and a theme added to one copy left the other drawing.
 *  (d) No site-tier file writes `style.transform` / `style.scale` / `style.translate` in a file that handles
 *      pointer input — a per-component deformation outside the physics service. The baseline is today's gesture
 *      surfaces (a swipe row, a 3D book, the globe, the news hero); games and apps are exempt, read
 *      from `design-consistency.test.ts` like `scripts/check-consistency.sh` does.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function collect(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      collect(rel, out);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      entry.name !== 'routeTree.gen.ts'
    ) {
      out.push(rel);
    }
  }
  return out;
}

/** Same stripping as raf-loop-allowlist.test.ts: a comment documenting a rule is not a violation of it. */
const code = (file: string) =>
  readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const SOURCES = ['components', 'app', 'hooks', 'lib', 'stores'].flatMap((d) => collect(d));

/** The full-screen tiers, parsed out of the design gate (the policy lives there, not here). */
function setFromGate(name: string): Set<string> {
  const src = readFileSync(join(ROOT, 'lib/__tests__/design-consistency.test.ts'), 'utf8');
  const start = src.indexOf(`const ${name} = new Set([`);
  const block = src.slice(start, src.indexOf(']);', start));
  return new Set([...block.matchAll(/^\s*'([a-z0-9-]+)'/gm)].map((m) => m[1]));
}
const FULLSCREEN_TIER_DIRS = setFromGate('FULLSCREEN_TIER_DIRS');
const FULLSCREEN_ROUTE_SEGMENTS = setFromGate('FULLSCREEN_ROUTE_SEGMENTS');

function isSiteTier(file: string): boolean {
  const parts = file.split('/');
  if (parts[0] === 'hooks') return true;
  if (parts[0] === 'components') return !FULLSCREEN_TIER_DIRS.has(parts[1] ?? '');
  if (parts[0] === 'app' && parts[1] === 'routes') {
    return !FULLSCREEN_ROUTE_SEGMENTS.has((parts[2] ?? '').replace(/\.tsx?$/, ''));
  }
  return false;
}

describe('N2 — the jelly services have one owner each', () => {
  it('scans a non-trivial source set, with the tier lists parsed from the design gate', () => {
    expect(SOURCES.length).toBeGreaterThan(1500);
    expect(FULLSCREEN_TIER_DIRS.size).toBeGreaterThan(10);
    expect(FULLSCREEN_ROUTE_SEGMENTS.size).toBeGreaterThan(10);
    expect(FULLSCREEN_TIER_DIRS.has('temple-of-joy')).toBe(true);
  });

  /**
   * (a) Importers of the soft-body / arc services outside the jelly modules. Each entry is a documented API, not a
   * second implementation. One-directional: entries come out, they do not go in.
   */
  const SERVICE_IMPORT_ALLOW = new Map<string, string>([
    [
      'hooks/useFluidDrag.ts',
      'reports drags to the physics service (`reportJellyDrag`) so a dragged surface stretches through the ONE soft body instead of its own (02 §3.4)',
    ],
    [
      'hooks/useCelebration.ts',
      'lazy `dischargeAt` hook-in for celebrations, through the arc runtime and its flash ledger (master plan W2-C)',
    ],
  ]);
  const SERVICE =
    /(?:from\s+|import\(\s*)['"]@\/lib\/jelly\/(?:physics|compose|bridge|arcs)(?:\/[^'"]*)?['"]/;
  const OWNS = (f: string) =>
    f.startsWith('lib/jelly/') ||
    f.startsWith('lib/liquid/') ||
    f === 'hooks/useLiquidInteractions.ts' ||
    /^hooks\/useJelly[\w-]*\.tsx?$/.test(f) ||
    f === 'app/routes/jelly.tsx';

  it('(a) components never import the physics or arc services', () => {
    const offenders = SOURCES.filter(
      (f) => !OWNS(f) && !SERVICE_IMPORT_ALLOW.has(f) && SERVICE.test(code(f)),
    );
    expect(
      offenders,
      'Components take jelly through role classes (`glass-*`) and `data-jelly*` attributes, never by importing ' +
        '`@/lib/jelly/physics|compose|arcs`. One soft body, one arc service — mounted once from ' +
        'hooks/useLiquidInteractions.ts (docs/plasmatic-jelly-system.md).',
    ).toEqual([]);
  });

  it('(a) the service-import allowlist stays honest', () => {
    for (const [file, reason] of SERVICE_IMPORT_ALLOW) {
      expect(
        SERVICE.test(code(file)),
        `${file} no longer imports a jelly service — remove its entry`,
      ).toBe(true);
      expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(40);
    }
  });

  /**
   * (b) Files outside lib/jelly and lib/liquid that have moved onto the shared frame driver and pointer hub, and are
   * therefore held to the same rule. One-directional the OTHER way: files come IN (the scope only grows), never out.
   */
  const SHARED_FRAME_CLIENTS = new Set([
    // #989 follow-up F2: the drag's settle spring is a driver (order 5) and its move/up/cancel come from the hub.
    // The hook subscribes to the hub; its settle spring (`createSettle`) lives beside it and registers the driver.
    'hooks/useFluidDrag.ts',
    'hooks/fluid-drag-settle.ts',
  ]);
  /** A client split over several files: the frame import and the hub import may sit in different files of it. */
  const SHARED_FRAME_CLIENT_GROUPS: string[][] = [['hooks/useFluidDrag.ts', 'hooks/fluid-drag-settle.ts']];
  const inJellyScope = (f: string) =>
    f.startsWith('lib/jelly/') || f.startsWith('lib/liquid/') || SHARED_FRAME_CLIENTS.has(f);

  it('(b) the shared-frame clients exist and use drive() + onJellyPointer', () => {
    for (const f of SHARED_FRAME_CLIENTS) {
      expect(SOURCES, `${f} moved — update SHARED_FRAME_CLIENTS`).toContain(f);
    }
    const groups = [
      ...SHARED_FRAME_CLIENT_GROUPS,
      ...[...SHARED_FRAME_CLIENTS]
        .filter((f) => !SHARED_FRAME_CLIENT_GROUPS.some((g) => g.includes(f)))
        .map((f) => [f]),
    ];
    for (const group of groups) {
      const all = group.map((f) => code(f)).join('\n');
      expect(all, `${group.join(' + ')} registers a driver on lib/jelly/frame.ts`).toMatch(
        /from\s+['"]@\/lib\/jelly\/frame['"]/,
      );
      expect(all, `${group.join(' + ')} subscribes through lib/jelly/pointer.ts`).toMatch(
        /from\s+['"]@\/lib\/jelly\/pointer['"]/,
      );
    }
  });

  /** (b) The one jelly frame owner (#989): every other service is a driver on it. */
  const JELLY_RAF_OWNERS = new Set(['lib/jelly/frame.ts']);

  it('(b) only the sanctioned owners run frames under lib/jelly, lib/liquid and the shared-frame clients', () => {
    const jelly = SOURCES.filter(inJellyScope);
    expect(jelly.length).toBeGreaterThan(20);
    const loops = jelly.filter((f) => code(f).includes('requestAnimationFrame'));
    expect(
      loops.filter((f) => !JELLY_RAF_OWNERS.has(f)).sort(),
      'A requestAnimationFrame under lib/jelly or lib/liquid outside lib/jelly/frame.ts is a second jelly loop. ' +
        'Register a driver with `drive(fn, { order })` from lib/jelly/frame.ts and `wake()` it when something starts ' +
        'to move (docs/plasmatic-jelly-system.md §8.1).',
    ).toEqual([]);
    expect(
      [...JELLY_RAF_OWNERS].filter((f) => !loops.includes(f)).sort(),
      'The frame driver no longer calls rAF (or moved) — update JELLY_RAF_OWNERS and raf-loop-allowlist.',
    ).toEqual([]);
  });

  /** (b) The one pointer hub (#989). One-directional: entries come out, they do not go in. */
  const JELLY_POINTER_OWNERS = new Set(['lib/jelly/pointer.ts']);
  const POINTER_LISTENER =
    /addEventListener\(\s*['"`]pointer[a-z]*['"`]|\.onpointer[a-z]+\s*=(?!=)/;

  it('(b) only lib/jelly/pointer.ts adds pointer listeners under lib/jelly, lib/liquid and the shared-frame clients', () => {
    const jelly = SOURCES.filter(inJellyScope);
    const listeners = jelly.filter((f) => POINTER_LISTENER.test(code(f)));
    expect(
      listeners.filter((f) => !JELLY_POINTER_OWNERS.has(f)).sort(),
      'A pointer listener under lib/jelly or lib/liquid outside the hub is a second fan-out. Subscribe with ' +
        '`onJellyPointer(type, fn)` from lib/jelly/pointer.ts (docs/plasmatic-jelly-system.md §8.1).',
    ).toEqual([]);
    const hub = code('lib/jelly/pointer.ts');
    expect(hub, 'the hub installs capture + passive listeners').toMatch(/capture:\s*true/);
    expect(hub).toMatch(/passive:\s*true/);
    expect(hub, 'the hub removes its listeners with the last subscriber').toMatch(
      /removeEventListener/,
    );
  });

  it('(c) the degraded-root predicate is declared once, in lib/jelly/tiers.ts', () => {
    const DEGRADED = ['.perf-lite'];
    const tiers = readFileSync(join(ROOT, 'lib/jelly/tiers.ts'), 'utf8');
    expect(tiers).toMatch(
      /export const DEGRADED_ROOT_SELECTOR = '\.perf-lite';/,
    );
    const offenders: string[] = [];
    for (const f of SOURCES) {
      if (f === 'lib/jelly/tiers.ts') continue;
      for (const m of code(f).matchAll(/(['"`])((?:(?!\1)[^\n\\])*)\1/g)) {
        if (DEGRADED.every((c) => m[2] === c)) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      'Import DEGRADED_ROOT_SELECTOR from @/lib/jelly/tiers (or call jellyOff / jellyMode) instead of re-spelling ' +
        'the degraded root list: a copy is how one service keeps drawing under a theme the others honour.',
    ).toEqual([]);
  });

  /**
   * (d) Frozen baseline: site-tier files that handle pointer input AND write a transform property by hand. Each is a
   * gesture surface whose motion IS the content (a swipe, a 3D turn, the globe), not decoration. One-directional.
   */
  const POINTER_TRANSFORM_BASELINE = new Set([
    'components/ui/swipe-row.tsx',
    'components/library/Book3DViewer.tsx',
    'components/radial/LiquidGlobe.tsx',
    'components/news/NewsHero.tsx',
  ]);
  const POINTER = /pointermove|pointerdown|onPointerMove|onPointerDown/;
  const WRITE =
    /\.style\.(?:transform|scale|translate)\s*=(?!=)|style\.setProperty\(\s*['"](?:transform|scale|translate)['"]/;

  it('(d) no new site-tier pointer handler deforms an element by hand', () => {
    const found = SOURCES.filter(
      (f) => isSiteTier(f) && !OWNS(f) && POINTER.test(code(f)) && WRITE.test(code(f)),
    ).sort();
    expect(
      found.filter((f) => !POINTER_TRANSFORM_BASELINE.has(f)),
      'Hover lean, press squash, release wobble and drag stretch come from lib/jelly/physics.ts, which composes ' +
        'with every other transform writer (02 §3.4). Mark the element (`data-jelly="card|control|drag"`) instead ' +
        'of writing style.transform/scale/translate from a pointer handler. Gesture input that IS the content ' +
        '(a swipe, a 3D turn) belongs to a game/app tier or needs a reviewed entry here.',
    ).toEqual([]);
    expect(
      [...POINTER_TRANSFORM_BASELINE].filter((f) => !found.includes(f)).sort(),
      'These no longer write transforms from pointer input — remove them from POINTER_TRANSFORM_BASELINE.',
    ).toEqual([]);
  });
});
