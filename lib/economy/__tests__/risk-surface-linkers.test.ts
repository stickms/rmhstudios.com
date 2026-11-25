import { existsSync, globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RISK_SURFACE_LINKERS } from '@/lib/economy/risk-surfaces';

// Self-exclusion hides the coin games from every menu, list, search and shortcut that points at them (W8). This scan
// keeps that true: a file that links a risk surface (`/predictions`, `/wager`, the Compete hub's wagers tab) must be
// listed in `RISK_SURFACE_LINKERS` with how it hides, and the listing must be honest about what the file calls.

/** A path or tab address in code: a quote, then the surface. Comments are stripped first. */
const LINKS_A_SURFACE = /['"`]\/(?:predictions|wager)(?![\w-])|tab=wagers/;
/** What a `hook` entry reads, and what a `server` entry decides with. */
const HOOK = /\buseRiskSurfacesHidden\b|\bisRiskSurfacePath\b/;
const SERVER = /\bfetchExclusionNotice\b|\breadExclusionNotice\b|\bisSelfExcluded\b|\bhideRiskSurfaces\b/;

const SCANNED = '{app,components,lib,features,hooks,stores,server}/**/*.{ts,tsx}';
/** The list itself, and generated or test files, are not linkers. */
const SKIPPED =
  /(^|\/)(__tests__|node_modules)\/|\.test\.|routeTree\.gen\.ts$|route-table\.server\.ts$|^lib\/economy\/risk-surfaces\.ts$/;

/**
 * Whole-line comments out (`//`, `/*`, ` * `): a mention in prose links nothing. A regex over `/* … *\/` would take a
 * string such as a glob pattern for the start of a comment and swallow real code, so the scan goes by line.
 */
const stripComments = (src: string) =>
  src
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
const read = (file: string) => stripComments(readFileSync(file, 'utf8'));

const sources = globSync(SCANNED)
  .map(String)
  .filter((f) => !SKIPPED.test(f))
  .sort();
const found = sources.filter((f) => LINKS_A_SURFACE.test(read(f)));
const listed = new Map(RISK_SURFACE_LINKERS.map((l) => [l.file, l]));

describe('risk-surface linkers', () => {
  it('finds the files it is meant to guard', () => {
    expect(sources.length).toBeGreaterThan(1000);
    expect(found.length).toBeGreaterThan(10);
  });

  it('lists every file that links a risk surface', () => {
    const missing = found.filter((f) => !listed.has(f));
    expect(
      missing,
      'These files link /predictions, /wager or the wagers tab without being listed in RISK_SURFACE_LINKERS ' +
        '(lib/economy/risk-surfaces.ts). Filter the link with useRiskSurfacesHidden(), decide it on the server, ' +
        'or list the file as exempt with the reason.',
    ).toEqual([]);
  });

  it('lists only files that exist, once each', () => {
    expect(RISK_SURFACE_LINKERS.filter((l) => !existsSync(l.file)).map((l) => l.file)).toEqual([]);
    expect(listed.size).toBe(RISK_SURFACE_LINKERS.length);
  });

  it('holds a hook entry to the hook and a server entry to the server check', () => {
    const hook = RISK_SURFACE_LINKERS.filter((l) => l.how === 'hook').filter((l) => !HOOK.test(read(l.file)));
    const server = RISK_SURFACE_LINKERS.filter((l) => l.how === 'server').filter((l) => !SERVER.test(read(l.file)));
    expect(hook.map((l) => l.file)).toEqual([]);
    expect(server.map((l) => l.file)).toEqual([]);
  });

  it('gives every exemption a reason, and drops one that no longer links anything', () => {
    for (const l of RISK_SURFACE_LINKERS) {
      if (l.how !== 'exempt') continue;
      expect(l.reason.trim().length, l.file).toBeGreaterThan(10);
    }
    const stale = RISK_SURFACE_LINKERS.filter((l) => l.how === 'exempt' && !found.includes(l.file));
    expect(stale.map((l) => l.file)).toEqual([]);
  });

  it('gives the shell its filter: every list that draws the nav reads the hook', () => {
    for (const file of [
      'components/shell/Sidebar.tsx',
      'components/shell/GlobeNav.tsx',
      'components/site/SidebarEditMode.tsx',
      'app/routes/_site/sections.tsx',
      'components/site/CommandPalette.tsx',
      'components/site/KeyboardShortcuts.tsx',
    ]) {
      expect(read(file), file).toMatch(/\buseRiskSurfacesHidden\b/);
    }
  });

  it('decides the pages on the server: each risk page calls the loader check, none renders its hub unguarded', () => {
    for (const file of [
      'app/routes/_site/predictions.tsx',
      'app/routes/_site/wager.$id.tsx',
      'app/routes/_site/compete.tsx',
    ]) {
      expect(read(file), file).toMatch(/\bfetchExclusionNotice\(\)/);
    }
  });
});
