/**
 * RMHVibe — curated package registry (client-safe; no server-only imports).
 *
 * Single source of truth for how a generated page's npm imports are resolved.
 * Generated vibe pages used to pull React and EVERY dependency from the
 * third-party CDN esm.sh at view time, which made pages render blank or throw
 * whenever esm.sh was slow, rate-limited, version-drifted, or handed back a
 * second React instance. This registry self-hosts the common case instead.
 *
 * Each bare import a page makes is classified into one of three tiers:
 *
 *  - 'inline'   — small utilities. esbuild resolves them from OUR node_modules
 *                 and bundles them straight into the page's JS (a few KB, zero
 *                 network at view time). They get NO importmap entry.
 *  - 'hosted'   — large libs and React itself. Pre-bundled once into
 *                 public/vibe-packages/ by scripts/build-vibe-packages.ts and
 *                 referenced via the page importmap from our OWN origin. React
 *                 (and react-dom) are hosted, never inlined, so every page —
 *                 and every React-consuming lib — shares one React instance.
 *  - 'fallback' — anything not in this registry. Left external and resolved via
 *                 esm.sh, exactly as before, so "import any npm package" keeps
 *                 working for the long tail.
 *
 * Both the build script and the server bundler (vibe-bundle.server.ts) read this
 * file, so the curated set and the pre-built assets can never drift apart.
 */

export type VibePackageTier = 'inline' | 'hosted';

export interface VibePackageEntry {
  tier: VibePackageTier;
  /**
   * Extra entry points the package exposes that need their own hosted bundle +
   * importmap entry (e.g. react-dom's `client`, react's `jsx-runtime`). The base
   * import is always built; these are additional, deep entry points pages import
   * directly. Subpaths NOT listed here fall through to esm.sh via the package's
   * trailing-slash importmap entry, so deep imports like
   * `three/examples/jsm/controls/OrbitControls.js` still resolve.
   */
  subpaths?: string[];
}

/**
 * Bump when the pre-built bundles in public/vibe-packages/ change, so browsers
 * (and the screenshot worker) fetch fresh assets instead of a stale cached copy.
 * Appended as `?r=<rev>` to every hosted importmap URL.
 */
export const VIBE_PACKAGES_REVISION = '1';

/**
 * The curated set. Keep this aligned with package.json: 'inline' packages must be
 * runtime `dependencies` (esbuild resolves them when a page is generated);
 * 'hosted' packages only need to be `devDependencies` (the build script bundles
 * them ahead of time). Add to it freely — it's the only place to touch.
 */
export const VIBE_PACKAGES: Record<string, VibePackageEntry> = {
  // ── hosted (large / React-singleton-sensitive) ───────────────────────────
  react: { tier: 'hosted', subpaths: ['jsx-runtime'] },
  'react-dom': { tier: 'hosted', subpaths: ['client'] },
  three: { tier: 'hosted' },
  '@react-three/fiber': { tier: 'hosted' },
  '@react-three/drei': { tier: 'hosted' },
  'framer-motion': { tier: 'hosted' },
  'pixi.js': { tier: 'hosted' },
  tone: { tier: 'hosted' },
  gsap: { tier: 'hosted' },
  d3: { tier: 'hosted' },
  'chart.js': { tier: 'hosted' },
  'matter-js': { tier: 'hosted' },
  konva: { tier: 'hosted' },
  p5: { tier: 'hosted' },

  // ── inline (small utilities, bundled into the page) ──────────────────────
  clsx: { tier: 'inline' },
  zustand: { tier: 'inline' },
  immer: { tier: 'inline' },
  nanoid: { tier: 'inline' },
  'date-fns': { tier: 'inline' },
  'lodash-es': { tier: 'inline' },
  zod: { tier: 'inline' },
  'tailwind-merge': { tier: 'inline' },
  uuid: { tier: 'inline' },
};

/** The base package name from a specifier: `@react-three/fiber/x` → `@react-three/fiber`. */
export function bareName(spec: string): string {
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/');
    return name ? `${scope}/${name}` : scope;
  }
  return spec.split('/')[0];
}

/**
 * Flat, filesystem-safe stem for a hosted package's bundle file. The build script
 * writes `public/vibe-packages/<stem>.js` and `<stem>-<subpath>.js`, and the
 * importmap points at the same names — so this is the one naming convention.
 * `@react-three/fiber` → `react-three__fiber`; `react` + 'jsx-runtime' → `react__jsx-runtime`.
 */
export function hostedStem(name: string, subpath?: string): string {
  const base = name.replace(/^@/, '').replace(/\//g, '__');
  return subpath ? `${base}__${subpath}` : base;
}

export type VibeImportClass =
  | { tier: 'inline'; name: string }
  | { tier: 'hosted'; name: string }
  | { tier: 'fallback'; name: string };

/** Classify a bare import specifier by its base package's tier. */
export function classifyImport(spec: string): VibeImportClass {
  const name = bareName(spec);
  const entry = VIBE_PACKAGES[name];
  if (!entry) return { tier: 'fallback', name };
  return { tier: entry.tier, name };
}

/** All hosted package names (for the build script + importmap assembly). */
export function hostedPackages(): Array<{ name: string; entry: VibePackageEntry }> {
  return Object.entries(VIBE_PACKAGES)
    .filter(([, e]) => e.tier === 'hosted')
    .map(([name, entry]) => ({ name, entry }));
}

/** All inline package names (must be present in node_modules at generation time). */
export function inlinePackages(): string[] {
  return Object.entries(VIBE_PACKAGES)
    .filter(([, e]) => e.tier === 'inline')
    .map(([name]) => name);
}
